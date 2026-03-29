# Grove Build Plan — Pi SDK v0.63.1 Corrections & Reference

> **Companion to:** `grove-build-plan.md`
> **Purpose:** Corrections to Pi SDK assumptions in the build plan, validated against the installed SDK at `@mariozechner/pi-coding-agent@0.63.1`.
> **Read this first** when executing any phase of the build plan.

---

## How to Use This Document

The build plan at `grove-build-plan.md` contains several incorrect assumptions about Pi's extension API. Each correction below references the exact section it overrides. When implementing a work stream, check the relevant corrections before writing code.

**Correction format:**
- **Plan says** — the incorrect pattern from `grove-build-plan.md`
- **Correct** — the validated pattern from Pi SDK source/examples
- **Applies to** — which work streams are affected

---

## Correction 1: Package Manifest Format

**Plan says** (Phase 5B, `package.json`):
```json
{ "pi-package": { "extensions": ["extension/index.ts"] } }
```

**Correct:**
```json
{
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extension/index.ts"]
  }
}
```

- The key is `"pi"`, not `"pi-package"`.
- `"keywords": ["pi-package"]` is separate — used for gallery discoverability.
- Extension paths are relative to root with `./` prefix.

**Applies to:** Phase 1 (scaffolding), Phase 5B (packaging)

---

## Correction 2: registerCommand — No Subcommands Object

**Plan says** (Phase 4A, `index.ts`):
```typescript
pi.registerCommand("grove", {
  subcommands: {
    init: { description: "...", handler: groveInit },
    plant: { description: "...", handler: grovePlant },
  },
});
```

**Correct:**
```typescript
pi.registerCommand("grove", {
  description: "Plan-aware agent orchestration",
  getArgumentCompletions: (prefix) => {
    const subs = ["init", "plant", "canopy", "status"];
    const filtered = subs.filter((s) => s.startsWith(prefix));
    return filtered.length > 0
      ? filtered.map((s) => ({ value: s, label: s }))
      : null;
  },
  handler: async (args, ctx) => {
    const [subcommand, ...rest] = args.trim().split(/\s+/);
    switch (subcommand) {
      case "init":
        await groveInit(rest.join(" "), ctx);
        break;
      case "plant":
        await grovePlant(rest.join(" "), ctx);
        break;
      // ...
      default:
        ctx.ui.notify("Usage: /grove <init|plant|canopy|status>", "error");
    }
  },
});
```

**Why:** `registerCommand` takes `(name: string, options)` where `options.handler` receives `(args: string, ctx: ExtensionCommandContext)`. There is no `subcommands` property. You parse the args string yourself. Pi's own `todo.ts` example uses this pattern.

**Tab completion:** `getArgumentCompletions(prefix)` returns `AutocompleteItem[] | null` — each item has `{ value, label }`.

**Applies to:** Phase 1 (extension entry), Phase 4A (commands)

---

## Correction 3: Peer Dependencies, Not Regular Dependencies

**Plan says** (Phase 1, `extension/package.json`):
```json
{
  "dependencies": {
    "@mariozechner/pi-coding-agent": "latest",
    "@mariozechner/pi-agent-core": "latest"
  }
}
```

**Correct:**
```json
{
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-agent-core": "*",
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
  },
  "devDependencies": {
    "@mariozechner/pi-coding-agent": "latest",
    "@mariozechner/pi-agent-core": "latest",
    "@mariozechner/pi-ai": "latest",
    "@sinclair/typebox": "latest"
  }
}
```

**Why:** Pi bundles these packages at runtime and provides them to extensions. Per Pi's `packages.md`, they MUST be `peerDependencies` with `"*"` range. Adding them also as `devDependencies` is a workaround so `tsc --noEmit` works during development without Pi's runtime.

**Full peer dependency list:**
- `@mariozechner/pi-coding-agent` — Extension API, SDK, tools
- `@mariozechner/pi-agent-core` — Agent, AgentSession types
- `@mariozechner/pi-ai` — Model types, `StringEnum()` helper
- `@mariozechner/pi-tui` — TUI components (if using custom UI)
- `@sinclair/typebox` — `Type.Object()` etc. for tool parameter schemas

**Applies to:** Phase 1 (scaffolding), all phases that import from Pi packages

---

## Correction 4: Extension Entry Point Signature

**Plan says** (Phase 4A): Various signatures used inconsistently.

**Correct and confirmed:**
```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function grove(pi: ExtensionAPI): void {
  // register commands, tools, event handlers
}
```

- Type is `ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>`
- Default export, receives `ExtensionAPI` as sole parameter
- Can be sync or async

**Applies to:** Phase 1 (entry point), Phase 4A (commands)

---

## Correction 5: Tool Registration Uses TypeBox Schemas

**Plan says** (Phase 3A, `mark-complete.ts`): Uses plain object schema.

**Correct:**
```typescript
import { Type, type Static } from "@sinclair/typebox";

pi.registerTool({
  name: "mark_complete",
  label: "Mark Complete",
  description: "Call when you have completed all tasks for this work stream",
  parameters: Type.Object({
    summary: Type.String({ description: "Brief summary of what was done" }),
  }),
  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    // params.summary is typed as string
    return {
      content: [{ type: "text", text: `Work stream marked complete: ${params.summary}` }],
      details: {},
    };
  },
});
```

**Execute signature (full):**
```typescript
execute(
  toolCallId: string,
  params: Static<TParams>,        // typed from TypeBox schema
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
  ctx: ExtensionContext
): Promise<AgentToolResult>
```

**Return type:**
```typescript
{ content: Array<{ type: "text", text: string }>, details: TDetails }
```

**Important:** Use `StringEnum()` from `@mariozechner/pi-ai` instead of `Type.Union([Type.Literal(...)])` for string enums — the latter breaks with some LLM providers (Google).

