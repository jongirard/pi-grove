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
    return c.json(plan ?? null);
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
