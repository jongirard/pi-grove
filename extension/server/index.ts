import * as fs from "node:fs";
import * as path from "node:path";
import { Hono } from "hono";
import { createNodeWebSocket } from "@hono/node-ws";
import { serve } from "@hono/node-server";
import { DEFAULT_PORT_RANGE, WS_PATH } from "../lib/constants.js";
import { createRoutes } from "./routes.js";
import { GroveBroadcaster } from "./ws.js";
import {
  findAvailablePort,
  writeServerConfig,
  readServerConfig,
  clearServerConfig,
} from "./port.js";
import type { StateProvider } from "./types.js";

export { GroveBroadcaster } from "./ws.js";
export type { StateProvider } from "./types.js";

/**
 * Start the Grove HTTP + WebSocket server.
 *
 * @param groveDir   - Path to the .pi/grove directory for this project
 * @param dashboardDistPath - Path to the built dashboard static files
 * @returns The assigned port and a close function
 */
export async function startServer(
  groveDir: string,
  dashboardDistPath: string,
  stateProvider?: StateProvider,
): Promise<{ port: number; broadcaster: GroveBroadcaster; close: () => void }> {
  const port = await findAvailablePort(DEFAULT_PORT_RANGE);

  const app = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  // Default no-op state provider
  const provider: StateProvider = stateProvider ?? {
    getPlan: () => null,
    getState: () => ({}),
    handleCommand: () => {},
  };

  // Broadcaster for WebSocket events
  const broadcaster = new GroveBroadcaster(provider, (cmd) =>
    provider.handleCommand(cmd),
  );

  // Mount REST API routes
  const apiRoutes = createRoutes(provider);
  app.route("/", apiRoutes);

  // WebSocket upgrade endpoint
  app.get(
    WS_PATH,
    upgradeWebSocket(() => ({
      onOpen(_evt, ws) {
        broadcaster.handleConnection(ws);
      },
      onMessage(evt, ws) {
        const data =
          typeof evt.data === "string" ? evt.data : String(evt.data);
        broadcaster.handleMessage(ws, data);
      },
      onClose(_evt, ws) {
        broadcaster.handleClose(ws);
      },
    })),
  );

  // Serve dashboard static files
  app.get("/*", (c) => {
    const reqPath = c.req.path === "/" ? "/index.html" : c.req.path;
    const filePath = path.join(dashboardDistPath, reqPath);

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
    };

    const serveFile = (fp: string): Response | null => {
      try {
        const stat = fs.statSync(fp);
        if (!stat.isFile()) return null;
        const content = fs.readFileSync(fp, "utf-8");
        const fileExt = path.extname(fp).toLowerCase();
        const ct = mimeTypes[fileExt] ?? "application/octet-stream";
        return c.text(content, 200, { "content-type": ct } as any);
      } catch {
        return null;
      }
    };

    // Try exact path first
    const response = serveFile(filePath);
    if (response) return response;

    // SPA fallback: serve index.html
    const indexPath = path.join(dashboardDistPath, "index.html");
    const fallback = serveFile(indexPath);
    if (fallback) return fallback;

    return c.notFound();
  });

  // Start the server and wait until it's listening
  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const s = serve({ fetch: app.fetch, port }, () => {
      resolve(s);
    });
    injectWebSocket(s);
  });

  // Write server.json
  writeServerConfig(groveDir, {
    port,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  const close = (): void => {
    server.close();
    clearServerConfig(groveDir);
  };

  return { port, broadcaster, close };
}

/**
 * Check if a Grove server is already running by reading server.json
 * and verifying the PID is still alive.
 */
export function isServerRunning(
  groveDir: string,
): { running: boolean; port?: number } {
  const config = readServerConfig(groveDir);
  if (!config) {
    return { running: false };
  }

  try {
    process.kill(config.pid, 0);
    return { running: true, port: config.port };
  } catch {
    // PID not alive — stale config
    clearServerConfig(groveDir);
    return { running: false };
  }
}
