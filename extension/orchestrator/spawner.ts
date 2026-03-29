import {
  createAgentSession,
  codingTools,
  type AgentSession,
} from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import type { WorkStream } from "../lib/types.js";
import type { Orchestrator } from "./machine.js";
import type { GroveBroadcaster } from "../server/ws.js";
import { bridgeAgentEvents } from "./agent-bridge.js";
import { createMarkCompleteTool } from "../tools/mark-complete.js";

// ── Types ──────────────────────────────────────────────────────────────

interface RunningAgent {
  session: AgentSession;
  unsubscribe: () => void;
  workStream: WorkStream;
}

// ── System prompt builder ──────────────────────────────────────────────

/**
 * Build the system prompt injected into the agent session for a given
 * work stream.  This gives the agent clear context about what it should
 * accomplish, which files it owns, and how to signal completion.
 */
export function buildAgentSystemPrompt(workStream: WorkStream, context?: string): string {
  const lines = [
    `You are an autonomous coding agent working on work stream "${workStream.name}" (id: ${workStream.id}).`,
    "",
    "## Brief",
    workStream.brief,
    "",
  ];

  if (context) {
    lines.push("## Project Context");
    lines.push("The following is the original plan document. Use it for design rationale, implementation details, and cross-cutting concerns.");
    lines.push("");
    lines.push(context);
    lines.push("");
  }

  if (workStream.filesToCreate.length > 0) {
    lines.push("## Files to create / modify");
    for (const f of workStream.filesToCreate) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }

  lines.push("## Done when");
  lines.push(workStream.doneWhen);
  lines.push("");
  lines.push(
    "## Completion",
    "When you have finished ALL tasks described above, call the `mark_complete` tool with a brief summary of what you accomplished.",
    "Do NOT call mark_complete until every task is done.",
  );

  return lines.join("\n");
}

// ── AgentSpawner ───────────────────────────────────────────────────────

/**
 * Manages Pi agent sessions for work streams.
 *
 * Responsibilities:
 * - Spawn a new agent session per work stream
 * - Wire up the event bridge so metrics / tool events flow to the dashboard
 * - Handle steering messages, stop, and re-run requests
 */
export class AgentSpawner {
  private agents = new Map<string, RunningAgent>();

  constructor(
    private orchestrator: Orchestrator,
    private broadcaster: GroveBroadcaster,
    private projectRoot: string,
    private sourceFile?: string,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Spawn a Pi agent for `workStream`.
   *
   * 1. Build system prompt & mark_complete tool
   * 2. Create agent session via Pi SDK
   * 3. Wire event bridge
   * 4. Transition work stream to "running" (PLANT)
   * 5. Send the work stream brief as the initial prompt
   */
  async spawnForWorkStream(workStream: WorkStream): Promise<void> {
    // If there is already a running agent for this stream, stop it first.
    if (this.agents.has(workStream.id)) {
      await this.stopAgent(workStream.id);
    }

    const context = this.sourceFile && existsSync(this.sourceFile)
      ? readFileSync(this.sourceFile, "utf-8") : undefined;
    const systemPrompt = buildAgentSystemPrompt(workStream, context);

    const markCompleteTool = createMarkCompleteTool(
      workStream.id,
      (_summary: string) => {
        this.orchestrator.send(workStream.id, { type: "AGENT_COMPLETE" });
        // Stop the event bridge (clears the metrics timer so elapsedMs freezes)
        const agent = this.agents.get(workStream.id);
        if (agent) agent.unsubscribe();
      },
    );

    const { session } = await createAgentSession({
      cwd: this.projectRoot,
      tools: codingTools,
      customTools: [markCompleteTool],
    });

    // Wire event bridge
    const unsubscribe = bridgeAgentEvents(
      session,
      workStream.id,
      this.broadcaster,
      this.orchestrator,
    );

    this.agents.set(workStream.id, { session, unsubscribe, workStream });

    // Transition the work stream to running
    this.orchestrator.send(workStream.id, { type: "PLANT" });

    // Kick off the agent with the brief as first prompt.
    // We prepend the system-level context so the agent has full awareness
    // even if the SDK's own system prompt differs.
    await session.prompt(`${systemPrompt}\n\n---\n\nPlease begin.`);
  }

  /**
   * Send a steering message to a running agent.
   */
  async steerAgent(workStreamId: string, message: string): Promise<void> {
    const entry = this.agents.get(workStreamId);
    if (!entry) {
      this.broadcaster.broadcast({
        type: "error",
        workStreamId,
        message: `No running agent for work stream: ${workStreamId}`,
      });
      return;
    }

    await entry.session.sendUserMessage(message, { deliverAs: "steer" });
  }

  /**
   * Abort and dispose a running agent.
   */
  async stopAgent(workStreamId: string): Promise<void> {
    const entry = this.agents.get(workStreamId);
    if (!entry) return;

    entry.unsubscribe();
    await entry.session.abort();
    entry.session.dispose();
    this.agents.delete(workStreamId);
  }

  /**
   * Stop every running agent.
   */
  async stopAllAgents(): Promise<void> {
    const ids = [...this.agents.keys()];
    await Promise.all(ids.map((id) => this.stopAgent(id)));
  }

  /**
   * Stop an existing agent (if any) and spawn a fresh one.
   * Optionally override the brief with `message`.
   */
  async rerunAgent(workStreamId: string, message?: string): Promise<void> {
    const existing = this.agents.get(workStreamId);
    if (!existing) {
      this.broadcaster.broadcast({
        type: "error",
        workStreamId,
        message: `No agent to rerun for work stream: ${workStreamId}`,
      });
      return;
    }

    const ws = { ...existing.workStream };
    if (message) {
      ws.brief = message;
    }

    await this.stopAgent(workStreamId);

    // The orchestrator machine expects RERUN when in needs_attention state,
    // but after stop the state depends on where it was. We send RERUN so
    // the machine can transition back to running if it is in needs_attention.
    this.orchestrator.send(workStreamId, { type: "RERUN" });

    await this.spawnForWorkStream(ws);
  }

  /**
   * Return the map of currently running agent sessions (read-only access).
   */
  getRunningAgents(): Map<string, AgentSession> {
    const result = new Map<string, AgentSession>();
    for (const [id, entry] of this.agents) {
      result.set(id, entry.session);
    }
    return result;
  }
}
