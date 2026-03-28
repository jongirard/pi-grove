import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createActor, getInitialSnapshot } from "xstate";
import { createOrchestrator, workStreamMachine } from "./machine.js";
import { saveState, loadState, resetState } from "./persistence.js";
import type { GrovePlan, WorkStream, GroveEvent } from "../lib/types.js";

// ── Helpers ─────────────────────────────────────────────────────────

function makeWorkStream(overrides: Partial<WorkStream> = {}): WorkStream {
  return {
    id: "ws-1",
    name: "Work Stream 1",
    phase: 1,
    dependencies: [],
    brief: "Test brief",
    filesToCreate: [],
    doneWhen: "Tests pass",
    status: "pending",
    ...overrides,
  };
}

function makePlan(workStreams: Record<string, WorkStream>): GrovePlan {
  return {
    name: "test-plan",
    source: "test",
    workStreams,
    timeSlots: [],
  };
}

function createTestActor(ws?: Partial<WorkStream>) {
  return createActor(workStreamMachine, {
    input: { workStream: makeWorkStream(ws) },
  });
}

// ── 1. Work stream machine transitions ──────────────────────────────

describe("workStreamMachine", () => {
  it("transitions pending -> ready -> running -> agent_complete -> done", () => {
    const actor = createTestActor();
    actor.start();

    expect(actor.getSnapshot().value).toBe("pending");

    actor.send({ type: "DEPENDENCIES_MET" });
    expect(actor.getSnapshot().value).toBe("ready");

    actor.send({ type: "PLANT" });
    expect(actor.getSnapshot().value).toBe("running");

    actor.send({ type: "AGENT_COMPLETE" });
    // agent_complete auto-transitions to done via always
    expect(actor.getSnapshot().value).toBe("done");
    expect(actor.getSnapshot().status).toBe("done");

    actor.stop();
  });

  it("ignores invalid transitions (e.g. PLANT while pending)", () => {
    const actor = createTestActor();
    actor.start();

    actor.send({ type: "PLANT" });
    expect(actor.getSnapshot().value).toBe("pending");

    actor.stop();
  });
});

// ── 2. needs_attention transitions ──────────────────────────────────

describe("needs_attention transitions", () => {
  function createActorInState(stateName: string) {
    // Create and start an actor to get a proper initial snapshot structure,
    // then get its persisted snapshot and modify the state value.
    const tmpActor = createActor(workStreamMachine, {
      input: { workStream: makeWorkStream() },
    });
    tmpActor.start();
    const persisted = tmpActor.getPersistedSnapshot() as any;
    tmpActor.stop();

    // Patch the state value to the desired state
    persisted.value = stateName;
    persisted.status = "active";

    return createActor(workStreamMachine, {
      input: { workStream: makeWorkStream() },
      snapshot: persisted,
    });
  }

  it("RERUN transitions needs_attention -> running", () => {
    const actor = createActorInState("needs_attention");
    actor.start();

    expect(actor.getSnapshot().value).toBe("needs_attention");

    actor.send({ type: "RERUN" });
    expect(actor.getSnapshot().value).toBe("running");

    actor.stop();
  });

  it("HUMAN_OVERRIDE transitions needs_attention -> done", () => {
    const actor = createActorInState("needs_attention");
    actor.start();

    actor.send({ type: "HUMAN_OVERRIDE" });
    expect(actor.getSnapshot().value).toBe("done");

    actor.stop();
  });
});

// ── 3. Orchestrator dependency resolution ───────────────────────────

