import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { GrovePlan, WorkStream, TimeSlot } from "../lib/types.js";
import { PLAN_FILE } from "../lib/constants.js";
import { buildExtractionPrompt } from "./prompt.js";

// ---------------------------------------------------------------------------
// parsePlan — Orchestrates LLM extraction of a GrovePlan from markdown
// ---------------------------------------------------------------------------

export async function parsePlan(
  planMarkdown: string,
  llmCall: (prompt: string) => Promise<string>,
): Promise<GrovePlan> {
  const prompt = buildExtractionPrompt(planMarkdown);
  const rawResponse = await llmCall(prompt);

  // Strip markdown code fences if present
  const json = stripCodeFences(rawResponse);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${json.slice(0, 200)}`);
  }

  if (!validatePlan(parsed)) {
    throw new Error("LLM response did not produce a valid GrovePlan");
  }

  // Normalise all statuses to "pending"
  for (const ws of Object.values(parsed.workStreams)) {
    ws.status = "pending";
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// stripCodeFences — Removes ```json ... ``` wrappers from LLM output
// ---------------------------------------------------------------------------

function stripCodeFences(text: string): string {
  let trimmed = text.trim();
  // Match opening fence like ```json or ``` then content then closing ```
  const fenceRe = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = trimmed.match(fenceRe);
  if (match) {
    trimmed = match[1].trim();
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// validatePlan — Runtime validation of a GrovePlan candidate
// ---------------------------------------------------------------------------

export function validatePlan(plan: unknown): plan is GrovePlan {
  if (typeof plan !== "object" || plan === null) return false;

  const p = plan as Record<string, unknown>;

  if (typeof p.name !== "string" || p.name.length === 0) return false;
  if (typeof p.source !== "string") return false;

  // workStreams
  if (typeof p.workStreams !== "object" || p.workStreams === null || Array.isArray(p.workStreams))
    return false;

  const ws = p.workStreams as Record<string, unknown>;
  const wsIds = new Set(Object.keys(ws));

  if (wsIds.size === 0) return false;

  for (const [key, value] of Object.entries(ws)) {
    if (!validateWorkStream(value, key, wsIds)) return false;
  }

  // timeSlots
  if (!Array.isArray(p.timeSlots) || p.timeSlots.length === 0) return false;

  for (const ts of p.timeSlots) {
    if (!validateTimeSlot(ts, wsIds)) return false;
  }

  // At least one work stream with no dependencies (entry point)
  const hasEntryPoint = Object.values(ws).some((w) => {
    const wk = w as WorkStream;
    return Array.isArray(wk.dependencies) && wk.dependencies.length === 0;
  });
  if (!hasEntryPoint) return false;

  // No circular dependencies
  if (hasCycles(ws as Record<string, WorkStream>)) return false;

  return true;
}

function validateWorkStream(
  ws: unknown,
  expectedKey: string,
  validIds: Set<string>,
): boolean {
  if (typeof ws !== "object" || ws === null) return false;
  const w = ws as Record<string, unknown>;

  if (w.id !== expectedKey) return false;
  if (typeof w.name !== "string" || w.name.length === 0) return false;
  if (typeof w.phase !== "number") return false;
  if (typeof w.brief !== "string") return false;
  if (typeof w.doneWhen !== "string") return false;
  if (!Array.isArray(w.filesToCreate)) return false;
  if (!Array.isArray(w.dependencies)) return false;

  // All dependency IDs must reference valid work streams
  for (const dep of w.dependencies) {
    if (typeof dep !== "string" || !validIds.has(dep)) return false;
  }

  // status must be a valid WorkStreamStatus
  const validStatuses = new Set([
    "pending",
    "ready",
    "running",
    "agent_complete",
    "verifying",
    "done",
    "needs_attention",
  ]);
  if (typeof w.status !== "string" || !validStatuses.has(w.status)) return false;

  return true;
}

function validateTimeSlot(ts: unknown, validIds: Set<string>): boolean {
  if (typeof ts !== "object" || ts === null) return false;
  const t = ts as Record<string, unknown>;

  if (typeof t.slot !== "number") return false;
  if (!Array.isArray(t.workStreamIds) || t.workStreamIds.length === 0) return false;
  if (typeof t.maxParallelAgents !== "number" || t.maxParallelAgents < 1) return false;

  for (const id of t.workStreamIds) {
    if (typeof id !== "string" || !validIds.has(id)) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// hasCycles — DFS cycle detection on the dependency graph
// ---------------------------------------------------------------------------

function hasCycles(workStreams: Record<string, WorkStream>): boolean {
  const WHITE = 0; // unvisited
  const GRAY = 1; // in current path
  const BLACK = 2; // fully processed

  const color = new Map<string, number>();
  for (const id of Object.keys(workStreams)) {
    color.set(id, WHITE);
  }

  function dfs(id: string): boolean {
    color.set(id, GRAY);
    const ws = workStreams[id];
    if (ws) {
      for (const dep of ws.dependencies) {
        const c = color.get(dep);
        if (c === GRAY) return true; // back edge = cycle
        if (c === WHITE && dfs(dep)) return true;
      }
    }
    color.set(id, BLACK);
    return false;
  }

  for (const id of Object.keys(workStreams)) {
    if (color.get(id) === WHITE && dfs(id)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// writePlan / readPlan — Atomic file I/O
// ---------------------------------------------------------------------------

export function writePlan(groveDir: string, plan: GrovePlan): void {
  mkdirSync(groveDir, { recursive: true });
  const target = join(groveDir, PLAN_FILE);
  const tmp = join(groveDir, `.plan-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(plan, null, 2) + "\n", "utf-8");
  renameSync(tmp, target);
}

export function readPlan(groveDir: string): GrovePlan | null {
  const target = join(groveDir, PLAN_FILE);
  if (!existsSync(target)) return null;
  try {
    const raw = readFileSync(target, "utf-8");
    const parsed = JSON.parse(raw);
    if (validatePlan(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}
