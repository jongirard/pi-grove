import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import { readPlan } from "../parser/plan.js";
import { loadState } from "../orchestrator/persistence.js";
import {
  startServer,
  isServerRunning,
  type StateProvider,
} from "../server/index.js";
import { GROVE_DIR, DASHBOARD_DIST_PATH } from "../lib/constants.js";
import type { AgentMetrics, WorkStreamStatus } from "../lib/types.js";
import open from "open";

export async function groveCanopy(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const groveDir = join(ctx.cwd, GROVE_DIR);

  // Check if server already running
  const existing = isServerRunning(groveDir);
  if (existing.running && existing.port) {
    await open(`http://localhost:${existing.port}`);
    ctx.ui.notify(`Dashboard: http://localhost:${existing.port}`, "info");
    return;
  }

  // Start server without spawning agents (read-only dashboard)
  const plan = readPlan(groveDir);
  if (!plan) {
    ctx.ui.notify("No plan found. Run /grove init first.", "error");
    return;
  }

  // Load persisted state if available, otherwise derive from plan
  const savedState = loadState(groveDir) as { workStreams?: Record<string, { state: string; context: { metrics: AgentMetrics } }> } | null;

  const stateProvider: StateProvider = {
    getPlan: () => plan,
    getState: () => {
      const result: Record<string, { status: WorkStreamStatus; metrics: AgentMetrics }> = {};
      for (const [id, ws] of Object.entries(plan.workStreams)) {
        const saved = savedState?.workStreams?.[id];
        const emptyMetrics: AgentMetrics = { workStreamId: id, toolCalls: 0, tokensUsed: 0, estimatedCost: 0, elapsedMs: 0, currentFile: null };
        result[id] = {
          status: saved ? (saved.state as WorkStreamStatus) : ws.status,
          metrics: saved?.context?.metrics ?? emptyMetrics,
        };
      }
      return result;
    },
    handleCommand: () => {},
  };

  const server = await startServer(
    groveDir,
    DASHBOARD_DIST_PATH,
    stateProvider,
  );
  await open(`http://localhost:${server.port}`);
  ctx.ui.notify(`Dashboard: http://localhost:${server.port}`, "info");
}
