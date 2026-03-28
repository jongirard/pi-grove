# Grove Lite — Implementation Plan

## Overview

Grove Lite is a minimal plan-aware agent orchestrator. It reads a markdown plan, parses it into structured work streams, and dispatches agents to execute them in time-slotted phases.

---

## Phase 1 — Foundation

### Work Stream 1A: Shared Types & Constants

Set up the shared TypeScript types and constants used across the extension and dashboard.

**Files to create:**
- `extension/lib/types.ts`
- `extension/lib/constants.ts`

**Done when:** Types compile, constants are importable, and no circular imports exist.

---

## Phase 2 — Core Systems

### Work Stream 2A: Plan Parser

Build the plan parser that converts markdown plans into structured JSON.

**Depends on:** Work Stream 1A

**Files to create:**
- `extension/parser/plan.ts`
- `extension/parser/prompt.ts`

**Done when:** Parser extracts work streams, dependencies, and time slots from markdown. Validation rejects invalid plans.

### Work Stream 2B: Agent Dispatcher

Build the agent dispatcher that launches and monitors agents per work stream.

**Depends on:** Work Stream 1A

**Files to create:**
- `extension/orchestrator/dispatch.ts`
- `extension/orchestrator/monitor.ts`

**Done when:** Dispatcher can launch a mock agent, track its status, and report completion.

---

## Time Slots

| Slot | Work Streams | Max Parallel |
|------|-------------|-------------|
| 1    | 1A          | 1           |
| 2    | 2A, 2B      | 2           |
