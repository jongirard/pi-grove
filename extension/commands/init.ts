import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { completeSimple } from "@mariozechner/pi-ai";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parsePlan, writePlan } from "../parser/plan.js";
import { resetState } from "../orchestrator/persistence.js";
import { GROVE_DIR } from "../lib/constants.js";

export async function groveInit(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  // 1. Determine plan file path from args or prompt user
  let planPath = args.trim();
  if (!planPath) {
    const input = await ctx.ui.input("Plan file path", "docs/plan.md");
    if (!input) {
      ctx.ui.notify("Init cancelled.", "info");
      return;
    }
    planPath = input;
  }

  // 2. Resolve path relative to cwd
  const resolved = resolve(ctx.cwd, planPath);

  // 3. Read file content
  if (!existsSync(resolved)) {
    ctx.ui.notify(`Plan file not found: ${resolved}`, "error");
    return;
  }

  const markdown = readFileSync(resolved, "utf-8");

  // 4. Create llmCall wrapper using ctx.model + completeSimple
  const llmCall = async (prompt: string): Promise<string> => {
    if (!ctx.model) throw new Error("No model available");
    // Resolve API key through Pi's model registry (handles OAuth/subscription auth)
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
    const response = await completeSimple(ctx.model, {
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    }, {
      ...(auth.ok && auth.apiKey ? { apiKey: auth.apiKey } : {}),
    });
    // Extract all text blocks from the response and concatenate
    const texts: string[] = [];
    for (const block of response.content) {
      if ((block as { type: string }).type === "text") {
        texts.push((block as { type: "text"; text: string }).text);
      }
    }
    const result = texts.join("");
    if (!result) {
      throw new Error(
        `LLM returned no text content. Stop reason: ${response.stopReason}${response.errorMessage ? `, error: ${response.errorMessage}` : ""}`,
      );
    }
    return result;
  };

  // 5. Notify parsing
  ctx.ui.notify("Parsing plan...", "info");

  // 6. Parse plan
  let plan;
  try {
    plan = await parsePlan(markdown, llmCall);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to parse plan: ${msg}`, "error");
    return;
  }

  // 7. Show plan summary
  const wsCount = Object.keys(plan.workStreams).length;
  const slotCount = plan.timeSlots.length;
  const summary = `${plan.name}: ${wsCount} work streams, ${slotCount} phases`;

  // 8. Ask confirmation
  const confirmed = await ctx.ui.confirm("Initialize Grove?", summary);
  if (!confirmed) {
    ctx.ui.notify("Init cancelled.", "info");
    return;
  }

  // 9. Write plan and reset state
  const groveDir = join(ctx.cwd, GROVE_DIR);
  writePlan(groveDir, plan);
  resetState(groveDir);
  ctx.ui.notify("Plan initialized. Run /grove plant to begin.", "info");
}
