import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { groveInit } from "./commands/init.js";
import { grovePlant } from "./commands/plant.js";
import { groveCanopy } from "./commands/canopy.js";
import { groveStatus } from "./commands/status.js";

export default function grove(pi: ExtensionAPI): void {
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
      const trimmed = args.trim();
      const spaceIdx = trimmed.indexOf(" ");
      const subcommand = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const subArgs = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

      switch (subcommand) {
        case "init":
          return groveInit(subArgs, ctx);
        case "plant":
          return grovePlant(subArgs, ctx);
        case "canopy":
          return groveCanopy(subArgs, ctx);
        case "status":
          return groveStatus(subArgs, ctx);
        default:
          ctx.ui.notify(
            "Usage: /grove <init|plant|canopy|status>",
            "error",
          );
      }
    },
  });
}
