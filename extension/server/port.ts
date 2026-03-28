import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import { SERVER_FILE } from "../lib/constants.js";
import type { ServerConfig } from "../lib/types.js";

/**
 * Find an available port by attempting to listen on each port in the range.
 */
export function findAvailablePort(
  range: readonly [number, number],
): Promise<number> {
  const [start, end] = range;

  return new Promise((resolve, reject) => {
    let current = start;

    function tryPort(port: number): void {
      if (port > end) {
        reject(new Error(`No available port in range ${start}-${end}`));
        return;
      }

      const server = net.createServer();
      server.once("error", () => {
        tryPort(port + 1);
      });
      server.once("listening", () => {
        server.close(() => {
          resolve(port);
        });
      });
      server.listen(port, "127.0.0.1");
    }

    tryPort(current);
  });
}

/**
 * Write the server config (port, pid, timestamp) to server.json.
 */
export function writeServerConfig(
  groveDir: string,
  config: ServerConfig,
): void {
  const filePath = path.join(groveDir, SERVER_FILE);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

/**
 * Read the server config from server.json, returning null if absent or invalid.
 */
export function readServerConfig(groveDir: string): ServerConfig | null {
  const filePath = path.join(groveDir, SERVER_FILE);
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as ServerConfig;
  } catch {
    return null;
  }
}

/**
 * Remove the server.json config file.
 */
export function clearServerConfig(groveDir: string): void {
  const filePath = path.join(groveDir, SERVER_FILE);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Ignore if already absent
  }
}
