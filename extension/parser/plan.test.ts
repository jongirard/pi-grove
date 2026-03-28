import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { parsePlan, validatePlan, writePlan, readPlan } from "./plan.js";
import type { GrovePlan } from "../lib/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fixturesDir = new URL("./fixtures/", import.meta.url).pathname;

const sampleMarkdown = readFileSync(join(fixturesDir, "sample-plan.md"), "utf-8");
const expectedPlan: GrovePlan = JSON.parse(
  readFileSync(join(fixturesDir, "expected-plan.json"), "utf-8"),
);

function makeTempDir(): string {
  const dir = join(tmpdir(), `grove-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// parsePlan
// ---------------------------------------------------------------------------

describe("parsePlan", () => {
  it("extracts work streams, dependencies, and time slots from fixture", async () => {
    const mockLlm = async (_prompt: string) => JSON.stringify(expectedPlan);
    const plan = await parsePlan(sampleMarkdown, mockLlm);

    expect(plan.name).toBe("Grove Lite");
    expect(plan.source).toBe("llm-extracted");
    expect(Object.keys(plan.workStreams)).toHaveLength(3);
    expect(plan.timeSlots).toHaveLength(2);

    // Check dependencies
    expect(plan.workStreams["ws-1a"].dependencies).toEqual([]);
    expect(plan.workStreams["ws-2a"].dependencies).toEqual(["ws-1a"]);
    expect(plan.workStreams["ws-2b"].dependencies).toEqual(["ws-1a"]);

    // All statuses are "pending"
    for (const ws of Object.values(plan.workStreams)) {
      expect(ws.status).toBe("pending");
    }
  });

  it("handles LLM response wrapped in markdown code fences", async () => {
    const fencedResponse = "```json\n" + JSON.stringify(expectedPlan) + "\n```";
    const mockLlm = async (_prompt: string) => fencedResponse;
    const plan = await parsePlan(sampleMarkdown, mockLlm);

    expect(plan.name).toBe("Grove Lite");
    expect(Object.keys(plan.workStreams)).toHaveLength(3);
  });

  it("handles LLM response with plain code fences (no json tag)", async () => {
    const fencedResponse = "```\n" + JSON.stringify(expectedPlan) + "\n```";
    const mockLlm = async (_prompt: string) => fencedResponse;
    const plan = await parsePlan(sampleMarkdown, mockLlm);

    expect(plan.name).toBe("Grove Lite");
  });

  it("throws on invalid JSON from LLM", async () => {
    const mockLlm = async (_prompt: string) => "this is not json at all";
    await expect(parsePlan(sampleMarkdown, mockLlm)).rejects.toThrow(
      "Failed to parse LLM response as JSON",
    );
  });

  it("throws when LLM returns structurally invalid plan", async () => {
    const mockLlm = async (_prompt: string) => JSON.stringify({ name: "bad", source: "x" });
    await expect(parsePlan(sampleMarkdown, mockLlm)).rejects.toThrow(
      "LLM response did not produce a valid GrovePlan",
    );
  });

  it("normalises all statuses to pending even if LLM returns other values", async () => {
    const planWithRunning = structuredClone(expectedPlan);
    planWithRunning.workStreams["ws-1a"].status = "running";
    planWithRunning.workStreams["ws-2a"].status = "done";

    // validatePlan accepts any valid status, so this should pass validation
    // then parsePlan normalises to "pending"
    const mockLlm = async (_prompt: string) => JSON.stringify(planWithRunning);
    const plan = await parsePlan(sampleMarkdown, mockLlm);

    for (const ws of Object.values(plan.workStreams)) {
      expect(ws.status).toBe("pending");
    }
  });
});

// ---------------------------------------------------------------------------
// validatePlan
// ---------------------------------------------------------------------------

describe("validatePlan", () => {
  it("accepts a valid plan", () => {
    expect(validatePlan(expectedPlan)).toBe(true);
  });

  it("rejects null", () => {
    expect(validatePlan(null)).toBe(false);
  });

  it("rejects plan with no name", () => {
    const bad = { ...expectedPlan, name: "" };
    expect(validatePlan(bad)).toBe(false);
  });

  it("rejects plan with empty workStreams", () => {
    const bad = { ...expectedPlan, workStreams: {} };
    expect(validatePlan(bad)).toBe(false);
  });

  it("rejects plan with empty timeSlots", () => {
    const bad = { ...expectedPlan, timeSlots: [] };
    expect(validatePlan(bad)).toBe(false);
  });

  it("rejects plan with mismatched work stream key/id", () => {
    const bad = structuredClone(expectedPlan);
    bad.workStreams["ws-1a"].id = "ws-WRONG";
    expect(validatePlan(bad)).toBe(false);
  });

  it("rejects plan with broken dependency reference", () => {
    const bad = structuredClone(expectedPlan);
    bad.workStreams["ws-2a"].dependencies = ["ws-nonexistent"];
    expect(validatePlan(bad)).toBe(false);
  });

  it("rejects plan with time slot referencing nonexistent work stream", () => {
    const bad = structuredClone(expectedPlan);
    bad.timeSlots[0].workStreamIds = ["ws-ghost"];
    expect(validatePlan(bad)).toBe(false);
  });

  it("rejects plan with missing required fields on work stream", () => {
    const bad = structuredClone(expectedPlan);
    // Remove brief field
    delete (bad.workStreams["ws-1a"] as unknown as Record<string, unknown>).brief;
    expect(validatePlan(bad)).toBe(false);
  });

  it("rejects plan with missing doneWhen on work stream", () => {
    const bad = structuredClone(expectedPlan);
    delete (bad.workStreams["ws-1a"] as unknown as Record<string, unknown>).doneWhen;
    expect(validatePlan(bad)).toBe(false);
  });

  it("detects circular dependencies (A -> B -> C -> A)", () => {
    const circular: GrovePlan = {
      name: "Circular",
      source: "test",
      workStreams: {
        a: {
          id: "a",
          name: "A",
          phase: 1,
          dependencies: ["c"],
          brief: "A",
          filesToCreate: [],
          doneWhen: "done",
          status: "pending",
        },
        b: {
          id: "b",
          name: "B",
          phase: 1,
          dependencies: ["a"],
          brief: "B",
          filesToCreate: [],
          doneWhen: "done",
          status: "pending",
        },
        c: {
          id: "c",
          name: "C",
          phase: 1,
          dependencies: ["b"],
          brief: "C",
          filesToCreate: [],
          doneWhen: "done",
          status: "pending",
        },
      },
      timeSlots: [{ slot: 1, workStreamIds: ["a", "b", "c"], maxParallelAgents: 1 }],
    };
    // All have dependencies, so no entry point => invalid
    // Also has a cycle
    expect(validatePlan(circular)).toBe(false);
  });

  it("rejects plan where no work stream has zero dependencies", () => {
    const noEntry: GrovePlan = {
      name: "NoEntry",
      source: "test",
      workStreams: {
        a: {
          id: "a",
          name: "A",
          phase: 1,
          dependencies: ["b"],
          brief: "A",
          filesToCreate: [],
          doneWhen: "done",
          status: "pending",
        },
        b: {
          id: "b",
          name: "B",
          phase: 1,
          dependencies: ["a"],
          brief: "B",
          filesToCreate: [],
          doneWhen: "done",
          status: "pending",
        },
      },
      timeSlots: [{ slot: 1, workStreamIds: ["a", "b"], maxParallelAgents: 1 }],
    };
    expect(validatePlan(noEntry)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// writePlan / readPlan roundtrip
// ---------------------------------------------------------------------------

describe("writePlan / readPlan", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("roundtrips a plan through write and read", () => {
    writePlan(tmpDir, expectedPlan);
    const loaded = readPlan(tmpDir);
    expect(loaded).toEqual(expectedPlan);
  });

  it("returns null when no plan file exists", () => {
    expect(readPlan(tmpDir)).toBeNull();
  });

  it("creates the directory if it does not exist", () => {
    const nested = join(tmpDir, "a", "b", "c");
    writePlan(nested, expectedPlan);
    const loaded = readPlan(nested);
    expect(loaded).toEqual(expectedPlan);
  });

  it("overwrites an existing plan file", () => {
    writePlan(tmpDir, expectedPlan);

    const updated = structuredClone(expectedPlan);
    updated.name = "Updated Plan";
    writePlan(tmpDir, updated);

    const loaded = readPlan(tmpDir);
    expect(loaded?.name).toBe("Updated Plan");
  });
});
