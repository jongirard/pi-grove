import type {
  AgentMetrics,
  GroveCommand,
  GrovePlan,
  WorkStreamStatus,
} from "../lib/types.js";

/**
 * Interface that the server uses to query orchestrator state.
 * Implemented by the orchestrator and passed into routes / broadcaster.
 */
export interface StateProvider {
  getPlan(): GrovePlan | null;
  getState(): Record<
    string,
    { status: WorkStreamStatus; metrics: AgentMetrics }
  >;
  handleCommand(command: GroveCommand): void;
}

// Re-export the types that server modules need
export type {
  AgentMetrics,
  GroveCommand,
  GroveEvent,
  GrovePlan,
  ServerConfig,
  WorkStreamStatus,
} from "../lib/types.js";