describe("createOrchestrator", () => {
  it("auto-fires DEPENDENCIES_MET for work streams with no deps", () => {
    const plan = makePlan({
      a: makeWorkStream({ id: "a", dependencies: [] }),
    });

    const orch = createOrchestrator(plan);
    const snap = orch.getSnapshot();

    expect(snap.workStreams.a.state).toBe("ready");

    orch.dispose();
  });

  it("fires DEPENDENCIES_MET on downstream when upstream finishes", () => {
    const plan = makePlan({
      a: makeWorkStream({ id: "a", dependencies: [] }),
      b: makeWorkStream({ id: "b", dependencies: ["a"] }),
    });

    const events: GroveEvent[] = [];
    const orch = createOrchestrator(plan, (e) => events.push(e));

    expect(orch.getSnapshot().workStreams.a.state).toBe("ready");
    expect(orch.getSnapshot().workStreams.b.state).toBe("pending");

    // Move a through to done
    orch.send("a", { type: "PLANT" });
    orch.send("a", { type: "AGENT_COMPLETE" });

    expect(orch.getSnapshot().workStreams.a.state).toBe("done");
    expect(orch.getSnapshot().workStreams.b.state).toBe("ready");

    orch.dispose();
  });

  it("waits for ALL deps before firing DEPENDENCIES_MET", () => {
    const plan = makePlan({
      a: makeWorkStream({ id: "a", dependencies: [] }),
      b: makeWorkStream({ id: "b", dependencies: [] }),
      c: makeWorkStream({ id: "c", dependencies: ["a", "b"] }),
    });

    const orch = createOrchestrator(plan);

    // Finish only a
    orch.send("a", { type: "PLANT" });
    orch.send("a", { type: "AGENT_COMPLETE" });

    expect(orch.getSnapshot().workStreams.c.state).toBe("pending");

    // Finish b
    orch.send("b", { type: "PLANT" });
    orch.send("b", { type: "AGENT_COMPLETE" });

    expect(orch.getSnapshot().workStreams.c.state).toBe("ready");

    orch.dispose();
  });

  it("emits state_change events to listeners", () => {
    const plan = makePlan({
      a: makeWorkStream({ id: "a", dependencies: [] }),
    });

    const events: GroveEvent[] = [];
    const orch = createOrchestrator(plan, (e) => events.push(e));

    orch.send("a", { type: "PLANT" });

    const stateChanges = events.filter((e) => e.type === "state_change");
    expect(stateChanges.length).toBeGreaterThan(0);

    orch.dispose();
  });
});

// ── 4. Metrics update ───────────────────────────────────────────────

describe("metrics update", () => {
  it("merges partial metrics via METRICS_UPDATE in orchestrator", () => {
    const plan = makePlan({
      a: makeWorkStream({ id: "a", dependencies: [] }),
    });

    const orch = createOrchestrator(plan);

    orch.send("a", { type: "PLANT" });
    expect(orch.getSnapshot().workStreams.a.state).toBe("running");

    orch.send("a", { type: "METRICS_UPDATE", metrics: { toolCalls: 5, tokensUsed: 1200 } });

    const metrics = orch.getSnapshot().workStreams.a.context.metrics;
    expect(metrics.toolCalls).toBe(5);
    expect(metrics.tokensUsed).toBe(1200);
    expect(metrics.estimatedCost).toBe(0);
    expect(metrics.elapsedMs).toBe(0);

    orch.dispose();
  });
});

// ── 5. Persistence ──────────────────────────────────────────────────

describe("persistence", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grove-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saves and loads state correctly", () => {
    const snapshot = {
      workStreams: {
        a: { state: "running", context: { workStream: makeWorkStream({ id: "a" }) } },
      },
    };

    saveState(tmpDir, snapshot);
    const loaded = loadState(tmpDir);

    expect(loaded).toEqual(snapshot);
  });

  it("returns null when no state file exists", () => {
    const result = loadState(tmpDir);
    expect(result).toBeNull();
  });

  it("resets state by deleting the file", () => {
    saveState(tmpDir, { test: true });
    expect(loadState(tmpDir)).not.toBeNull();

    resetState(tmpDir);
    expect(loadState(tmpDir)).toBeNull();
  });

  it("round-trips orchestrator snapshot through persistence", () => {
    const plan = makePlan({
      a: makeWorkStream({ id: "a", dependencies: [] }),
      b: makeWorkStream({ id: "b", dependencies: ["a"] }),
    });

    const orch = createOrchestrator(plan);

    orch.send("a", { type: "PLANT" });

    const snapshot = orch.getSnapshot();
    saveState(tmpDir, snapshot);

    const restored = loadState(tmpDir) as typeof snapshot;
    expect(restored.workStreams.a.state).toBe("running");
    expect(restored.workStreams.b.state).toBe("pending");

    orch.dispose();
  });
});
