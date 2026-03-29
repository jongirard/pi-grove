import { Hono } from "hono";
import type { GroveCommand, StateProvider } from "./types.js";

/**
 * Create the REST API routes for the Grove dashboard.
 */
export function createRoutes(stateProvider: StateProvider): Hono {
  const api = new Hono();

  /**
   * GET /api/plan — return the current plan, or null if none loaded.
   */
  api.get("/api/plan", (c) => {
    const plan = stateProvider.getPlan();
    if (!plan) return c.json(null);

    // Merge current orchestrator statuses into the plan so the dashboard
    // never sees stale "pending" values from the on-disk plan.json.
    try {
      const state = stateProvider.getState();
      const mergedWorkStreams = { ...plan.workStreams };
      for (const [wsId, wsState] of Object.entries(state)) {
        if (mergedWorkStreams[wsId]) {
          mergedWorkStreams[wsId] = {
            ...mergedWorkStreams[wsId],
            status: wsState.status,
          };
        }
      }
      return c.json({ ...plan, workStreams: mergedWorkStreams });
    } catch {
      // Fall back to raw plan if state merge fails
      return c.json(plan);
    }
  });

  /**
   * GET /api/state — return all work stream statuses and metrics.
   */
  api.get("/api/state", (c) => {
    const state = stateProvider.getState();
    return c.json(state);
  });

  /**
   * POST /api/command — receive a GroveCommand from the dashboard.
   */
  api.post("/api/command", async (c) => {
    try {
      const command = (await c.req.json()) as GroveCommand;
      stateProvider.handleCommand(command);
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false, error: "Invalid command" }, 400);
    }
  });

  return api;
}
