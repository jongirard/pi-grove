import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import * as os from "node:os";
import {
  findAvailablePort,
  writeServerConfig,
  readServerConfig,
  clearServerConfig,
} from "./port.js";
import { GroveBroadcaster } from "./ws.js";
import { startServer, isServerRunning } from "./index.js";
import type { StateProvider } from "./types.js";
import type {
  AgentMetrics,
  GroveCommand,
  GrovePlan,
  WorkStreamStatus,
} from "../lib/types.js";
import type { WSContext } from "hono/ws";

// --- Helpers ---

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "grove-test-"));
}

function mockStateProvider(overrides?: Partial<StateProvider>): StateProvider {
  return {
    getPlan: () => null,
    getState: () => ({}),
    handleCommand: () => {},
    ...overrides,
  };
}

const samplePlan: GrovePlan = {
  name: "test-plan",
  source: "test",
  workStreams: {
    ws1: {
      id: "ws1",
      name: "Work Stream 1",
      phase: 1,
      dependencies: [],
      brief: "Test brief",
      filesToCreate: [],
      doneWhen: "Tests pass",
      status: "running",
    },
  },
  timeSlots: [{ slot: 1, workStreamIds: ["ws1"], maxParallelAgents: 1 }],
};

const sampleMetrics: AgentMetrics = {
  workStreamId: "ws1",
  toolCalls: 10,
  tokensUsed: 5000,
  estimatedCost: 0.05,
  elapsedMs: 30000,
  currentFile: "test.ts",
};

// --- Port tests ---

describe("findAvailablePort", () => {
  it("returns a port within the given range", async () => {
    const port = await findAvailablePort([9100, 9110]);
    expect(port).toBeGreaterThanOrEqual(9100);
    expect(port).toBeLessThanOrEqual(9110);
  });

  it("skips occupied ports", async () => {
    // Occupy the first port
    const blocker = net.createServer();
    const blockedPort = await new Promise<number>((resolve) => {
      blocker.listen(9200, "127.0.0.1", () => {
        const addr = blocker.address() as net.AddressInfo;
        resolve(addr.port);
      });
    });

    try {
      const port = await findAvailablePort([blockedPort, blockedPort + 10]);
      expect(port).toBeGreaterThan(blockedPort);
    } finally {
      blocker.close();
    }
  });

  it("rejects when no port is available in a tiny range of occupied ports", async () => {
    const blocker = net.createServer();
    const blockedPort = await new Promise<number>((resolve) => {
      blocker.listen(9300, "127.0.0.1", () => {
        const addr = blocker.address() as net.AddressInfo;
        resolve(addr.port);
      });
    });

    try {
      await expect(
        findAvailablePort([blockedPort, blockedPort]),
      ).rejects.toThrow("No available port");
    } finally {
      blocker.close();
    }
  });
});

// --- Server config file tests ---

describe("server config (port.ts)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes and reads server config", () => {
    const config = { port: 4700, pid: process.pid, startedAt: "2026-01-01T00:00:00Z" };
    writeServerConfig(tmpDir, config);
    const read = readServerConfig(tmpDir);
    expect(read).toEqual(config);
  });

  it("returns null for missing config", () => {
    expect(readServerConfig(tmpDir)).toBeNull();
  });

  it("clears server config", () => {
    const config = { port: 4700, pid: process.pid, startedAt: "2026-01-01T00:00:00Z" };
    writeServerConfig(tmpDir, config);
    clearServerConfig(tmpDir);
    expect(readServerConfig(tmpDir)).toBeNull();
  });

  it("clearServerConfig is idempotent on missing file", () => {
    expect(() => clearServerConfig(tmpDir)).not.toThrow();
  });
});

// --- isServerRunning tests ---

describe("isServerRunning", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns false when no server.json exists", () => {
    expect(isServerRunning(tmpDir)).toEqual({ running: false });
  });

  it("returns true when PID is alive (this process)", () => {
    writeServerConfig(tmpDir, {
      port: 4700,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    const result = isServerRunning(tmpDir);
    expect(result.running).toBe(true);
    expect(result.port).toBe(4700);
  });

  it("returns false and cleans up for a stale PID", () => {
    writeServerConfig(tmpDir, {
      port: 4700,
      pid: 999999, // Very likely not running
      startedAt: new Date().toISOString(),
    });
    const result = isServerRunning(tmpDir);
    expect(result.running).toBe(false);
    // Should have cleaned up stale config
    expect(readServerConfig(tmpDir)).toBeNull();
  });
});

// --- GroveBroadcaster tests ---

