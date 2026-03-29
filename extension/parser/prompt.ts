import type { GrovePlan } from "../lib/types.js";

/**
 * Builds the LLM prompt that instructs extraction of a Grove plan
 * from the provided markdown text.
 */
export function buildExtractionPrompt(planMarkdown: string): string {
  return `You are a structured-data extraction assistant. Your task is to read the project plan below and output a JSON object that conforms exactly to the GrovePlan schema.

## GrovePlan JSON Schema

\`\`\`typescript
interface GrovePlan {
  name: string;            // Short project name
  source: string;          // "llm-extracted"
  workStreams: Record<string, WorkStream>;  // keyed by work stream ID (e.g. "ws-1a")
  timeSlots: TimeSlot[];
}

interface WorkStream {
  id: string;              // Must match the key in workStreams
  name: string;            // Human-readable name
  phase: number;           // Numeric phase/slot this belongs to
  dependencies: string[];  // IDs of work streams this depends on (empty array if none)
  brief: string;           // 2-3 paragraph description: what to deliver, key implementation details, and relevant design decisions from the plan
  filesToCreate: string[]; // Relative file paths this work stream will create or modify
  doneWhen: string;        // Acceptance criteria — when is this work stream complete?
  status: "pending";       // Always "pending" for freshly parsed plans
}

interface TimeSlot {
  slot: number;            // 1-based slot number
  workStreamIds: string[]; // IDs of work streams in this slot
  maxParallelAgents: number; // How many agents can run in parallel for this slot
}
\`\`\`

## Example Output

\`\`\`json
{
  "name": "My Project",
  "source": "llm-extracted",
  "workStreams": {
    "1A": {
      "id": "1A",
      "name": "Setup Foundation",
      "phase": 1,
      "dependencies": [],
      "brief": "Create project scaffolding and shared types. Set up the TypeScript project with strict mode, configure the build toolchain, and define the core domain types that downstream work streams depend on.",
      "filesToCreate": ["src/types.ts", "src/index.ts"],
      "doneWhen": "Types compile and are importable.",
      "status": "pending"
    },
    "2A": {
      "id": "2A",
      "name": "Build Core Logic",
      "phase": 2,
      "dependencies": ["1A"],
      "brief": "Implement the main business logic using the shared types from 1A. This includes the processing pipeline, validation layer, and error handling per the design spec.",
      "filesToCreate": ["src/core.ts"],
      "doneWhen": "Unit tests pass.",
      "status": "pending"
    }
  },
  "timeSlots": [
    { "slot": 1, "workStreamIds": ["1A"], "maxParallelAgents": 1 },
    { "slot": 2, "workStreamIds": ["2A"], "maxParallelAgents": 1 }
  ]
}
\`\`\`

## Rules

1. Use the work stream IDs as they appear in the plan (e.g. "1A", "2B", "3C"). If the plan uses labels like "Work Stream 2A" or "### 2A —", the ID is "2A". Preserve the exact casing and format from the plan.
2. The key in the workStreams record must match the work stream's id field.
3. Every work stream ID listed in a timeSlot must exist in the workStreams record.
4. Dependencies must only reference IDs that exist in the workStreams record. Parse "Dependencies: 2A, 2B" as ["2A", "2B"].
5. All statuses must be "pending".
6. Set source to "llm-extracted".
7. Output ONLY the raw JSON object. No markdown fences, no explanation, no preamble, no trailing text.

## Plan Markdown

${planMarkdown}

## Output

Respond with the JSON object only:`;
}
