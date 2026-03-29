import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentSession, AgentSessionEvent, AgentSessionEventListener } from "@mariozechner/pi-coding-agent";
import type { Orchestrator } from "./machine.js";
import type { GroveBroadcaster } from "../server/ws.js";
import type { WorkStream, GroveEvent } from "../lib/types.js";
import type { WorkStreamEvent } from "./machine.js";
import { AgentSpawner, buildAgentSystemPrompt } from "./spawner.js";
import { bridgeAgentEvents } from "./agent-bridge.js";
import { createMarkCompleteTool } from "../tools/mark-complete.js";

// ── Helpers ────────────────────────────────────────────────────────────

function makeWorkStream(overrides: Partial<WorkStream> = {}): WorkStream {
  return {
    id: "ws-1",
    name: "Auth Module",
    phase: 1,
    dependencies: [],
    brief: "Implement the auth module with JWT support",
    filesToCreate: ["src/auth.ts", "src/auth.test.ts"],
    doneWhen: "All auth tests pass",
    status: "ready",
    ...overrides,
  };
}

/** Minimal mock of AgentSession that records calls and lets us fire events. */
function createMockSession() {
  const listeners: AgentSessionEventListener[] = [];

  const session = {
    prompt: vi.fn().mockResolvedValue(undefined),
    sendUserMessage: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    subscribe: vi.fn((listener: AgentSessionEventListener) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    }),
    state: { messages: [] },
  } as unknown as AgentSession;

  function emit(event: AgentSessionEvent) {
    for (const l of listeners) l(event);
  }

  return { session, emit, listeners };
}

function createMockOrchestrator() {
  const sent: Array<{ workStreamId: string; event: WorkStreamEvent }> = [];
  const orchestrator: Orchestrator = {
    send: vi.fn((workStreamId: string, event: WorkStreamEvent) => {
      sent.push({ workStreamId, event });
    }),
    getSnapshot: vi.fn(() => ({ workStreams: {} })),
    subscribe: vi.fn(() => () => {}),
    dispose: vi.fn(),
  };
  return { orchestrator, sent };
}

function createMockBroadcaster() {
  const events: GroveEvent[] = [];
  const broadcaster = {
    broadcast: vi.fn((event: GroveEvent) => {
      events.push(event);
    }),
  } as unknown as GroveBroadcaster;
  return { broadcaster, events };
}

// ── Mock Pi SDK ────────────────────────────────────────────────────────

// We capture the mock session so tests can interact with it
let latestMockSession: ReturnType<typeof createMockSession>;

vi.mock("@mariozechner/pi-coding-agent", () => ({
  createAgentSession: vi.fn(async () => {
    latestMockSession = createMockSession();
    return { session: latestMockSession.session, extensionsResult: {} };
  }),
  codingTools: [],
}));

// ── Tests ──────────────────────────────────────────────────────────────

describe("buildAgentSystemPrompt", () => {
  it("includes work stream brief, filesToCreate, and doneWhen", () => {
    const ws = makeWorkStream();
    const prompt = buildAgentSystemPrompt(ws);

    expect(prompt).toContain(ws.brief);
    expect(prompt).toContain("src/auth.ts");
    expect(prompt).toContain("src/auth.test.ts");
    expect(prompt).toContain(ws.doneWhen);
    expect(prompt).toContain("mark_complete");
  });

  it("includes working directory section when cwd differs from projectRoot", () => {
    const ws = makeWorkStream({ cwd: "/other/repo" });
    const prompt = buildAgentSystemPrompt(ws, undefined, "/main/project");

    expect(prompt).toContain("Working Directory");
    expect(prompt).toContain("/other/repo");
    expect(prompt).toContain("/main/project");
  });

  it("omits working directory section when cwd matches projectRoot", () => {
    const ws = makeWorkStream({ cwd: "/same/path" });
    const prompt = buildAgentSystemPrompt(ws, undefined, "/same/path");

    expect(prompt).not.toContain("Working Directory");
  });

  it("omits working directory section when cwd is not set", () => {
    const ws = makeWorkStream();
    const prompt = buildAgentSystemPrompt(ws, undefined, "/main/project");

    expect(prompt).not.toContain("Working Directory");
  });

  it("omits files section when filesToCreate is empty", () => {
    const ws = makeWorkStream({ filesToCreate: [] });
    const prompt = buildAgentSystemPrompt(ws);

    expect(prompt).not.toContain("Files to create");
    expect(prompt).toContain(ws.brief);
  });
});

