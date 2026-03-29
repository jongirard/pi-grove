import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import { readPlan } from "../parser/plan.js";
import { loadState } from "../orchestrator/persistence.js";
import { GROVE_DIR, STATUS_LABELS } from "../lib/constants.js";
import type { WorkStreamStatus } from "../lib/types.js";

export async function groveStatus(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const groveDir = join(ctx.cwd, GROVE_DIR);
  const plan = readPlan(groveDir);
  if (!plan) {
    ctx.ui.notify("No plan found. Run /grove init first.", "error");
    return;
  }

  // Read saved state if available
  const state = loadState(groveDir) as {
    workStreams?: Record<string, { state?: string }>;
  } | null;

  // Build status summary text
  const lines: string[] = [`Plan: ${plan.name}`, ""];

  for (const slot of plan.timeSlots) {
    lines.push(`Phase ${slot.slot}:`);
    for (const wsId of slot.workStreamIds) {
      const ws = plan.workStreams[wsId];
      if (!ws) continue;

      // Use persisted state if available, otherwise fall back to plan status
      let currentStatus: WorkStreamStatus = ws.status;
      if (state?.workStreams?.[wsId]?.state) {
        currentStatus = state.workStreams[wsId].state as WorkStreamStatus;
      }

      const label = STATUS_LABELS[currentStatus] ?? currentStatus;
      lines.push(`  ${wsId}: ${ws.name} — ${label}`);
    }
    lines.push("");
  }

  ctx.ui.notify(lines.join("\n"), "info");
}
