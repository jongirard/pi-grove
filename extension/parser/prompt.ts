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
  brief: string;           // One-paragraph description of what this work stream delivers
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
  "name": "my-project",
  "source": "llm-extracted",
  "workStreams": {
    "ws-1a": {
      "id": "ws-1a",
      "name": "Setup foundation",
      "phase": 1,
      "dependencies": [],
      "brief": "Create project scaffolding and shared types.",
      "filesToCreate": ["src/types.ts", "src/index.ts"],
      "doneWhen": "Types compile and are importable.",
      "status": "pending"
    },
    "ws-2a": {
      "id": "ws-2a",
      "name": "Build core logic",
      "phase": 2,
      "dependencies": ["ws-1a"],
      "brief": "Implement the main business logic.",
      "filesToCreate": ["src/core.ts"],
      "doneWhen": "Unit tests pass.",
      "status": "pending"
    }
  },
  "timeSlots": [
    { "slot": 1, "workStreamIds": ["ws-1a"], "maxParallelAgents": 1 },
    { "slot": 2, "workStreamIds": ["ws-2a"], "maxParallelAgents": 1 }
  ]
}
\`\`\`

## Rules

1. Every work stream must have a unique ID in the format "ws-<phase><letter>" (e.g. ws-1a, ws-2b).
2. The key in the workStreams record must match the work stream's id field.
3. Every work stream ID listed in a timeSlot must exist in the workStreams record.
4. Dependencies must only reference IDs that exist in the workStreams record.
5. All statuses must be "pending".
6. Set source to "llm-extracted".
7. Output ONLY the raw JSON object. No markdown fences, no explanation, no preamble.

## Plan Markdown

${planMarkdown}

## Output

Respond with the JSON object only:`;
}
