import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import { readPlan } from "../parser/plan.js";
import {
  createOrchestrator,
} from "../orchestrator/machine.js";
import { saveState, loadState } from "../orchestrator/persistence.js";
import { AgentSpawner } from "../orchestrator/spawner.js";
import {
  startServer,
  isServerRunning,
  type StateProvider,
} from "../server/index.js";
import { GroveGitManager } from "../git/commits.js";
import { GROVE_DIR, DASHBOARD_DIST_PATH } from "../lib/constants.js";
import type {
  GroveCommand,
  WorkStreamStatus,
  AgentMetrics,
} from "../lib/types.js";
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

  // Read plan
  const plan = readPlan(groveDir);
  if (!plan) {
    ctx.ui.notify("No plan found. Run /grove init first.", "error");
    return;
  }

  // Create orchestrator and restore saved state
  const orchestrator = createOrchestrator(plan);

  // Create git manager
  const gitManager = new GroveGitManager(ctx.cwd);

  // Spawner (assigned after broadcaster is available)
  let spawner: AgentSpawner;

  // Build StateProvider with full command handling
  const stateProvider: StateProvider = {
    getPlan: () => readPlan(groveDir),
    getState: () => {
      const currentPlan = readPlan(groveDir);
      if (!currentPlan) return {};
      const snap = orchestrator.getSnapshot();
      const result: Record<string, { status: WorkStreamStatus; metrics: AgentMetrics }> = {};
      for (const [id, ws] of Object.entries(snap.workStreams)) {
        result[id] = {
          status: ws.state as WorkStreamStatus,
          metrics: ws.context.metrics,
        };
      }
      return result;
    },
    handleCommand: (cmd: GroveCommand) => {
      switch (cmd.type) {
        case "plant_slot": {
          const slot = plan.timeSlots.find((s) => s.slot === cmd.slot);
          if (slot) {
            for (const wsId of slot.workStreamIds) {
              const ws = plan.workStreams[wsId];
              if (ws) spawner.spawnForWorkStream(ws);
            }
          }
          break;
        }
        case "steer_agent":
          spawner.steerAgent(cmd.workStreamId, cmd.message);
          break;
        case "rerun_agent":
          spawner.rerunAgent(cmd.workStreamId, cmd.message);
          break;
        case "mark_done":
          orchestrator.send(cmd.workStreamId, { type: "HUMAN_OVERRIDE" });
          break;
        case "set_branch_mode":
          gitManager.setBranchMode(cmd.enabled);
          break;
      }
    },
  };

  // Start server
  const server = await startServer(groveDir, DASHBOARD_DIST_PATH, stateProvider);
  const { port, broadcaster } = server;

  // Initialize spawner now that broadcaster is available
  spawner = new AgentSpawner(orchestrator, broadcaster, ctx.cwd);

  // Subscribe to orchestrator events
  orchestrator.subscribe((event) => {
    broadcaster.broadcast(event);
    saveState(groveDir, orchestrator.getSnapshot());

    if (event.type === "state_change" && event.status === "done") {
      const ws = plan.workStreams[event.workStreamId];
      if (ws) gitManager.onWorkStreamDone(ws);
    }
  });

  // Open browser
  await open(`http://localhost:${port}`);
  ctx.ui.notify(`Dashboard: http://localhost:${port}`, "info");
  ctx.ui.setStatus("grove", "Grove running");
}
