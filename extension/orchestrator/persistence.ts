import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { STATE_FILE } from "../lib/constants.js";

/**
 * Serialize orchestrator snapshot to STATE_FILE.
 * Writes atomically: write to a temp file in the same directory, then rename.
 */
export function saveState(groveDir: string, snapshot: unknown): void {
  const filePath = path.join(groveDir, STATE_FILE);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = path.join(dir, `.state-${crypto.randomBytes(4).toString("hex")}.tmp`);
  const data = JSON.stringify(snapshot, null, 2);

  fs.writeFileSync(tmpPath, data, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

/**
 * Read STATE_FILE and return the parsed snapshot, or null if it doesn't exist.
 */
export function loadState(groveDir: string): unknown | null {
  const filePath = path.join(groveDir, STATE_FILE);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const data = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(data);
}

/**
 * Delete STATE_FILE if it exists.
 */
export function resetState(groveDir: string): void {
  const filePath = path.join(groveDir, STATE_FILE);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
