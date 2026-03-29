import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import { readPlan } from "../parser/plan.js";
import {
  createOrchestrator,
  type Orchestrator,
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

export async function grovePlant(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const groveDir = join(ctx.cwd, GROVE_DIR);

  // 1. Read plan
  const plan = readPlan(groveDir);
  if (!plan) {
    ctx.ui.notify("No plan found. Run /grove init first.", "error");
    return;
  }

  // 2. Create orchestrator
  const orchestrator = createOrchestrator(plan);

  // 3. Create git manager
  const gitManager = new GroveGitManager(ctx.cwd);

  // 6. Create spawner (declared here, used in stateProvider and later)
  let spawner: AgentSpawner;

  // 4. Build StateProvider bridging orchestrator to server
  const stateProvider: StateProvider = {
    getPlan: () => plan,
    getState: () => {
      const snap = orchestrator.getSnapshot();
      const result: Record<
        string,
        { status: WorkStreamStatus; metrics: AgentMetrics }
      > = {};
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
          // Find work streams in the requested slot and spawn each
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

  // 5. Start server
  const server = await startServer(groveDir, DASHBOARD_DIST_PATH, stateProvider);
  const { port, broadcaster, close: closeServer } = server;

  // Initialize spawner now that we have broadcaster
  spawner = new AgentSpawner(orchestrator, broadcaster, ctx.cwd, plan.sourceFile);

  // 7. Subscribe to orchestrator events
  orchestrator.subscribe((event) => {
    broadcaster.broadcast(event);

    // Auto-save state on changes
    saveState(groveDir, orchestrator.getSnapshot());

    // Auto-commit when work stream reaches done
    if (event.type === "state_change" && event.status === "done") {
      const ws = plan.workStreams[event.workStreamId];
      if (ws) gitManager.onWorkStreamDone(ws);
    }
  });

  // 8. Open browser
  await open(`http://localhost:${port}`);
  ctx.ui.notify(`Grove dashboard: http://localhost:${port}`, "info");

  // 9. Find next ready slot and spawn agents
  const snap = orchestrator.getSnapshot();
  for (const slot of plan.timeSlots) {
    const allReady = slot.workStreamIds.every((id) => {
      const wsSnap = snap.workStreams[id];
      return wsSnap && wsSnap.state === "ready";
    });
    if (allReady) {
      if (gitManager.getBranchMode()) {
        await gitManager.prepareBranchForSlot(slot.slot);
      }
      for (const wsId of slot.workStreamIds) {
        const ws = plan.workStreams[wsId];
        if (ws) await spawner.spawnForWorkStream(ws);
      }
      broadcaster.broadcast({ type: "slot_ready", slot: slot.slot });
      break; // only spawn first ready slot
    }
  }

  // 10. Set status
  ctx.ui.setStatus("grove", "Grove running");
}
