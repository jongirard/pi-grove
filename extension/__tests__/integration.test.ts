import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parsePlan, validatePlan, writePlan, readPlan } from "../parser/plan.js";
import { createOrchestrator } from "../orchestrator/machine.js";
import type { Orchestrator, OrchestratorListener } from "../orchestrator/machine.js";
import { saveState, loadState, resetState } from "../orchestrator/persistence.js";
import { startServer, isServerRunning } from "../server/index.js";
import type { StateProvider } from "../server/types.js";
import type { GrovePlan, GroveEvent, WorkStreamStatus, AgentMetrics } from "../lib/types.js";
import { STATE_FILE, SERVER_FILE } from "../lib/constants.js";

// ── Fixtures ────────────────────────────────────────────────────────

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const testPlanMd = fs.readFileSync(path.join(fixturesDir, "test-plan.md"), "utf-8");
const testPlanExpected: GrovePlan = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "test-plan-expected.json"), "utf-8"),
);

// ── Helpers ─────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "grove-test-"));
}

function mockLlmCall(): (prompt: string) => Promise<string> {
  return vi.fn(async (_prompt: string) => JSON.stringify(testPlanExpected));
}

async function fetchWithRetry(url: string, retries = 3, delayMs = 100): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url);
    } catch {
      if (i === retries - 1) throw new Error(`Failed to fetch ${url} after ${retries} retries`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("unreachable");
}

function emptyMetrics(workStreamId: string): AgentMetrics {
  return {
    workStreamId,
    toolCalls: 0,
    tokensUsed: 0,
    estimatedCost: 0,
    elapsedMs: 0,
    currentFile: null,
  };
}

// ── Test 1: Init flow (parsePlan + writePlan + readPlan) ───────────

describe("Init flow: parse, write, read", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses markdown into a valid GrovePlan via mock LLM", async () => {
    const llm = mockLlmCall();
    const plan = await parsePlan(testPlanMd, llm);

    expect(llm).toHaveBeenCalledOnce();
    expect(plan.name).toBe("Test Plan");
    expect(Object.keys(plan.workStreams)).toHaveLength(3);
    expect(plan.workStreams["1A"].name).toBe("Setup");
    expect(plan.workStreams["2A"].dependencies).toEqual(["1A"]);
    expect(plan.workStreams["2B"].dependencies).toEqual(["1A"]);
    expect(plan.timeSlots).toHaveLength(2);
    expect(plan.timeSlots[0].workStreamIds).toEqual(["1A"]);
    expect(plan.timeSlots[1].workStreamIds).toEqual(["2A", "2B"]);
  });

  it("round-trips plan through writePlan and readPlan", async () => {
    const llm = mockLlmCall();
    const plan = await parsePlan(testPlanMd, llm);

    writePlan(tmpDir, plan);
    const loaded = readPlan(tmpDir);

    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe(plan.name);
    expect(Object.keys(loaded!.workStreams)).toEqual(Object.keys(plan.workStreams));
    expect(loaded!.timeSlots).toEqual(plan.timeSlots);
  });

  it("returns null from readPlan when no plan exists", () => {
    const loaded = readPlan(tmpDir);
    expect(loaded).toBeNull();
  });

  it("validates the expected plan fixture", () => {
    expect(validatePlan(testPlanExpected)).toBe(true);
  });

  it("rejects an invalid plan", () => {
    expect(validatePlan({ name: "" })).toBe(false);
    expect(validatePlan(null)).toBe(false);
    expect(validatePlan({})).toBe(false);
  });
});

// ── Test 2: Orchestrator + dependency resolution ───────────────────

