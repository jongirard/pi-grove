import { setup, createActor, assign, type SnapshotFrom } from "xstate";
import type {
  GrovePlan,
  WorkStream,
  WorkStreamStatus,
  AgentMetrics,
  GroveEvent,
} from "../lib/types.js";

// ── Work-stream machine context & events ────────────────────────────

export interface WorkStreamContext {
  workStream: WorkStream;
  metrics: AgentMetrics;
}

export interface WorkStreamInput {
  workStream: WorkStream;
}

export type WorkStreamEvent =
  | { type: "DEPENDENCIES_MET" }
  | { type: "PLANT" }
  | { type: "AGENT_COMPLETE" }
  | { type: "VERIFICATION_PASSED" }
  | { type: "VERIFICATION_FAILED" }
  | { type: "HUMAN_OVERRIDE" }
  | { type: "RERUN" }
  | { type: "STEER"; message: string }
  | { type: "METRICS_UPDATE"; metrics: Partial<AgentMetrics> };

// ── Helper: fresh metrics ───────────────────────────────────────────

function emptyMetrics(workStreamId: string): AgentMetrics {
  return {
    workStreamId,
    toolCalls: 0,
    tokensUsed: 0,
    estimatedCost: 0,
    elapsedMs: 0,
    currentFile: null,
  };
}

// ── Default work stream (for standalone / test usage) ───────────────

const defaultWorkStream: WorkStream = {
  id: "__default__",
  name: "Default",
  phase: 0,
  dependencies: [],
  brief: "",
  filesToCreate: [],
  doneWhen: "",
  status: "pending",
};

// ── XState v5 machine definition ────────────────────────────────────

export const workStreamMachine = setup({
  types: {
    context: {} as WorkStreamContext,
    events: {} as WorkStreamEvent,
    input: {} as WorkStreamInput,
  },
}).createMachine({
  id: "workStream",
  context: ({ input }) => ({
    workStream: input?.workStream ?? defaultWorkStream,
    metrics: emptyMetrics(input?.workStream?.id ?? "__default__"),
  }),
  initial: "pending",
  states: {
    pending: {
      on: {
        DEPENDENCIES_MET: "ready",
      },
    },
    ready: {
      on: {
        PLANT: "running",
      },
    },
    running: {
      on: {
        AGENT_COMPLETE: "agent_complete",
        METRICS_UPDATE: {
          actions: assign({
            metrics: ({ context, event }) => ({
              ...context.metrics,
              ...event.metrics,
            }),
          }),
        },
        STEER: {
          // Stays in running — steer is advisory
        },
      },
    },
    agent_complete: {
      // MVP pass-through: skip verification, go straight to done
      always: "done",
    },
    verifying: {
      on: {
        VERIFICATION_PASSED: "done",
        VERIFICATION_FAILED: "needs_attention",
      },
    },
    needs_attention: {
      on: {
        RERUN: "running",
        HUMAN_OVERRIDE: "done",
      },
    },
    done: {
      type: "final",
    },
  },
});

// ── Orchestrator types ──────────────────────────────────────────────

export type WorkStreamActor = ReturnType<typeof createActor<typeof workStreamMachine>>;
export type WorkStreamSnapshot = SnapshotFrom<typeof workStreamMachine>;

export type OrchestratorListener = (event: GroveEvent) => void;

export interface OrchestratorSnapshot {
  workStreams: Record<string, {
    state: string;
    context: WorkStreamContext;
  }>;
}

export interface Orchestrator {
  send(workStreamId: string, event: WorkStreamEvent): void;
  getSnapshot(): OrchestratorSnapshot;
  subscribe(listener: OrchestratorListener): () => void;
  dispose(): void;
}

// ── Helper: extract state string from actor ─────────────────────────

function actorStateName(actor: WorkStreamActor): string {
  const snap = actor.getSnapshot();
  if (typeof snap.value === "string") return snap.value;
  return Object.keys(snap.value as Record<string, unknown>)[0];
}

// ── createOrchestrator ──────────────────────────────────────────────

export function createOrchestrator(
  plan: GrovePlan,
  listener?: OrchestratorListener,
): Orchestrator {
  const actors = new Map<string, WorkStreamActor>();
  const listeners = new Set<OrchestratorListener>();
  if (listener) listeners.add(listener);

  function emit(event: GroveEvent) {
    for (const l of listeners) {
      l(event);
    }
  }

  function allDepsDone(ws: WorkStream): boolean {
    return ws.dependencies.every((depId) => {
      const depActor = actors.get(depId);
      return depActor && actorStateName(depActor) === "done";
    });
  }

  function onWorkStreamDone(doneId: string) {
    for (const [id, actor] of actors) {
      const ws = plan.workStreams[id];
      if (!ws) continue;
      if (actorStateName(actor) === "pending" && ws.dependencies.includes(doneId)) {
        if (allDepsDone(ws)) {
          actor.send({ type: "DEPENDENCIES_MET" });
        }
      }
    }
  }

  // Create and wire up an actor per work stream
  for (const [id, ws] of Object.entries(plan.workStreams)) {
    const actor = createActor(workStreamMachine, {
      input: { workStream: ws },
      id: `ws-${id}`,
    });

    actor.subscribe((snapshot) => {
      const stateName = typeof snapshot.value === "string"
        ? snapshot.value
        : Object.keys(snapshot.value as Record<string, unknown>)[0];

      emit({
        type: "state_change",
        workStreamId: id,
        status: stateName as WorkStreamStatus,
      });

      if (snapshot.status === "done") {
        onWorkStreamDone(id);
      }
    });

    actors.set(id, actor);
  }

  // Start all actors
  for (const actor of actors.values()) {
    actor.start();
  }

  // Auto-fire DEPENDENCIES_MET for work streams with no dependencies
  for (const [id, ws] of Object.entries(plan.workStreams)) {
    if (ws.dependencies.length === 0) {
      const actor = actors.get(id);
      if (actor) {
        actor.send({ type: "DEPENDENCIES_MET" });
      }
    }
  }

  return {
    send(workStreamId: string, event: WorkStreamEvent) {
      const actor = actors.get(workStreamId);
      if (!actor) {
        emit({ type: "error", workStreamId, message: `Unknown work stream: ${workStreamId}` });
        return;
      }
      actor.send(event);
    },

    getSnapshot(): OrchestratorSnapshot {
      const workStreams: OrchestratorSnapshot["workStreams"] = {};
      for (const [id, actor] of actors) {
        const snap = actor.getSnapshot();
        const stateName = typeof snap.value === "string"
          ? snap.value
          : Object.keys(snap.value as Record<string, unknown>)[0];
        workStreams[id] = {
          state: stateName,
          context: snap.context,
        };
      }
      return { workStreams };
    },

    subscribe(l: OrchestratorListener) {
      listeners.add(l);
      return () => { listeners.delete(l); };
    },

    dispose() {
      for (const actor of actors.values()) {
        actor.stop();
      }
      actors.clear();
      listeners.clear();
    },
  };
}
