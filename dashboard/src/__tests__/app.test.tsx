import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../App.js";

// ── Mock WebSocket globally (jsdom has no native WebSocket) ────────

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  protocol = "";
  extensions = "";
  bufferedAmount = 0;
  binaryType: BinaryType = "blob";

  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  constructor(url: string | URL, _protocols?: string | string[]) {
    this.url = typeof url === "string" ? url : url.toString();
  }

  send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {}
  close(_code?: number, _reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(_event: Event): boolean {
    return true;
  }
}

beforeAll(() => {
  vi.stubGlobal("WebSocket", MockWebSocket);
});

// ── Tests ───────────────────────────────────────────────────────────

describe("Dashboard App", () => {
  it("renders without crashing", () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it("renders header with Grove branding", () => {
    render(<App />);
    expect(screen.getByText("Grove")).toBeInTheDocument();
  });

  it("shows 'No plan loaded' in sidebar when no WebSocket data", () => {
    render(<App />);
    expect(screen.getByText("No plan loaded")).toBeInTheDocument();
  });

  it("shows placeholder in main area", () => {
    render(<App />);
    expect(screen.getByText("Select a work stream to begin")).toBeInTheDocument();
  });
});
