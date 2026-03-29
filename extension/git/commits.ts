import type { WorkStream } from "../lib/types.js";
import * as git from "./git.js";

export class GroveGitManager {
  private branchMode = false;

  constructor(private projectRoot: string) {}

  async onWorkStreamDone(workStream: WorkStream, planName?: string): Promise<string | null> {
    try {
      const isRepo = await git.isGitRepo(this.projectRoot);
      if (!isRepo) return null;

      const hasChanges = await git.hasUncommittedChanges(this.projectRoot);
      if (!hasChanges) return null;

      await git.stageAll(this.projectRoot);
      const title = planName
        ? `${planName} — ${workStream.name}, Phase ${workStream.phase}`
        : `${workStream.name} — complete`;
      const message = workStream.brief
        ? `${title}\n\n${workStream.brief}`
        : title;
      const hash = await git.commit(this.projectRoot, message);
      return hash;
    } catch {
      return null;
    }
  }

  async prepareBranchForSlot(slot: number): Promise<void> {
    const branchName = `grove/t${slot}`;
    await git.createBranch(this.projectRoot, branchName);
    await git.checkoutBranch(this.projectRoot, branchName);
  }

  getBranchMode(): boolean {
    return this.branchMode;
  }

  setBranchMode(enabled: boolean): void {
    this.branchMode = enabled;
  }
}
