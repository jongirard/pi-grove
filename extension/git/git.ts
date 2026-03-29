import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await execAsync("git rev-parse --is-inside-work-tree", { cwd });
    return true;
  } catch {
    return false;
  }
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd });
  return stdout.trim();
}

export async function createBranch(cwd: string, name: string): Promise<void> {
  await execAsync(`git branch ${name}`, { cwd });
}

export async function checkoutBranch(cwd: string, name: string): Promise<void> {
  await execAsync(`git checkout ${name}`, { cwd });
}

export async function stageAll(cwd: string): Promise<void> {
  await execAsync("git add -A", { cwd });
}

export async function commit(cwd: string, message: string): Promise<string> {
  const { stdout } = await execAsync(`git commit -m ${JSON.stringify(message)}`, { cwd });
  const match = stdout.match(/\[[\w/.-]+ ([a-f0-9]+)\]/);
  return match ? match[1] : stdout.trim();
}

export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const { stdout } = await execAsync("git status --porcelain", { cwd });
  return stdout.trim().length > 0;
}
