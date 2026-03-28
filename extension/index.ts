import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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
    handler: async (_args, ctx) => {
      const [subcommand] = _args.trim().split(/\s+/);
      switch (subcommand) {
        case "init":
        case "plant":
        case "canopy":
        case "status":
          ctx.ui.notify(`/grove ${subcommand} — not yet implemented`, "info");
          break;
        default:
          ctx.ui.notify(
            "Usage: /grove <init|plant|canopy|status>",
            "error",
          );
      }
    },
  });
}