describe("createMarkCompleteTool", () => {
  it("calls onComplete callback with summary when executed", async () => {
    const onComplete = vi.fn();
    const tool = createMarkCompleteTool("ws-1", onComplete);

    expect(tool.name).toBe("mark_complete");

    const result = await tool.execute(
      "call-1",
      { summary: "Done with auth" },
      undefined,
      undefined,
      {} as any,
    );

    expect(onComplete).toHaveBeenCalledWith("Done with auth");
    expect(result.content[0]).toEqual({
      type: "text",
      text: "Work stream ws-1 marked as complete.",
    });
  });
});

describe("AgentSpawner", () => {
  let spawner: AgentSpawner;
  let orchestrator: ReturnType<typeof createMockOrchestrator>["orchestrator"];
  let sent: ReturnType<typeof createMockOrchestrator>["sent"];
  let broadcaster: ReturnType<typeof createMockBroadcaster>["broadcaster"];
  let broadcastedEvents: ReturnType<typeof createMockBroadcaster>["events"];

  beforeEach(() => {
    vi.clearAllMocks();
    ({ orchestrator, sent } = createMockOrchestrator());
    ({ broadcaster, events: broadcastedEvents } = createMockBroadcaster());
    spawner = new AgentSpawner(orchestrator, broadcaster, "/tmp/test-project");
  });

  it("spawnForWorkStream creates session and sends PLANT event", async () => {
    const ws = makeWorkStream();
    await spawner.spawnForWorkStream(ws);

    // PLANT should have been sent
    expect(orchestrator.send).toHaveBeenCalledWith("ws-1", { type: "PLANT" });

    // Session should have received a prompt
    expect(latestMockSession.session.prompt).toHaveBeenCalledTimes(1);
    const promptArg = (latestMockSession.session.prompt as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(promptArg).toContain("Implement the auth module");
  });

  it("steerAgent sends message to running session", async () => {
    const ws = makeWorkStream();
    await spawner.spawnForWorkStream(ws);

    await spawner.steerAgent("ws-1", "Focus on the JWT refresh flow");

    expect(latestMockSession.session.sendUserMessage).toHaveBeenCalledWith(
      "Focus on the JWT refresh flow",
      { deliverAs: "steer" },
    );
  });

  it("steerAgent broadcasts error when no agent exists", async () => {
    await spawner.steerAgent("nonexistent", "hello");

    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        workStreamId: "nonexistent",
      }),
    );
  });

  it("stopAgent aborts and disposes session", async () => {
    const ws = makeWorkStream();
    await spawner.spawnForWorkStream(ws);

    await spawner.stopAgent("ws-1");

    expect(latestMockSession.session.abort).toHaveBeenCalled();
    expect(latestMockSession.session.dispose).toHaveBeenCalled();
    expect(spawner.getRunningAgents().size).toBe(0);
  });

  it("stopAllAgents stops all running agents", async () => {
    await spawner.spawnForWorkStream(makeWorkStream({ id: "a" }));
    const sessionA = latestMockSession;

    await spawner.spawnForWorkStream(makeWorkStream({ id: "b" }));
    const sessionB = latestMockSession;

    expect(spawner.getRunningAgents().size).toBe(2);

    await spawner.stopAllAgents();

    expect(sessionA.session.abort).toHaveBeenCalled();
    expect(sessionB.session.abort).toHaveBeenCalled();
    expect(spawner.getRunningAgents().size).toBe(0);
  });

  it("rerunAgent stops existing then spawns fresh", async () => {
    const ws = makeWorkStream();
    await spawner.spawnForWorkStream(ws);
    const firstSession = latestMockSession;

    await spawner.rerunAgent("ws-1", "New instructions");

    // First session should have been aborted
    expect(firstSession.session.abort).toHaveBeenCalled();
    expect(firstSession.session.dispose).toHaveBeenCalled();

    // RERUN event should have been sent
    expect(orchestrator.send).toHaveBeenCalledWith("ws-1", { type: "RERUN" });

    // A new session should exist
    expect(spawner.getRunningAgents().size).toBe(1);

    // New prompt should include the override message
    const promptArg = (latestMockSession.session.prompt as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(promptArg).toContain("New instructions");
  });

  it("getRunningAgents returns map of sessions", async () => {
    await spawner.spawnForWorkStream(makeWorkStream({ id: "x" }));
    const agents = spawner.getRunningAgents();

    expect(agents.size).toBe(1);
    expect(agents.has("x")).toBe(true);
  });
});