describe("Orchestrator: dependency resolution", () => {
  let orchestrator: Orchestrator;

  afterEach(() => {
    orchestrator?.dispose();
  });

  it("resolves dependencies across two time slots", () => {
    orchestrator = createOrchestrator(testPlanExpected);
    const snap1 = orchestrator.getSnapshot();

    // 1A has no deps → auto-promoted to "ready"
    expect(snap1.workStreams["1A"].state).toBe("ready");
    // 2A and 2B depend on 1A → still "pending"
    expect(snap1.workStreams["2A"].state).toBe("pending");
    expect(snap1.workStreams["2B"].state).toBe("pending");

    // Plant and complete 1A
    orchestrator.send("1A", { type: "PLANT" });
    expect(orchestrator.getSnapshot().workStreams["1A"].state).toBe("running");

    orchestrator.send("1A", { type: "AGENT_COMPLETE" });
    expect(orchestrator.getSnapshot().workStreams["1A"].state).toBe("done");

    // 2A and 2B should now be "ready"
    const snap2 = orchestrator.getSnapshot();
    expect(snap2.workStreams["2A"].state).toBe("ready");
    expect(snap2.workStreams["2B"].state).toBe("ready");

    // Plant and complete 2A
    orchestrator.send("2A", { type: "PLANT" });
    orchestrator.send("2A", { type: "AGENT_COMPLETE" });
    expect(orchestrator.getSnapshot().workStreams["2A"].state).toBe("done");

    // Plant and complete 2B
    orchestrator.send("2B", { type: "PLANT" });
    orchestrator.send("2B", { type: "AGENT_COMPLETE" });
    expect(orchestrator.getSnapshot().workStreams["2B"].state).toBe("done");

    // All done
    const snap3 = orchestrator.getSnapshot();
    for (const ws of Object.values(snap3.workStreams)) {
      expect(ws.state).toBe("done");
    }
  });
});

// ── Test 3: Completion flow with events ────────────────────────────

describe("Orchestrator: event emission", () => {
  let orchestrator: Orchestrator;
  const collectedEvents: GroveEvent[] = [];

  afterEach(() => {
    orchestrator?.dispose();
    collectedEvents.length = 0;
  });

  it("emits state_change events for each transition", () => {
    const listener: OrchestratorListener = (event) => {
      collectedEvents.push(event);
    };

    orchestrator = createOrchestrator(testPlanExpected, listener);

    // Initial subscription fires for each actor start + DEPENDENCIES_MET for 1A
    // Clear initial events to focus on manual transitions
    collectedEvents.length = 0;

    orchestrator.send("1A", { type: "PLANT" });
    orchestrator.send("1A", { type: "AGENT_COMPLETE" });

    const stateChanges = collectedEvents.filter(
      (e) => e.type === "state_change",
    ) as Array<{ type: "state_change"; workStreamId: string; status: WorkStreamStatus }>;

    // 1A: running → agent_complete → done (agent_complete auto-transitions to done)
    const changes1A = stateChanges.filter((e) => e.workStreamId === "1A");
    expect(changes1A.length).toBeGreaterThanOrEqual(2);
    expect(changes1A.some((e) => e.status === "running")).toBe(true);
    expect(changes1A.some((e) => e.status === "done")).toBe(true);

    // 2A and 2B should have received "ready" events from dependency resolution
    const changes2A = stateChanges.filter((e) => e.workStreamId === "2A");
    const changes2B = stateChanges.filter((e) => e.workStreamId === "2B");
    expect(changes2A.some((e) => e.status === "ready")).toBe(true);
    expect(changes2B.some((e) => e.status === "ready")).toBe(true);
  });
});

// ── Test 4: Persistence round-trip ─────────────────────────────────

describe("Persistence: save, load, reset", () => {
  let tmpDir: string;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    orchestrator?.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("round-trips orchestrator state through persistence", () => {
    orchestrator = createOrchestrator(testPlanExpected);
    orchestrator.send("1A", { type: "PLANT" });

    const snapshot = orchestrator.getSnapshot();
    saveState(tmpDir, snapshot);

    // Verify file exists
    const stateFile = path.join(tmpDir, STATE_FILE);
    expect(fs.existsSync(stateFile)).toBe(true);

    // Load and verify
    const loaded = loadState(tmpDir);
    expect(loaded).not.toBeNull();
    expect((loaded as any).workStreams["1A"].state).toBe("running");

    // Reset and verify gone
    resetState(tmpDir);
    expect(fs.existsSync(stateFile)).toBe(false);
    expect(loadState(tmpDir)).toBeNull();
  });
});

// ── Test 5: Server lifecycle ───────────────────────────────────────

