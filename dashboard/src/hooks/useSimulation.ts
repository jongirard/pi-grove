import { useState, useEffect, useRef, useCallback } from "react";
import type {
  GrovePlan,
  GroveEvent,
  GroveCommand,
  WorkStreamStatus,
  AgentToolEvent,
} from "../lib/types.js";

// ---------------------------------------------------------------------------
// Mock plan data
// ---------------------------------------------------------------------------

const MOCK_PLAN: GrovePlan = {
  name: "E-commerce Platform Redesign",
  source: "plan.md",
  workStreams: {
    auth: {
      id: "auth",
      name: "Auth service refactor",
      phase: 1,
      dependencies: [],
      brief: "Migrate auth to JWT with refresh tokens, add OAuth2 providers",
      filesToCreate: [
        "src/auth/jwt.ts",
        "src/auth/oauth.ts",
        "src/auth/middleware.ts",
        "src/auth/__tests__/jwt.test.ts",
      ],
      doneWhen: "All auth tests pass and OAuth flow works end-to-end",
      model: "claude-sonnet-4-6",
      status: "ready",
    },
    schema: {
      id: "schema",
      name: "Database schema migration",
      phase: 1,
      dependencies: [],
      brief:
        "Add user_profiles, orders, and inventory tables with proper indexes",
      filesToCreate: [
        "migrations/001_user_profiles.sql",
        "migrations/002_orders.sql",
        "migrations/003_inventory.sql",
        "src/db/schema.ts",
      ],
      doneWhen: "Migrations run cleanly on fresh DB, schema types generated",
      model: "claude-sonnet-4-6",
      status: "ready",
    },
    ui: {
      id: "ui",
      name: "Product catalog UI",
      phase: 1,
      dependencies: [],
      brief:
        "Build responsive product grid, detail page, and search with filters",
      filesToCreate: [
        "src/components/ProductGrid.tsx",
        "src/components/ProductDetail.tsx",
        "src/components/SearchBar.tsx",
        "src/components/FilterPanel.tsx",
      ],
      doneWhen: "Components render, search works, responsive on mobile",
      model: "claude-opus-4-6",
      status: "ready",
    },
    cart: {
      id: "cart",
      name: "Shopping cart & checkout",
      phase: 2,
      dependencies: ["auth", "schema"],
      brief: "Cart state management, checkout flow with Stripe integration",
      filesToCreate: [
        "src/cart/store.ts",
        "src/cart/CheckoutForm.tsx",
        "src/cart/stripe.ts",
        "src/cart/__tests__/store.test.ts",
      ],
      doneWhen: "Cart persists across sessions, test checkout succeeds",
      model: "claude-opus-4-6",
      status: "pending",
    },
    api: {
      id: "api",
      name: "REST API endpoints",
      phase: 2,
      dependencies: ["schema"],
      brief: "CRUD endpoints for products, orders, and user profiles",
      filesToCreate: [
        "src/api/products.ts",
        "src/api/orders.ts",
        "src/api/users.ts",
        "src/api/__tests__/products.test.ts",
      ],
      doneWhen: "All endpoints respond correctly, validation in place",
      model: "claude-sonnet-4-6",
      status: "pending",
    },
    e2e: {
      id: "e2e",
      name: "End-to-end test suite",
      phase: 3,
      dependencies: ["cart", "api", "ui"],
      brief: "Playwright tests covering signup, browse, add-to-cart, checkout",
      filesToCreate: [
        "e2e/signup.spec.ts",
        "e2e/browse.spec.ts",
        "e2e/checkout.spec.ts",
        "playwright.config.ts",
      ],
      doneWhen: "All E2E tests pass in CI",
      model: "claude-sonnet-4-6",
      status: "pending",
    },
  },
  timeSlots: [
    { slot: 1, workStreamIds: ["auth", "schema", "ui"], maxParallelAgents: 3 },
    { slot: 2, workStreamIds: ["cart", "api"], maxParallelAgents: 2 },
    { slot: 3, workStreamIds: ["e2e"], maxParallelAgents: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Simulated tool activity per work stream
// ---------------------------------------------------------------------------

interface ToolScript {
  toolName: string;
  input: string;
  output?: string;
  durationMs: number;
}

const TOOL_SCRIPTS: Record<string, ToolScript[]> = {
  auth: [
    { toolName: "Read", input: "src/auth/index.ts", output: "// existing auth module…", durationMs: 400 },
    { toolName: "Glob", input: "src/auth/**/*.ts", output: "3 files matched", durationMs: 300 },
    { toolName: "Read", input: "package.json", output: '{ "dependencies": { "jsonwebtoken": "^9.0" } }', durationMs: 350 },
    { toolName: "Write", input: "src/auth/jwt.ts", durationMs: 800 },
    { toolName: "Write", input: "src/auth/oauth.ts", durationMs: 900 },
    { toolName: "Write", input: "src/auth/middleware.ts", durationMs: 700 },
    { toolName: "Edit", input: "src/auth/index.ts → re-export new modules", durationMs: 500 },
    { toolName: "Write", input: "src/auth/__tests__/jwt.test.ts", durationMs: 1000 },
    { toolName: "Bash", input: "bun test src/auth", output: "Tests: 12 passed, 12 total", durationMs: 2000 },
    { toolName: "Read", input: "src/auth/jwt.ts", output: "// verified JWT implementation", durationMs: 400 },
  ],
  schema: [
    { toolName: "Read", input: "src/db/connection.ts", output: "// postgres pool config", durationMs: 300 },
    { toolName: "Grep", input: "CREATE TABLE", output: "No existing migrations found", durationMs: 400 },
    { toolName: "Write", input: "migrations/001_user_profiles.sql", durationMs: 600 },
    { toolName: "Write", input: "migrations/002_orders.sql", durationMs: 700 },
    { toolName: "Write", input: "migrations/003_inventory.sql", durationMs: 650 },
    { toolName: "Write", input: "src/db/schema.ts", durationMs: 800 },
    { toolName: "Bash", input: "bun run db:migrate", output: "3 migrations applied successfully", durationMs: 1500 },
    { toolName: "Bash", input: "bun run db:generate-types", output: "Types generated: UserProfile, Order, Inventory", durationMs: 1200 },
  ],
  ui: [
    { toolName: "Read", input: "src/components/index.ts", output: "// component barrel export", durationMs: 350 },
    { toolName: "Read", input: "tailwind.config.ts", output: "// tailwind configuration", durationMs: 300 },
    { toolName: "Glob", input: "src/components/**/*.tsx", output: "8 files matched", durationMs: 250 },
    { toolName: "Write", input: "src/components/ProductGrid.tsx", durationMs: 1100 },
    { toolName: "Write", input: "src/components/SearchBar.tsx", durationMs: 800 },
    { toolName: "Write", input: "src/components/FilterPanel.tsx", durationMs: 900 },
    { toolName: "Write", input: "src/components/ProductDetail.tsx", durationMs: 1200 },
    { toolName: "Edit", input: "src/components/index.ts → add exports", durationMs: 400 },
    { toolName: "Bash", input: "bun run typecheck", output: "No errors found", durationMs: 1800 },
    { toolName: "Read", input: "src/components/ProductGrid.tsx", output: "// verified responsive grid", durationMs: 350 },
  ],
  cart: [
    { toolName: "Read", input: "src/auth/jwt.ts", output: "// JWT token handling", durationMs: 300 },
    { toolName: "Read", input: "src/db/schema.ts", output: "// DB schema types", durationMs: 350 },
    { toolName: "Write", input: "src/cart/store.ts", durationMs: 900 },
    { toolName: "Write", input: "src/cart/stripe.ts", durationMs: 1000 },
    { toolName: "Write", input: "src/cart/CheckoutForm.tsx", durationMs: 1300 },
    { toolName: "Write", input: "src/cart/__tests__/store.test.ts", durationMs: 800 },
    { toolName: "Bash", input: "bun test src/cart", output: "Tests: 8 passed, 8 total", durationMs: 1500 },
    { toolName: "Edit", input: "src/cart/stripe.ts → fix webhook signature", durationMs: 600 },
    { toolName: "Bash", input: "bun test src/cart", output: "Tests: 9 passed, 9 total", durationMs: 1400 },
  ],
  api: [
    { toolName: "Read", input: "src/db/schema.ts", output: "// DB schema types", durationMs: 300 },
    { toolName: "Grep", input: "app.get|app.post|app.put", output: "Found 4 existing routes", durationMs: 400 },
    { toolName: "Write", input: "src/api/products.ts", durationMs: 900 },
    { toolName: "Write", input: "src/api/orders.ts", durationMs: 850 },
    { toolName: "Write", input: "src/api/users.ts", durationMs: 800 },
    { toolName: "Write", input: "src/api/__tests__/products.test.ts", durationMs: 1000 },
    { toolName: "Bash", input: "bun test src/api", output: "Tests: 15 passed, 15 total", durationMs: 2000 },
    { toolName: "Bash", input: "bun run lint src/api", output: "ERROR: 3 lint errors found in orders.ts", durationMs: 1000 },
  ],
  e2e: [
    { toolName: "Read", input: "package.json", output: '{ "devDependencies": { "@playwright/test": "^1.40" } }', durationMs: 300 },
    { toolName: "Write", input: "playwright.config.ts", durationMs: 600 },
    { toolName: "Write", input: "e2e/signup.spec.ts", durationMs: 1000 },
    { toolName: "Write", input: "e2e/browse.spec.ts", durationMs: 1100 },
    { toolName: "Write", input: "e2e/checkout.spec.ts", durationMs: 1200 },
    { toolName: "Bash", input: "bunx playwright install", output: "Browsers installed", durationMs: 3000 },
    { toolName: "Bash", input: "bunx playwright test", output: "3 tests passed", durationMs: 4000 },
  ],
};

// ---------------------------------------------------------------------------
// Status progression timeline (delays in ms from when stream starts running)
// ---------------------------------------------------------------------------

const STATUS_TIMELINE: Record<string, { status: WorkStreamStatus; delay: number }[]> = {
  auth: [
    { status: "running", delay: 0 },
    { status: "agent_complete", delay: 12000 },
    { status: "verifying", delay: 13500 },
    { status: "done", delay: 16000 },
  ],
  schema: [
    { status: "running", delay: 500 },
    { status: "agent_complete", delay: 11000 },
    { status: "verifying", delay: 12500 },
    { status: "done", delay: 14500 },
  ],
  ui: [
    { status: "running", delay: 1000 },
    { status: "agent_complete", delay: 14000 },
    { status: "verifying", delay: 15500 },
    { status: "done", delay: 18000 },
  ],
  cart: [
    { status: "running", delay: 0 },
    { status: "agent_complete", delay: 13000 },
    { status: "verifying", delay: 14500 },
    { status: "done", delay: 17000 },
  ],
  api: [
    { status: "running", delay: 500 },
    { status: "agent_complete", delay: 11000 },
    { status: "needs_attention", delay: 12500 },
  ],
  e2e: [
    { status: "running", delay: 0 },
    { status: "agent_complete", delay: 15000 },
    { status: "verifying", delay: 17000 },
    { status: "done", delay: 20000 },
  ],
};

// Which slots become ready when all dependencies in prior slots resolve
const SLOT_DEPS: Record<number, number[]> = {
  1: [],       // No deps — ready immediately
  2: [1],      // Needs slot 1 done
  3: [1, 2],   // Needs slots 1 & 2 done
};

// Terminal statuses that count as "resolved" for dependency purposes
const RESOLVED: Set<WorkStreamStatus> = new Set(["done", "needs_attention"]);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSimulation(): {
  connected: boolean;
  sendCommand: (cmd: GroveCommand) => void;
  lastEvent: GroveEvent | null;
  events: GroveEvent[];
  injectEvent: (event: GroveEvent) => void;
} {
  const [events, setEvents] = useState<GroveEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<GroveEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Track work stream statuses locally so sendCommand can reason about deps
  const statusRef = useRef<Record<string, WorkStreamStatus>>({});
  const readySlotsRef = useRef<Set<number>>(new Set());
  const plantedSlotsRef = useRef<Set<number>>(new Set());

  const pushEvent = useCallback((event: GroveEvent) => {
    // Keep statusRef in sync
    if (event.type === "state_change") {
      statusRef.current[event.workStreamId] = event.status;
    }
    setLastEvent(event);
    setEvents((prev) => [...prev, event]);
  }, []);

  const scheduleTimer = useCallback(
    (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timersRef.current.push(id);
    },
    [],
  );

  // Schedule tool events for a work stream, starting at baseDelay
  const scheduleToolEvents = useCallback(
    (wsId: string, baseDelay: number) => {
      const scripts = TOOL_SCRIPTS[wsId] ?? [];
      let offset = 0;

      for (const step of scripts) {
        const startAt = baseDelay + offset;
        scheduleTimer(() => {
          const toolEvent: AgentToolEvent = {
            timestamp: Date.now(),
            toolName: step.toolName,
            input: step.input,
            status: "started",
          };
          pushEvent({ type: "agent_event", workStreamId: wsId, event: toolEvent });
        }, startAt);

        scheduleTimer(() => {
          const toolEvent: AgentToolEvent = {
            timestamp: Date.now(),
            toolName: step.toolName,
            input: step.input,
            output: step.output,
            status: step.input.includes("lint") && wsId === "api" ? "failed" : "completed",
          };
          pushEvent({ type: "agent_event", workStreamId: wsId, event: toolEvent });
        }, startAt + step.durationMs);

        offset += step.durationMs + 300;
      }

      // Metrics updates throughout
      const totalDuration = offset;
      const metricsSteps = 8;
      for (let i = 1; i <= metricsSteps; i++) {
        const at = baseDelay + (totalDuration * i) / metricsSteps;
        const progress = i / metricsSteps;
        scheduleTimer(() => {
          pushEvent({
            type: "metrics_update",
            workStreamId: wsId,
            metrics: {
              workStreamId: wsId,
              toolCalls: Math.round(scripts.length * progress),
              tokensUsed: Math.round(45000 * progress + Math.random() * 5000),
              estimatedCost: +(0.08 * progress + Math.random() * 0.02).toFixed(4),
              elapsedMs: Math.round(totalDuration * progress),
              currentFile: scripts[Math.min(Math.floor(scripts.length * progress), scripts.length - 1)]?.input ?? null,
            },
          });
        }, at);
      }
    },
    [pushEvent, scheduleTimer],
  );

  // Schedule status changes for a work stream, with a callback when it resolves
  const scheduleStatusChanges = useCallback(
    (wsId: string, baseDelay: number, onResolved?: () => void) => {
      const timeline = STATUS_TIMELINE[wsId] ?? [];
      for (const step of timeline) {
        scheduleTimer(() => {
          pushEvent({ type: "state_change", workStreamId: wsId, status: step.status });
          if (RESOLVED.has(step.status) && onResolved) {
            onResolved();
          }
        }, baseDelay + step.delay);
      }
    },
    [pushEvent, scheduleTimer],
  );

  // Check if the next slot's dependencies are all resolved, and if so emit slot_ready
  const checkNextSlotReady = useCallback(
    (completedSlot: number) => {
      const plan = MOCK_PLAN;
      for (const slot of plan.timeSlots) {
        if (readySlotsRef.current.has(slot.slot)) continue;
        const depSlots = SLOT_DEPS[slot.slot] ?? [];
        // All dep slots' work streams must be resolved
        const allDepsResolved = depSlots.every((depSlot) => {
          const depTimeSlot = plan.timeSlots.find((s) => s.slot === depSlot);
          if (!depTimeSlot) return true;
          return depTimeSlot.workStreamIds.every((id) =>
            RESOLVED.has(statusRef.current[id]),
          );
        });
        if (allDepsResolved) {
          readySlotsRef.current.add(slot.slot);
          // Mark the slot's work streams as "ready"
          for (const id of slot.workStreamIds) {
            pushEvent({ type: "state_change", workStreamId: id, status: "ready" });
          }
          pushEvent({ type: "slot_ready", slot: slot.slot });
        }
      }
    },
    [pushEvent],
  );

  // Plant a slot: kick off agents for all its work streams
  const plantSlot = useCallback(
    (slotNum: number) => {
      if (plantedSlotsRef.current.has(slotNum)) return;
      plantedSlotsRef.current.add(slotNum);

      const slot = MOCK_PLAN.timeSlots.find((s) => s.slot === slotNum);
      if (!slot) return;

      let resolvedCount = 0;
      const total = slot.workStreamIds.length;

      const onResolved = () => {
        resolvedCount++;
        if (resolvedCount >= total) {
          // All streams in this slot resolved — check next slot
          scheduleTimer(() => checkNextSlotReady(slotNum), 500);
        }
      };

      for (const wsId of slot.workStreamIds) {
        scheduleStatusChanges(wsId, 0, onResolved);
        scheduleToolEvents(wsId, 0);
      }
    },
    [scheduleStatusChanges, scheduleToolEvents, scheduleTimer, checkNextSlotReady],
  );

  useEffect(() => {
    // Connect and load plan
    scheduleTimer(() => setConnected(true), 300);
    scheduleTimer(() => pushEvent({ type: "plan_loaded", plan: MOCK_PLAN }), 600);

    // Slot 1 has no deps — mark ready immediately after plan loads
    scheduleTimer(() => {
      readySlotsRef.current.add(1);
      for (const id of MOCK_PLAN.timeSlots[0].workStreamIds) {
        statusRef.current[id] = "ready";
      }
      pushEvent({ type: "slot_ready", slot: 1 });
    }, 800);

    return () => {
      for (const id of timersRef.current) clearTimeout(id);
      timersRef.current = [];
    };
  }, [pushEvent, scheduleTimer]);

  const sendCommand = useCallback(
    (cmd: GroveCommand) => {
      if (cmd.type === "plant_slot") {
        plantSlot(cmd.slot);
      }
      if (cmd.type === "mark_done") {
        scheduleTimer(() => {
          pushEvent({
            type: "state_change",
            workStreamId: cmd.workStreamId,
            status: "done",
          });
          // Check if this resolves a slot
          scheduleTimer(() => {
            for (const slot of MOCK_PLAN.timeSlots) {
              if (slot.workStreamIds.includes(cmd.workStreamId)) {
                checkNextSlotReady(slot.slot);
                break;
              }
            }
          }, 300);
        }, 500);
      }
      if (cmd.type === "rerun_agent") {
        scheduleTimer(() => {
          pushEvent({ type: "state_change", workStreamId: cmd.workStreamId, status: "running" });
        }, 500);
        scheduleToolEvents(cmd.workStreamId, 500);
        scheduleTimer(() => {
          pushEvent({ type: "state_change", workStreamId: cmd.workStreamId, status: "agent_complete" });
        }, 8000);
        scheduleTimer(() => {
          pushEvent({ type: "state_change", workStreamId: cmd.workStreamId, status: "verifying" });
        }, 9500);
        scheduleTimer(() => {
          pushEvent({ type: "state_change", workStreamId: cmd.workStreamId, status: "done" });
          scheduleTimer(() => {
            for (const slot of MOCK_PLAN.timeSlots) {
              if (slot.workStreamIds.includes(cmd.workStreamId)) {
                checkNextSlotReady(slot.slot);
                break;
              }
            }
          }, 300);
        }, 12000);
      }
    },
    [plantSlot, pushEvent, scheduleTimer, scheduleToolEvents, checkNextSlotReady],
  );

  const injectEvent = useCallback((event: GroveEvent) => {
    pushEvent(event);
  }, [pushEvent]);

  return { connected, sendCommand, lastEvent, events, injectEvent };
}