describe("bridgeAgentEvents", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let orchestrator: ReturnType<typeof createMockOrchestrator>["orchestrator"];
  let broadcaster: ReturnType<typeof createMockBroadcaster>["broadcaster"];
  let broadcastedEvents: ReturnType<typeof createMockBroadcaster>["events"];
  let unsubscribe: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSession = createMockSession();
    ({ orchestrator } = createMockOrchestrator());
    ({ broadcaster, events: broadcastedEvents } = createMockBroadcaster());
    unsubscribe = bridgeAgentEvents(
      mockSession.session,
      "ws-bridge",
      broadcaster,
      orchestrator,
    );
  });

  afterEach(() => {
    unsubscribe();
    vi.useRealTimers();
  });

  it("maps tool_execution_start to agent_event (started)", () => {
    mockSession.emit({
      type: "tool_execution_start",
      toolCallId: "tc-1",
      toolName: "read",
      args: { file_path: "/foo/bar.ts" },
    });

    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent_event",
        workStreamId: "ws-bridge",
        event: expect.objectContaining({
          toolName: "read",
          status: "started",
        }),
      }),
    );
  });

  it("maps tool_execution_end to agent_event (completed)", () => {
    mockSession.emit({
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "bash",
      result: "ok",
      isError: false,
    });

    const agentEvents = broadcastedEvents.filter((e) => e.type === "agent_event");
    expect(agentEvents.length).toBeGreaterThanOrEqual(1);

    const last = agentEvents[agentEvents.length - 1];
    expect(last.type === "agent_event" && last.event.status).toBe("completed");
  });

  it("maps tool_execution_end with isError to agent_event (failed)", () => {
    mockSession.emit({
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "bash",
      result: "error",
      isError: true,
    });

    const agentEvents = broadcastedEvents.filter((e) => e.type === "agent_event");
    const last = agentEvents[agentEvents.length - 1];
    expect(last.type === "agent_event" && last.event.status).toBe("failed");
  });

  it("tracks toolCalls count in metrics", () => {
    mockSession.emit({
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "read",
      result: "content",
      isError: false,
    });

    mockSession.emit({
      type: "tool_execution_end",
      toolCallId: "tc-2",
      toolName: "edit",
      result: "ok",
      isError: false,
    });

    // After each tool_execution_end, metrics are broadcast
    const metricsEvents = broadcastedEvents.filter((e) => e.type === "metrics_update");
    expect(metricsEvents.length).toBe(2);

    const lastMetrics = metricsEvents[1];
    if (lastMetrics.type === "metrics_update") {
      expect(lastMetrics.metrics.toolCalls).toBe(2);
    }
  });

  it("extracts currentFile from read/edit/write tool args", () => {
    mockSession.emit({
      type: "tool_execution_start",
      toolCallId: "tc-1",
      toolName: "edit",
      args: { file_path: "/src/auth.ts" },
    });

    // Trigger a tool end to force metrics broadcast
    mockSession.emit({
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "edit",
      result: "ok",
      isError: false,
    });

    const metricsEvents = broadcastedEvents.filter((e) => e.type === "metrics_update");
    expect(metricsEvents.length).toBeGreaterThan(0);

    const lastMetrics = metricsEvents[metricsEvents.length - 1];
    if (lastMetrics.type === "metrics_update") {
      expect(lastMetrics.metrics.currentFile).toBe("/src/auth.ts");
    }
  });

  it("broadcasts metrics periodically via timer", () => {
    // Advance past the interval
    vi.advanceTimersByTime(5_000);

    const metricsEvents = broadcastedEvents.filter((e) => e.type === "metrics_update");
    expect(metricsEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("unsubscribe cleans up listeners and timer", () => {
    unsubscribe();

    // Clear captured events
    broadcastedEvents.length = 0;

    mockSession.emit({
      type: "tool_execution_start",
      toolCallId: "tc-1",
      toolName: "read",
      args: {},
    });

    vi.advanceTimersByTime(10_000);

    // No new events should be broadcast (the timer event won't fire)
    // Note: the session listener is also removed, so no agent_event either
    expect(broadcastedEvents.length).toBe(0);
  });
});
