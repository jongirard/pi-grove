# Test Plan

## Overview
A minimal test plan for integration testing.

---

## Phase 1 — Foundation
### Work Stream 1A: Setup
Set up initial files.
**Depends on:** (none)
**Files to create:**
- src/setup.ts
**Done when:** Setup file exists and compiles.

---

## Phase 2 — Core
### Work Stream 2A: Feature Alpha
Build the first feature.
**Depends on:** Work Stream 1A
**Files to create:**
- src/alpha.ts
**Done when:** Alpha feature works end-to-end.

### Work Stream 2B: Feature Beta
Build the second feature.
**Depends on:** Work Stream 1A
**Files to create:**
- src/beta.ts
**Done when:** Beta feature works end-to-end.

---

## Time Slots
| Slot | Work Streams | Max Parallel |
|------|-------------|-------------|
| 1    | 1A          | 1           |
| 2    | 2A, 2B      | 2           |
