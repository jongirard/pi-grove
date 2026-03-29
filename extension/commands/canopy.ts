import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import { readPlan } from "../parser/plan.js";
import {
  startServer,
  isServerRunning,
  type StateProvider,
} from "../server/index.js";
import { GROVE_DIR, DASHBOARD_DIST_PATH } from "../lib/constants.js";
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
  const stateProvider: StateProvider = {
    getPlan: () => plan,
    getState: () => ({}),
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
