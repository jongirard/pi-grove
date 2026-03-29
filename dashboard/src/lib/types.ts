// Plan schema

export interface GrovePlan {
  name: string;
  source: string;
  sourceFile?: string;
  workStreams: Record<string, WorkStream>;
  timeSlots: TimeSlot[];
}

export interface WorkStream {
  id: string;
  name: string;
  phase: number;
  dependencies: string[];
  brief: string;
  filesToCreate: string[];
  doneWhen: string;
  model?: string;
  status: WorkStreamStatus;
}

export type WorkStreamStatus =
  | "pending"
  | "ready"
  | "running"
  | "agent_complete"
  | "verifying"
  | "done"
  | "needs_attention";

export interface TimeSlot {
  slot: number;
  workStreamIds: string[];
  maxParallelAgents: number;
}

// Runtime state

export interface AgentMetrics {
  workStreamId: string;
  toolCalls: number;
  tokensUsed: number;
  estimatedCost: number;
  elapsedMs: number;
  currentFile: string | null;
}

// Events (extension → dashboard via WebSocket)

export type GroveEvent =
  | { type: "state_change"; workStreamId: string; status: WorkStreamStatus }
  | { type: "agent_event"; workStreamId: string; event: AgentToolEvent }
  | { type: "metrics_update"; workStreamId: string; metrics: AgentMetrics }
  | { type: "plan_loaded"; plan: GrovePlan }
  | { type: "slot_ready"; slot: number }
  | { type: "error"; workStreamId?: string; message: string };

export interface AgentToolEvent {
  timestamp: number;
  toolName: string;
  input: string;
  output?: string;
  status: "started" | "completed" | "failed";
}

// Commands (dashboard → extension via WebSocket)

export type GroveCommand =
  | { type: "plant_slot"; slot: number }
  | { type: "steer_agent"; workStreamId: string; message: string }
  | { type: "rerun_agent"; workStreamId: string; message?: string }
  | { type: "mark_done"; workStreamId: string }
  | { type: "set_branch_mode"; enabled: boolean };

// Server config

export interface ServerConfig {
  port: number;
  pid: number;
  startedAt: string;
}