describe("Server: lifecycle", () => {
  let tmpGroveDir: string;
  let tmpDashDir: string;

  beforeEach(() => {
    tmpGroveDir = makeTmpDir();
    tmpDashDir = makeTmpDir();
    // Write a minimal index.html so the server can serve something
    fs.writeFileSync(path.join(tmpDashDir, "index.html"), "<html></html>", "utf-8");
  });

  afterEach(() => {
    fs.rmSync(tmpGroveDir, { recursive: true, force: true });
    fs.rmSync(tmpDashDir, { recursive: true, force: true });
  });

  it("starts and stops the server correctly", async () => {
    const provider: StateProvider = {
      getPlan: () => testPlanExpected,
      getState: () => {
        const state: Record<string, { status: WorkStreamStatus; metrics: AgentMetrics }> = {};
        for (const [id, ws] of Object.entries(testPlanExpected.workStreams)) {
          state[id] = { status: ws.status, metrics: emptyMetrics(id) };
        }
        return state;
      },
      handleCommand: () => {},
    };

    const { port, close } = await startServer(tmpGroveDir, tmpDashDir, provider);
    expect(typeof port).toBe("number");
    expect(port).toBeGreaterThan(0);

    // Verify isServerRunning
    const runCheck = isServerRunning(tmpGroveDir);
    expect(runCheck.running).toBe(true);
    expect(runCheck.port).toBe(port);

    // Verify REST endpoints
    const planRes = await fetchWithRetry(`http://127.0.0.1:${port}/api/plan`);
    expect(planRes.ok).toBe(true);
    const planData = await planRes.json();
    expect(planData.name).toBe("Test Plan");

    const stateRes = await fetchWithRetry(`http://127.0.0.1:${port}/api/state`);
    expect(stateRes.ok).toBe(true);
    const stateData = await stateRes.json();
    expect(Object.keys(stateData)).toHaveLength(3);

    // Close and verify stopped
    close();

    // server.json should be cleaned up
    const serverFile = path.join(tmpGroveDir, SERVER_FILE);
    expect(fs.existsSync(serverFile)).toBe(false);

    const afterClose = isServerRunning(tmpGroveDir);
    expect(afterClose.running).toBe(false);
  });
});

// ── Test 6: Full init → plant → complete flow ──────────────────────

describe("Full flow: init, plant, complete, server", () => {
  let tmpGroveDir: string;
  let tmpDashDir: string;
  let orchestrator: Orchestrator;
  let closeServer: (() => void) | undefined;

  beforeEach(() => {
    tmpGroveDir = makeTmpDir();
    tmpDashDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDashDir, "index.html"), "<html></html>", "utf-8");
  });

  afterEach(() => {
    closeServer?.();
    orchestrator?.dispose();
    fs.rmSync(tmpGroveDir, { recursive: true, force: true });
    fs.rmSync(tmpDashDir, { recursive: true, force: true });
  });

  it("end-to-end: parse, orchestrate, serve, advance, verify", async () => {
    // Step 1: Parse plan
    const llm = mockLlmCall();
    const plan = await parsePlan(testPlanMd, llm);
    writePlan(tmpGroveDir, plan);

    // Step 2: Create orchestrator
    orchestrator = createOrchestrator(plan);

    // Step 3: Start server with StateProvider
    const provider: StateProvider = {
      getPlan: () => readPlan(tmpGroveDir),
      getState: () => {
        const snap = orchestrator.getSnapshot();
        const state: Record<string, { status: WorkStreamStatus; metrics: AgentMetrics }> = {};
        for (const [id, wsSnap] of Object.entries(snap.workStreams)) {
          state[id] = {
            status: wsSnap.state as WorkStreamStatus,
            metrics: wsSnap.context.metrics,
          };
        }
        return state;
      },
      handleCommand: () => {},
    };

    const { port, close } = await startServer(tmpGroveDir, tmpDashDir, provider);
    closeServer = close;

    // Step 4: Verify initial state via REST
    const stateRes1 = await fetchWithRetry(`http://127.0.0.1:${port}/api/state`);
    const stateData1 = await stateRes1.json();
    expect(stateData1["1A"].status).toBe("ready");
    expect(stateData1["2A"].status).toBe("pending");

    // Step 5: Advance work streams
    orchestrator.send("1A", { type: "PLANT" });
    orchestrator.send("1A", { type: "AGENT_COMPLETE" });

    // Step 6: Verify state propagates to REST API
    const stateRes2 = await fetchWithRetry(`http://127.0.0.1:${port}/api/state`);
    const stateData2 = await stateRes2.json();
    expect(stateData2["1A"].status).toBe("done");
    expect(stateData2["2A"].status).toBe("ready");
    expect(stateData2["2B"].status).toBe("ready");

    // Step 7: Complete remaining work streams
    orchestrator.send("2A", { type: "PLANT" });
    orchestrator.send("2A", { type: "AGENT_COMPLETE" });
    orchestrator.send("2B", { type: "PLANT" });
    orchestrator.send("2B", { type: "AGENT_COMPLETE" });

    const stateRes3 = await fetchWithRetry(`http://127.0.0.1:${port}/api/state`);
    const stateData3 = await stateRes3.json();
    for (const id of ["1A", "2A", "2B"]) {
      expect(stateData3[id].status).toBe("done");
    }
  });
});
