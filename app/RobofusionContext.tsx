"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import type { Zone, Incident, User, Role } from "@/src/server/types";

type WsStatus = "CONNECTING" | "CONNECTED" | "RECONNECTING" | "OFFLINE";

export type NotificationType = "success" | "error" | "info";
export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
}

export interface RobofusionState {
  zones: Zone[];
  incidents: Incident[];
  user: { id: string; name: string; email: string; role: Role } | null;
  csrfToken: string | null;
  wsStatus: WsStatus;
  notifications: NotificationItem[];
  priorityQueue: any[];
  systemHealth: any;
  
  login: (email: string, pass: string) => Promise<boolean>;
  logout: () => Promise<void>;
  acknowledgeIncident: (incidentId: string) => Promise<boolean>;
  reportNote: (text: string) => Promise<{ validated: boolean, message?: string }>;
  toggleOverride: (zoneCode: string, action: string) => Promise<boolean>;
  addNotification: (type: NotificationType, message: string) => void;
  removeNotification: (id: string) => void;
}

const Context = createContext<RobofusionState | null>(null);

export function useRobofusion() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useRobofusion must be used within RobofusionProvider");
  return ctx;
}

export function RobofusionProvider({ children }: { children: ReactNode }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [user, setUser] = useState<RobofusionState["user"]>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("CONNECTING");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [priorityQueue, setPriorityQueue] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  
  const addNotification = useCallback((type: NotificationType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
  }, []);
  
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<number | null>(null);

  // Initialize auth from session storage if possible
  useEffect(() => {
    const storedAuth = sessionStorage.getItem("scs-user");
    const storedCsrf = sessionStorage.getItem("scs-csrf");
    if (storedAuth && storedCsrf) {
      try {
        setUser(JSON.parse(storedAuth));
        setCsrfToken(storedCsrf);
      } catch (e) {}
    }
  }, []);

  const connectWs = useCallback(() => {
    if (typeof window === "undefined") return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setWsStatus(prev => prev === "OFFLINE" ? "RECONNECTING" : prev);
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("CONNECTED");
      reconnectAttempts.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.event_type === "SNAPSHOT") {
          setZones(payload.data.zones || []);
          setIncidents(payload.data.incidents || []);
          if (payload.data.priority_queue) setPriorityQueue(payload.data.priority_queue);
        } else if (payload.event_type === "ZONE_CONNECTIVITY_CHANGED") {
          setZones(prev => prev.map(z => z.id === payload.data.zone_id ? { ...z, connectivityState: payload.data.connectivity_state } : z));
        } else if (payload.event_type === "PRIORITY_QUEUE_UPDATED") {
          if (payload.data?.queue) setPriorityQueue(payload.data.queue);
        } else {
          // Merge partial updates
          if (payload.data?.zone) {
            setZones(prev => prev.map(z => z.id === payload.data.zone.id ? payload.data.zone : z));
          } else if (payload.data?.zones) {
            const updatedIds = payload.data.zones.map((z: any) => z.id);
            setZones(prev => prev.map(z => updatedIds.includes(z.id) ? payload.data.zones.find((uz: any) => uz.id === z.id) : z));
          }
          if (payload.data?.incident) {
            setIncidents(prev => {
              const exists = prev.some(i => i.id === payload.data.incident.id);
              if (exists) return prev.map(i => i.id === payload.data.incident.id ? payload.data.incident : i);
              return [...prev, payload.data.incident];
            });
          }
        }
      } catch (err) {
        console.error("WS Parse Error", err);
      }
    };

    ws.onclose = () => {
      setWsStatus("OFFLINE");
      wsRef.current = null;
      
      // Exponential backoff reconnect
      const backoff = Math.min(1000 * Math.pow(1.5, reconnectAttempts.current), 30000);
      reconnectAttempts.current += 1;
      
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = window.setTimeout(connectWs, backoff);
    };

    ws.onerror = () => {
      // Handled by onclose
    };
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/dashboard/snapshot");
      if (res.ok) {
        const data = await res.json();
        setZones(data.zones || []);
        setIncidents(data.incidents || []);
        setPriorityQueue(data.priority_queue || []);
        setSystemHealth(data.system_health || null);
      }
    } catch (e) {
      console.error("Snapshot fetch error", e);
    }
  }, []);

  useEffect(() => {
    // Only connect if we have a user (authenticated)
    if (user) {
      fetchSnapshot();
      connectWs();
    } else {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsStatus("OFFLINE");
    }
    
    // Add polling fallback for snapshot
    let interval: number;
    if (user) {
      interval = window.setInterval(() => {
        if (wsStatus === "OFFLINE" || wsStatus === "RECONNECTING") {
          fetchSnapshot();
        }
      }, 5000);
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      if (interval) window.clearInterval(interval);
    };
  }, [user, connectWs, fetchSnapshot, wsStatus]);

  const apiHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {})
  }), [csrfToken]);

  const login = async (email: string, pass: string) => {
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass })
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setCsrfToken(data.csrfToken);
        sessionStorage.setItem("scs-user", JSON.stringify(data.user));
        sessionStorage.setItem("scs-csrf", data.csrfToken);
        addNotification("success", "Authentication successful.");
        return true;
      } else {
        const err = await res.json().catch(() => null);
        addNotification("error", err?.message || "Invalid credentials.");
      }
    } catch (e) {
      console.error("Login failed", e);
      addNotification("error", "Network error. Unable to connect to server.");
    }
    return false;
  };

  const logout = async () => {
    try {
      const res = await fetch("/api/v1/auth/logout", { method: "POST", headers: apiHeaders() });
      if (res.ok) addNotification("info", "Logged out securely.");
    } catch {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      setCsrfToken(null);
      sessionStorage.removeItem("scs-user");
      sessionStorage.removeItem("scs-csrf");
      sessionStorage.removeItem("scs-auth");
    }
  };

  const acknowledgeIncident = async (incidentId: string) => {
    try {
      const res = await fetch(`/api/v1/incidents/${incidentId}/acknowledge`, {
        method: "POST",
        headers: apiHeaders()
      });
      if (res.ok) {
        addNotification("success", "Incident acknowledged successfully.");
        return true;
      }
      addNotification("error", "Failed to acknowledge incident.");
      return false;
    } catch {
      addNotification("error", "Network error while acknowledging incident.");
      return false;
    }
  };

  const reportNote = async (text: string) => {
    try {
      const res = await fetch("/api/v1/reports/note", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (res.ok) {
        addNotification("success", "Note validated and associated with incident.");
        return { validated: true, message: data.advisory || `Parsed: ${data.signal?.hazard} in ${data.signal?.zoneCode}` };
      } else {
        addNotification("error", data.message || "Failed to parse report.");
        return { validated: false, message: data.message || "Failed to parse report." };
      }
    } catch {
      addNotification("error", "Network error while reporting note.");
      return { validated: false, message: "Network error." };
    }
  };

  const toggleOverride = async (zoneCode: string, action: string) => {
    try {
      const isClear = action === "CLEAR";
      const url = isClear ? `/api/v1/admin/override?zone=${zoneCode}` : `/api/v1/admin/override`;
      const res = await fetch(url, {
        method: isClear ? "DELETE" : "POST",
        headers: apiHeaders(),
        ...(isClear ? {} : { body: JSON.stringify({ zoneCode, action, reason: "Manual override triggered from UI" }) })
      });
      if (res.ok) {
        addNotification("success", `Override action '${action}' applied to ${zoneCode}.`);
        return true;
      }
      addNotification("error", "Failed to apply manual override.");
      return false;
    } catch {
      addNotification("error", "Network error while applying override.");
      return false;
    }
  };

  return (
    <Context.Provider value={{ zones, incidents, user, csrfToken, wsStatus, notifications, priorityQueue, systemHealth, login, logout, acknowledgeIncident, reportNote, toggleOverride, addNotification, removeNotification }}>
      {children}
    </Context.Provider>
  );
}