**Applies to:** Phase 3A (mark_complete tool), any work stream registering tools

---

## Correction 6: SDK Agent Spawning

**Plan says** (Phase 3A, `spawner.ts`): `import { Agent } from "@mariozechner/pi-agent-core"`

**Correct:**
```typescript
import {
  createAgentSession,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  codingTools,
  createCodingTools,
} from "@mariozechner/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
  cwd: projectRoot,
  customTools: [markCompleteTool],
});

// Send prompt to agent
await session.prompt(workStream.brief);

// Subscribe to events
const unsubscribe = session.subscribe((event) => {
  switch (event.type) {
    case "tool_execution_start":
    case "tool_execution_update":
    case "tool_execution_end":
      // Forward to broadcaster
      break;
    case "message_update":
      // Track token usage
      break;
  }
});

// Steering
await session.steer("Please also add error handling");

// Cleanup
session.dispose();
```

**Key `createAgentSession` options:**
```typescript
{
  cwd?: string,                    // Working directory for tools
  tools?: Tool[],                  // Override default tools (use createCodingTools(cwd))
  customTools?: ToolDefinition[],  // Add tools alongside defaults
  sessionManager?: SessionManager, // Use SessionManager.inMemory() for embedded agents
  authStorage?: AuthStorage,
  modelRegistry?: ModelRegistry,
  model?: Model,
  thinkingLevel?: ThinkingLevel,   // "off"|"minimal"|"low"|"medium"|"high"|"xhigh"
}
```

**AgentSession methods:**
- `session.prompt(text)` — send initial prompt
- `session.steer(text)` — queue message during execution
- `session.followUp(text)` — queue message after agent finishes
- `session.abort()` — abort current operation
- `session.dispose()` — cleanup
- `session.subscribe(listener)` — returns unsubscribe function

**Applies to:** Phase 3A (spawner), Phase 4A (plant command)

---

## Correction 7: Import Path Convention

**Plan says:** Uses bare imports like `"./lib/types"` or `"./lib/types.ts"`.

**Correct:** All TypeScript imports in extension code must use `.js` extensions:
```typescript
import { GROVE_DIR } from "./lib/constants.js";
import type { GrovePlan } from "./lib/types.js";
```

**Why:** Pi uses jiti for JIT transpilation. The `.js` extension is resolved to `.ts` at runtime. This matches ESM conventions and is the pattern used throughout Pi's own examples.

**Applies to:** All extension TypeScript files (all phases)

---

## Correction 8: Tailwind v4, Not v3

**Plan says** (Phase 1, dashboard): `tailwind.config.ts` with PostCSS setup.

**Correct:**

`dashboard/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

`dashboard/src/index.css`:
```css
@import "tailwindcss";
```

- No `tailwind.config.ts` needed — Tailwind v4 uses CSS-first configuration
- No `postcss.config.js` needed — the Vite plugin handles it
- Install `@tailwindcss/vite` as devDependency instead of `tailwindcss` + `postcss` + `autoprefixer`

**Applies to:** Phase 1 (dashboard scaffolding), Phase 3C/3D/4B/4C (all dashboard work streams)

---

## Extension Context Reference

Command handlers receive `ExtensionCommandContext` (extended from `ExtensionContext`):

```typescript
// Available in all event handlers
ctx.cwd                              // Current working directory
ctx.hasUI                            // Is UI available?
ctx.isIdle()                         // Agent not streaming?
ctx.abort()                          // Abort current operation
ctx.shutdown()                       // Graceful shutdown
ctx.getContextUsage()                // Token stats
ctx.compact()                        // Trigger compaction
ctx.getSystemPrompt()                // Current system prompt

// UI interaction
ctx.ui.notify(message, type?)        // type: "info"|"warning"|"error"
ctx.ui.select(title, options)        // Selection dialog → string | undefined
ctx.ui.confirm(title, message)       // Confirmation → boolean
ctx.ui.input(title, placeholder?)    // Text input → string | undefined
ctx.ui.setStatus(key, text?)         // Footer status line
ctx.ui.setWidget(key, content)       // Persistent widget

// Command-specific (ExtensionCommandContext only)
ctx.waitForIdle()                    // Wait for agent to finish
ctx.newSession()                     // Start new session
ctx.reload()                         // Reload extensions
```

---

## Pi Extension Event Reference

```typescript
// Session lifecycle
pi.on("session_start", async (event, ctx) => {});
pi.on("session_shutdown", async (event, ctx) => {});

// Agent loop
pi.on("agent_start", async (event, ctx) => {});
pi.on("agent_end", async (event, ctx) => {});
pi.on("turn_start", async (event, ctx) => {});
pi.on("turn_end", async (event, ctx) => {});

// Tool events
pi.on("tool_call", async (event, ctx) => {});      // Before execution
pi.on("tool_result", async (event, ctx) => {});     // After execution

// Input processing
pi.on("input", async (event, ctx) => {});           // User input received
pi.on("before_agent_start", async (event, ctx) => {}); // Can inject messages
```

---

## SDK Reference Path

The installed Pi SDK source (types, examples, docs) is at:
```
/Users/jongirard/.nvm/versions/node/v24.11.0/lib/node_modules/@mariozechner/pi-coding-agent/
```

Key reference files within:
- `dist/core/extensions/types.d.ts` — Complete type definitions (~12K lines)
- `dist/core/sdk.d.ts` — createAgentSession, SessionManager, etc.
- `examples/extensions/` — Extension patterns (todo.ts, commands.ts, plan-mode/)
- `examples/sdk/` — SDK usage (01-minimal.ts through 12-full-control.ts)
- `docs/extensions.md` — Extension API documentation
- `docs/packages.md` — Pi package format and conventions
