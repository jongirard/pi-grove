import { useMemo } from "react";
import type { AgentToolEvent } from "../lib/types.js";

interface Step {
  name: string;
  filePath: string;
  status: "pending" | "in_progress" | "complete";
}

interface StepTimelineProps {
  filesToCreate: string[];
  doneWhen: string;
  events: AgentToolEvent[];
}

/** Extract a file path from an event input string. */
function extractFilePath(input: string): string | null {
  // Try JSON parse first (structured tool input)
  try {
    const parsed = JSON.parse(input) as Record<string, unknown>;
    if (typeof parsed.file_path === "string") return parsed.file_path;
    if (typeof parsed.filePath === "string") return parsed.filePath;
    if (typeof parsed.path === "string") return parsed.path;
  } catch {
    // Fall through to regex
  }
  // Match common file path patterns
  const match = input.match(/(?:^|\s|["'])((?:\/|\.\.?\/)?[\w./-]+\.\w+)/);
  return match?.[1] ?? null;
}

/** Check whether an event's file path matches a step's file path (suffix match). */
function pathMatches(eventPath: string, stepPath: string): boolean {
  return eventPath === stepPath || eventPath.endsWith(`/${stepPath}`) || stepPath.endsWith(`/${eventPath}`);
}

function deriveSteps(
  filesToCreate: string[],
  doneWhen: string,
  events: AgentToolEvent[],
): Step[] {
  const mutationTools = new Set(["write", "edit", "Write", "Edit"]);

  const steps: Step[] = filesToCreate.map((fp) => {
    const basename = fp.split("/").pop() ?? fp;

    // Check for completed write/edit events referencing this file
    const hasCompleted = events.some((e) => {
      if (!mutationTools.has(e.toolName) || e.status !== "completed") return false;
      const ep = extractFilePath(e.input);
      return ep !== null && pathMatches(ep, fp);
    });

    if (hasCompleted) {
      return { name: basename, filePath: fp, status: "complete" as const };
    }

    // Check if the most recent started event references this file
    const lastStarted = [...events]
      .reverse()
      .find((e) => mutationTools.has(e.toolName) && e.status === "started");
    if (lastStarted) {
      const ep = extractFilePath(lastStarted.input);
      if (ep !== null && pathMatches(ep, fp)) {
        return { name: basename, filePath: fp, status: "in_progress" as const };
      }
    }

    return { name: basename, filePath: fp, status: "pending" as const };
  });

  // Verification step: complete if all file steps are complete
  const allFilesComplete = steps.every((s) => s.status === "complete");
  steps.push({
    name: "Verification",
    filePath: "",
    status: allFilesComplete ? "in_progress" : "pending",
  });

  return steps;
}

const statusIcon: Record<Step["status"], { char: string; classes: string }> = {
  complete: { char: "\u2713", classes: "text-emerald-400" },
  in_progress: { char: "\u25CF", classes: "text-amber-400 animate-pulse" },
  pending: { char: "\u25CB", classes: "text-neutral-600" },
};

export function StepTimeline({ filesToCreate, doneWhen, events }: StepTimelineProps) {
  const steps = useMemo(
    () => deriveSteps(filesToCreate, doneWhen, events),
    [filesToCreate, doneWhen, events],
  );

  return (
    <div className="flex flex-col text-xs font-mono">
      {steps.map((step, i) => {
        const icon = statusIcon[step.status];
        const isLast = i === steps.length - 1;
        const isVerification = step.name === "Verification";

        return (
          <div key={step.filePath || "verification"} className="relative flex items-stretch">
            {/* Timeline track */}
            <div className="flex flex-col items-center w-5 shrink-0">
              <span className={`${icon.classes} leading-5`}>{icon.char}</span>
              {!isLast && (
                <div className="flex-1 w-px border-l border-neutral-700" />
              )}
            </div>

            {/* Label */}
            <div
              className={`pl-2 py-1 leading-5 ${
                step.status === "complete"
                  ? "text-neutral-500 line-through"
                  : "text-neutral-100"
              }`}
              title={isVerification ? doneWhen : step.filePath}
            >
              {step.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