describe("GroveBroadcaster", () => {
  function mockWs(messages: string[] = []): WSContext {
    return {
      send: (data: string) => messages.push(data),
      close: () => {},
      raw: undefined,
      readyState: 1,
      url: null,
      protocol: null,
      binaryType: "text" as BinaryType,
    } as unknown as WSContext;
  }

  it("tracks connection count", () => {
    const broadcaster = new GroveBroadcaster(mockStateProvider(), () => {});
    const ws1 = mockWs();
    const ws2 = mockWs();

    broadcaster.handleConnection(ws1);
    expect(broadcaster.getConnectionCount()).toBe(1);

    broadcaster.handleConnection(ws2);
    expect(broadcaster.getConnectionCount()).toBe(2);

    broadcaster.handleClose(ws1);
    expect(broadcaster.getConnectionCount()).toBe(1);
  });

  it("broadcasts events to all connected clients", () => {
    const broadcaster = new GroveBroadcaster(mockStateProvider(), () => {});
    const msgs1: string[] = [];
    const msgs2: string[] = [];
    const ws1 = mockWs(msgs1);
    const ws2 = mockWs(msgs2);

    broadcaster.handleConnection(ws1);
    broadcaster.handleConnection(ws2);

    broadcaster.broadcast({ type: "slot_ready", slot: 1 });

    expect(msgs1).toContain(JSON.stringify({ type: "slot_ready", slot: 1 }));
    expect(msgs2).toContain(JSON.stringify({ type: "slot_ready", slot: 1 }));
  });

  it("sends initial state on connection when plan exists", () => {
    const msgs: string[] = [];
    const ws = mockWs(msgs);

    const provider = mockStateProvider({
      getPlan: () => samplePlan,
      getState: () => ({
        ws1: { status: "running" as WorkStreamStatus, metrics: sampleMetrics },
      }),
    });

    const broadcaster = new GroveBroadcaster(provider, () => {});
    broadcaster.handleConnection(ws);

    // Should have received plan_loaded, state_change, and metrics_update
    const parsed = msgs.map((m) => JSON.parse(m));
    expect(parsed.some((e: any) => e.type === "plan_loaded")).toBe(true);
    expect(parsed.some((e: any) => e.type === "state_change")).toBe(true);
    expect(parsed.some((e: any) => e.type === "metrics_update")).toBe(true);
  });

  it("routes incoming messages to command handler", () => {
    const commands: GroveCommand[] = [];
    const broadcaster = new GroveBroadcaster(mockStateProvider(), (cmd) =>
      commands.push(cmd),
    );
    const ws = mockWs();
    broadcaster.handleConnection(ws);

    const cmd: GroveCommand = { type: "plant_slot", slot: 1 };
    broadcaster.handleMessage(ws, JSON.stringify(cmd));

    expect(commands).toEqual([cmd]);
  });

  it("ignores malformed messages", () => {
    const broadcaster = new GroveBroadcaster(mockStateProvider(), () => {});
    const ws = mockWs();
    broadcaster.handleConnection(ws);

    expect(() => broadcaster.handleMessage(ws, "not json")).not.toThrow();
  });
});

// --- Server integration tests ---

describe("startServer", () => {
  let tmpDir: string;
  let dashboardDir: string;
  let closeServer: (() => void) | null = null;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    dashboardDir = makeTmpDir();
    // Create a minimal index.html for static serving
    fs.writeFileSync(
      path.join(dashboardDir, "index.html"),
      "<html><body>Grove Dashboard</body></html>",
    );
  });

  afterEach(() => {
    if (closeServer) {
      closeServer();
      closeServer = null;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(dashboardDir, { recursive: true, force: true });
  });

  it("starts on an available port and writes server.json", async () => {
    const result = await startServer(tmpDir, dashboardDir);
    closeServer = result.close;

    expect(result.port).toBeGreaterThanOrEqual(4700);
    expect(result.port).toBeLessThanOrEqual(4799);

    const config = readServerConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.port).toBe(result.port);
    expect(config!.pid).toBe(process.pid);
  });

  it("cleans up server.json on close", async () => {
    const result = await startServer(tmpDir, dashboardDir);
    result.close();
    closeServer = null;

    expect(readServerConfig(tmpDir)).toBeNull();
  });

  it("serves REST API endpoints, static files, and exposes broadcaster", async () => {
    const provider = mockStateProvider({
      getPlan: () => samplePlan,
      getState: () => ({
        ws1: { status: "running" as WorkStreamStatus, metrics: sampleMetrics },
      }),
    });

    const result = await startServer(tmpDir, dashboardDir, provider);
    closeServer = result.close;

    // Test GET /api/plan
    const planRes = await fetch(`http://127.0.0.1:${result.port}/api/plan`);
    expect(planRes.ok).toBe(true);
    const planData = await planRes.json();
    expect(planData.name).toBe("test-plan");

    // Test GET /api/state
    const stateRes = await fetch(`http://127.0.0.1:${result.port}/api/state`);
    expect(stateRes.ok).toBe(true);
    const stateData = await stateRes.json();
    expect(stateData.ws1.status).toBe("running");

    // Test POST /api/command
    const cmdRes = await fetch(
      `http://127.0.0.1:${result.port}/api/command`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "plant_slot", slot: 1 }),
      },
    );
    expect(cmdRes.ok).toBe(true);
    const cmdData = await cmdRes.json();
    expect(cmdData.ok).toBe(true);

    // Test static dashboard file serving
    const staticRes = await fetch(`http://127.0.0.1:${result.port}/`);
    expect(staticRes.ok).toBe(true);
    const html = await staticRes.text();
    expect(html).toContain("Grove Dashboard");

    // Test broadcaster is exposed
    expect(result.broadcaster).toBeDefined();
    expect(result.broadcaster.getConnectionCount()).toBe(0);
  });
});
