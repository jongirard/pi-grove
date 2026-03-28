import type { WSContext } from "hono/ws";
import type {
  GroveCommand,
  GroveEvent,
  StateProvider,
} from "./types.js";

/**
 * Manages WebSocket connections and broadcasts events to all connected clients.
 */
export class GroveBroadcaster {
  private clients = new Set<WSContext>();
  private stateProvider: StateProvider;
  private commandHandler: (cmd: GroveCommand) => void;

  constructor(
    stateProvider: StateProvider,
    commandHandler: (cmd: GroveCommand) => void,
  ) {
    this.stateProvider = stateProvider;
    this.commandHandler = commandHandler;
  }

  /**
   * Register a new WebSocket client and send initial state.
   */
  handleConnection(ws: WSContext): void {
    this.clients.add(ws);

    // Send current plan if available
    const plan = this.stateProvider.getPlan();
    if (plan) {
      const initEvent: GroveEvent = { type: "plan_loaded", plan };
      ws.send(JSON.stringify(initEvent));
    }

    // Send current state for each work stream
    const state = this.stateProvider.getState();
    for (const [wsId, wsState] of Object.entries(state)) {
      const stateEvent: GroveEvent = {
        type: "state_change",
        workStreamId: wsId,
        status: wsState.status,
      };
      ws.send(JSON.stringify(stateEvent));

      const metricsEvent: GroveEvent = {
        type: "metrics_update",
        workStreamId: wsId,
        metrics: wsState.metrics,
      };
      ws.send(JSON.stringify(metricsEvent));
    }
  }

  /**
   * Parse an incoming WebSocket message and route commands.
   */
  handleMessage(_ws: WSContext, data: string): void {
    try {
      const command = JSON.parse(data) as GroveCommand;
      this.commandHandler(command);
    } catch {
      // Ignore malformed messages
    }
  }

  /**
   * Remove a client from the connection set.
   */
  handleClose(ws: WSContext): void {
    this.clients.delete(ws);
  }

  /**
   * Broadcast an event to all connected clients.
   */
  broadcast(event: GroveEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      try {
        client.send(message);
      } catch {
        // Remove dead connections
        this.clients.delete(client);
      }
    }
  }

  /**
   * Return the number of currently connected clients.
   */
  getConnectionCount(): number {
    return this.clients.size;
  }
}
