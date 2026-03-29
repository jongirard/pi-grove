import { useState, useEffect, useRef, useCallback } from "react";
import type { GroveCommand, GroveEvent } from "../lib/types.js";

export function useWebSocket(url: string): {
  connected: boolean;
  sendCommand: (cmd: GroveCommand) => void;
  lastEvent: GroveEvent | null;
  events: GroveEvent[];
  injectEvent: (event: GroveEvent) => void;
} {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<GroveEvent | null>(null);
  const [events, setEvents] = useState<GroveEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!url) return; // Skip connection (e.g. demo mode)
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        reconnectTimerRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as GroveEvent;
          setLastEvent(parsed);
          setEvents((prev) => [...prev, parsed]);
        } catch {
          // ignore malformed messages
        }
      };
    } catch {
      reconnectTimerRef.current = setTimeout(connect, 2000);
    }
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendCommand = useCallback((cmd: GroveCommand) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
    }
  }, []);

  const injectEvent = useCallback((event: GroveEvent) => {
    setLastEvent(event);
    setEvents((prev) => [...prev, event]);
  }, []);

  return { connected, sendCommand, lastEvent, events, injectEvent };
}
