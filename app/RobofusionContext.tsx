"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type Role = "ADMIN" | "SECURITY_STAFF";
export type SafetyState = "SAFE" | "WARNING" | "CRITICAL";
export type ConnectivityState = "ONLINE" | "DEGRADED" | "OFFLINE" | "NOT_CONFIGURED";
export type HazardType = "FIRE" | "GAS" | "FLOOD" | "OCCUPANCY" | "NONE";
export type WsStatus = "CONNECTING" | "CONNECTED" | "RECONNECTING" | "OFFLINE";

export interface DashboardSensor {
  id: string;
  sensorType: "FIRE" | "GAS" | "WATER" | "PIR" | "CAMERA";
  status: "ONLINE" | "OFFLINE" | "DEGRADED" | "WARMING_UP" | "NOT_CONFIGURED";
  lastSeenAt: string | null;
  warmupSeconds: number;
}

export interface DashboardZone {
  id: string;
  code: string;
  name: string;
  configured: boolean;
  state: SafetyState;
  riskScore: number;
  primaryHazard: HazardType | null;
  occupancy: boolean;
  cameraOccupancy?: boolean;
  connectivityState: ConnectivityState;
  lastReadingAt: string | null;
  lastObservedAt?: string | null;
  lastReceivedAt?: string | null;
  lastSequence: number | null;
  commandVersion: number;
  riskComponents?: { fire: number; gas: number; water: number; occupancy: number };
  recentRiskScores?: number[];
  isTrendingCritical?: boolean;
  warningSince?: string | null;
  criticalSince?: string | null;
  stateVersion?: number;
  sensors?: DashboardSensor[];
  prediction?: {
    probability: number;
    horizonMinutes: number;
    modelVersion: string;
    advisoryOnly: true;
    predictedAt: string;
  } | null;
}

export interface IncidentRecord {
  id: string;
  zoneId: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  active: boolean;
  severity: "CRITICAL";
  primaryHazard: HazardType;
  initialRiskScore: number;
  peakRiskScore: number;
  startedAt: string;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  resolvedAt?: string | null;
  resolutionReason?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PriorityItem {
  rank: number;
  incident_id: string;
  zone_id: string;
  zone_code: string;
  zone_name: string;
  status: "OPEN" | "ACKNOWLEDGED";
  risk_score: number;
  priority_score: number;
  occupancy: boolean;
  critical_duration_seconds: number;
  primary_hazard: HazardType;
  started_at: string;
  acknowledged_at?: string | null;
  nlp_advisory_bonus: number;
  ranking_reason: string;
}

export interface SystemHealth {
  configured_zones: number;
  online_zones: number;
  degraded_zones?: number;
  offline_zones: number;
  critical_zones: number;
  warning_zones: number;
  safe_zones: number;
  open_incidents: number;
  acknowledged_incidents: number;
}

export interface IncidentTimelineEvent {
  id: string;
  incidentId: string | null;
  zoneId: string;
  eventType: string;
  eventSource: string;
  actorUserId: string | null;
  description: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface ZoneDetailsPayload {
  zone: DashboardZone;
  sensors: DashboardSensor[];
  events: IncidentTimelineEvent[];
  trend: { status: string; slope: number; window: number; latestRisk?: number };
  prediction: {
    probability: number;
    modelVersion: string;
    advisoryOnly: true;
    horizonMinutes: number;
    predictedAt: string;
    liveRiskScore: number;
    featureSnapshot: Record<string, number>;
  } | null;
  readings: Array<{
    id: string;
    observedAt: string;
    receivedAt: string;
    fire: boolean;
    gas: number;
    water: number;
    pir: boolean;
    riskScore: number;
    calculatedState: SafetyState;
    primaryHazard: HazardType;
    sensorHealth: string;
  }>;
  raw_readings_visible: boolean;
  prediction_safety: string;
}

export type NotificationType = "success" | "error" | "info" | "critical";
export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
}

interface IncidentQuery {
  status?: "active" | "resolved" | "all" | "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  zoneId?: string;
  zoneCode?: string;
  hazard?: HazardType;
  from?: string;
  to?: string;
}

export interface RobofusionState {
  zones: DashboardZone[];
  activeIncidents: IncidentRecord[];
  incidents: IncidentRecord[];
  priorityQueue: PriorityItem[];
  systemHealth: SystemHealth | null;
  user: { id: string; name: string; email: string; role: Role } | null;
  csrfToken: string | null;
  authChecked: boolean;
  dataLoading: boolean;
  wsStatus: WsStatus;
  lastSyncAt: string | null;
  notifications: NotificationItem[];

  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshSnapshot: (silent?: boolean) => Promise<void>;
  queryIncidents: (query?: IncidentQuery) => Promise<IncidentRecord[]>;
  fetchIncidentTimeline: (incidentId: string) => Promise<{ incident: IncidentRecord; events: IncidentTimelineEvent[] } | null>;
  fetchZoneDetails: (zoneCode: string) => Promise<ZoneDetailsPayload | null>;
  fetchAdminHealth: () => Promise<Record<string, unknown> | null>;
  acknowledgeIncident: (incidentId: string) => Promise<boolean>;
  reportNote: (text: string) => Promise<{ validated: boolean; message?: string; data?: Record<string, unknown> }>;
  applyOverride: (zoneCode: string, action: "SILENCE" | "RESET" | "TEST_ACTUATOR") => Promise<boolean>;
  clearOverride: (zoneCode: string) => Promise<boolean>;
  addNotification: (type: NotificationType, message: string) => void;
  removeNotification: (id: string) => void;
}

const Context = createContext<RobofusionState | null>(null);

export function useRobofusion() {
  const context = useContext(Context);
  if (!context) throw new Error("useRobofusion must be used within RobofusionProvider");
  return context;
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (body as { message?: string; error?: string }).message
      ?? (body as { error?: string }).error
      ?? `Request failed (${response.status})`;
    throw Object.assign(new Error(message), { status: response.status, body });
  }
  return body as T;
}

function playCriticalTone() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextCtor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Browsers may block audio before an interaction; visual alerts still remain.
  }
}

export function RobofusionProvider({ children }: { children: ReactNode }) {
  const [zones, setZones] = useState<DashboardZone[]>([]);
  const [activeIncidents, setActiveIncidents] = useState<IncidentRecord[]>([]);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [priorityQueue, setPriorityQueue] = useState<PriorityItem[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [user, setUser] = useState<RobofusionState["user"]>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>("OFFLINE");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const userRef = useRef(user);
  const csrfRef = useRef(csrfToken);
  const zonesRef = useRef(zones);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const notifiedIncidentIdsRef = useRef(new Set<string>());
  const refreshDebounceRef = useRef<number | null>(null);
  const connectWebSocketRef = useRef<() => void>(() => undefined);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { csrfRef.current = csrfToken; }, [csrfToken]);
  useEffect(() => { zonesRef.current = zones; }, [zones]);

  const addNotification = useCallback((type: NotificationType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setNotifications(previous => [...previous, { id, type, message }]);
    const timeout = type === "critical" ? 9000 : 5000;
    window.setTimeout(() => {
      setNotifications(previous => previous.filter(notification => notification.id !== id));
    }, timeout);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(previous => previous.filter(notification => notification.id !== id));
  }, []);

  const clearLocalAuth = useCallback(() => {
    setUser(null);
    setCsrfToken(null);
    setZones([]);
    setActiveIncidents([]);
    setIncidents([]);
    setPriorityQueue([]);
    setSystemHealth(null);
    notifiedIncidentIdsRef.current.clear();
    sessionStorage.removeItem("scs-user");
    sessionStorage.removeItem("scs-csrf");
  }, []);

  const notifyOpenIncidents = useCallback((nextIncidents: IncidentRecord[], nextZones: DashboardZone[]) => {
    for (const incident of nextIncidents) {
      if (incident.status !== "OPEN" || notifiedIncidentIdsRef.current.has(incident.id)) continue;
      notifiedIncidentIdsRef.current.add(incident.id);
      const zone = nextZones.find(item => item.id === incident.zoneId);
      addNotification(
        "critical",
        `${zone?.name ?? incident.zoneId}: ${incident.primaryHazard} incident requires acknowledgement.`,
      );
      playCriticalTone();
    }
  }, [addNotification]);

  const applySnapshot = useCallback((snapshot: {
    snapshot_at?: string;
    zones?: DashboardZone[];
    incidents?: IncidentRecord[];
    priority_queue?: PriorityItem[];
    system_health?: SystemHealth;
  }) => {
    const nextZones = snapshot.zones ?? [];
    const nextActive = snapshot.incidents ?? [];
    setZones(nextZones);
    setActiveIncidents(nextActive);
    setPriorityQueue(snapshot.priority_queue ?? []);
    if (snapshot.system_health) setSystemHealth(snapshot.system_health);
    setLastSyncAt(snapshot.snapshot_at ?? new Date().toISOString());
    notifyOpenIncidents(nextActive, nextZones);
  }, [notifyOpenIncidents]);

  const refreshSnapshot = useCallback(async (silent = false) => {
    if (!userRef.current) return;
    if (!silent) setDataLoading(true);
    try {
      const response = await fetch("/api/v1/dashboard/snapshot", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const snapshot = await responseJson<{
        snapshot_at: string;
        zones: DashboardZone[];
        incidents: IncidentRecord[];
        priority_queue: PriorityItem[];
        system_health: SystemHealth;
      }>(response);
      applySnapshot(snapshot);
    } catch (error) {
      if ((error as { status?: number }).status === 401) clearLocalAuth();
      else if (!silent) addNotification("error", error instanceof Error ? error.message : "Snapshot unavailable.");
      throw error;
    } finally {
      if (!silent) setDataLoading(false);
    }
  }, [addNotification, applySnapshot, clearLocalAuth]);

  const queryIncidents = useCallback(async (query: IncidentQuery = {}) => {
    if (!userRef.current) return [];
    const params = new URLSearchParams();
    params.set("status", query.status ?? "all");
    if (query.zoneId) params.set("zoneId", query.zoneId);
    if (query.zoneCode) params.set("zoneCode", query.zoneCode);
    if (query.hazard && query.hazard !== "NONE") params.set("hazard", query.hazard);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    const response = await fetch(`/api/v1/incidents?${params.toString()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = await responseJson<{ incidents: IncidentRecord[] }>(response);
    setIncidents(data.incidents);
    return data.incidents;
  }, []);

  const fetchIncidentTimeline = useCallback(async (incidentId: string) => {
    try {
      const response = await fetch(`/api/v1/incidents/${encodeURIComponent(incidentId)}/timeline`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      return await responseJson<{ incident: IncidentRecord; events: IncidentTimelineEvent[] }>(response);
    } catch (error) {
      addNotification("error", error instanceof Error ? error.message : "Timeline unavailable.");
      return null;
    }
  }, [addNotification]);

  const fetchZoneDetails = useCallback(async (zoneCode: string) => {
    try {
      const response = await fetch(`/api/v1/zones/${encodeURIComponent(zoneCode)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      return await responseJson<ZoneDetailsPayload>(response);
    } catch (error) {
      addNotification("error", error instanceof Error ? error.message : "Zone details unavailable.");
      return null;
    }
  }, [addNotification]);

  const fetchAdminHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/admin/system-health", {
        cache: "no-store",
        credentials: "same-origin",
      });
      return await responseJson<Record<string, unknown>>(response);
    } catch (error) {
      addNotification("error", error instanceof Error ? error.message : "System health unavailable.");
      return null;
    }
  }, [addNotification]);

  const scheduleAuthoritativeRefresh = useCallback(() => {
    if (refreshDebounceRef.current) window.clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = window.setTimeout(() => {
      void Promise.allSettled([refreshSnapshot(true), queryIncidents({ status: "all" })]);
    }, 150);
  }, [queryIncidents, refreshSnapshot]);

  const connectWebSocket = useCallback(() => {
    if (typeof window === "undefined" || !userRef.current) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;

    intentionalCloseRef.current = false;
    setWsStatus(reconnectAttemptsRef.current > 0 ? "RECONNECTING" : "CONNECTING");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = socket;

    socket.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setWsStatus("CONNECTED");
    };

    socket.onmessage = event => {
      try {
        const envelope = JSON.parse(event.data) as {
          event_type?: string;
          data?: Record<string, unknown>;
        };
        const eventType = envelope.event_type ?? "UNKNOWN";
        const data = envelope.data ?? {};

        if (eventType === "SNAPSHOT") {
          // Current server sends the complete snapshot in data; older deployments may
          // send the four fields directly. Both shapes are accepted during rollout.
          applySnapshot(data as Parameters<typeof applySnapshot>[0]);
          return;
        }

        if (data.zone) {
          const incoming = data.zone as DashboardZone;
          setZones(previous => {
            const exists = previous.some(zone => zone.id === incoming.id);
            return exists
              ? previous.map(zone => zone.id === incoming.id ? { ...zone, ...incoming } : zone)
              : [...previous, incoming];
          });
        }
        if (data.incident) {
          const incoming = data.incident as IncidentRecord;
          setActiveIncidents(previous => {
            if (!incoming.active || incoming.status === "RESOLVED") {
              return previous.filter(incident => incident.id !== incoming.id);
            }
            const exists = previous.some(incident => incident.id === incoming.id);
            return exists
              ? previous.map(incident => incident.id === incoming.id ? incoming : incident)
              : [incoming, ...previous];
          });
          setIncidents(previous => {
            const exists = previous.some(incident => incident.id === incoming.id);
            return exists
              ? previous.map(incident => incident.id === incoming.id ? incoming : incident)
              : [incoming, ...previous];
          });
          if (eventType === "INCIDENT_CREATED" && incoming.status === "OPEN") {
            const zone = data.zone as DashboardZone | undefined;
            notifyOpenIncidents([incoming], zone ? [zone] : zonesRef.current);
          }
        }

        if ([
          "PRIORITY_QUEUE_UPDATED",
          "INCIDENT_CREATED",
          "INCIDENT_ACKNOWLEDGED",
          "INCIDENT_RESOLVED",
          "ZONE_CONNECTIVITY_CHANGED",
          "ZONE_STATE_CHANGED",
        ].includes(eventType)) {
          scheduleAuthoritativeRefresh();
        }
      } catch (error) {
        console.error("WebSocket message parse failed", error);
      }
    };

    socket.onclose = () => {
      wsRef.current = null;
      if (intentionalCloseRef.current || !userRef.current) {
        setWsStatus("OFFLINE");
        return;
      }
      reconnectAttemptsRef.current += 1;
      setWsStatus(reconnectAttemptsRef.current >= 5 ? "OFFLINE" : "RECONNECTING");
      const delay = Math.min(1000 * 1.7 ** reconnectAttemptsRef.current, 30_000);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = window.setTimeout(() => connectWebSocketRef.current(), delay);
    };

    socket.onerror = () => {
      // onclose owns reconnect and fallback polling.
    };
  }, [applySnapshot, notifyOpenIncidents, scheduleAuthoritativeRefresh]);

  useEffect(() => {
    connectWebSocketRef.current = connectWebSocket;
  }, [connectWebSocket]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/v1/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const data = await responseJson<{
          user: NonNullable<RobofusionState["user"]>;
          csrfToken: string;
        }>(response);
        if (cancelled) return;
        setUser(data.user);
        setCsrfToken(data.csrfToken);
        sessionStorage.setItem("scs-user", JSON.stringify(data.user));
        sessionStorage.setItem("scs-csrf", data.csrfToken);
      } catch {
        // An unauthenticated first load is expected on the login page.
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user) {
      intentionalCloseRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWsStatus("OFFLINE");
      return;
    }

    void Promise.allSettled([refreshSnapshot(), queryIncidents({ status: "all" })]);
    connectWebSocket();

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connectWebSocket, queryIncidents, refreshSnapshot, user]);

  useEffect(() => {
    if (!user) return;
    const intervalMs = wsStatus === "CONNECTED" ? 15_000 : 2_000;
    const timer = window.setInterval(() => {
      void refreshSnapshot(true).catch(() => undefined);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [refreshSnapshot, user, wsStatus]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      const data = await responseJson<{
        user: NonNullable<RobofusionState["user"]>;
        csrfToken: string;
      }>(response);
      setUser(data.user);
      setCsrfToken(data.csrfToken);
      sessionStorage.setItem("scs-user", JSON.stringify(data.user));
      sessionStorage.setItem("scs-csrf", data.csrfToken);
      addNotification("success", `Signed in as ${data.user.name}.`);
      return true;
    } catch (error) {
      addNotification("error", error instanceof Error ? error.message : "Authentication failed.");
      return false;
    }
  }, [addNotification]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: csrfRef.current ? { "X-CSRF-Token": csrfRef.current } : {},
        credentials: "same-origin",
      });
    } finally {
      intentionalCloseRef.current = true;
      wsRef.current?.close();
      clearLocalAuth();
      addNotification("info", "Session closed.");
    }
  }, [addNotification, clearLocalAuth]);

  const acknowledgeIncident = useCallback(async (incidentId: string) => {
    try {
      const response = await fetch(`/api/v1/incidents/${encodeURIComponent(incidentId)}/acknowledge`, {
        method: "POST",
        headers: csrfRef.current ? { "X-CSRF-Token": csrfRef.current } : {},
        credentials: "same-origin",
      });
      await responseJson(response);
      addNotification("success", "Incident acknowledged. Active attention cue cleared.");
      await Promise.allSettled([refreshSnapshot(true), queryIncidents({ status: "all" })]);
      return true;
    } catch (error) {
      addNotification("error", error instanceof Error ? error.message : "Acknowledgement failed.");
      return false;
    }
  }, [addNotification, queryIncidents, refreshSnapshot]);

  const reportNote = useCallback(async (text: string) => {
    try {
      const response = await fetch("/api/v1/reports/note", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfRef.current ? { "X-CSRF-Token": csrfRef.current } : {}),
        },
        credentials: "same-origin",
        body: JSON.stringify({ text }),
      });
      const data = await responseJson<Record<string, unknown>>(response);
      addNotification("success", "Report parsed and passed the deterministic validation gate.");
      await refreshSnapshot(true);
      return {
        validated: true,
        message: String(data.advisory ?? "Validated advisory evidence stored."),
        data,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Report validation failed.";
      addNotification("error", message);
      return { validated: false, message };
    }
  }, [addNotification, refreshSnapshot]);

  const applyOverride = useCallback(async (
    zoneCode: string,
    action: "SILENCE" | "RESET" | "TEST_ACTUATOR",
  ) => {
    try {
      const response = await fetch("/api/v1/admin/override", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfRef.current ? { "X-CSRF-Token": csrfRef.current } : {}),
        },
        credentials: "same-origin",
        body: JSON.stringify({
          zoneCode,
          action,
          reason: `Admin ${action.toLowerCase()} action from command dashboard`,
          expiresInMinutes: 30,
        }),
      });
      await responseJson(response);
      addNotification("success", `${action} override applied to ${zoneCode}.`);
      await refreshSnapshot(true);
      return true;
    } catch (error) {
      addNotification("error", error instanceof Error ? error.message : "Override failed.");
      return false;
    }
  }, [addNotification, refreshSnapshot]);

  const clearOverride = useCallback(async (zoneCode: string) => {
    try {
      const response = await fetch(`/api/v1/admin/override?zone=${encodeURIComponent(zoneCode)}`, {
        method: "DELETE",
        headers: csrfRef.current ? { "X-CSRF-Token": csrfRef.current } : {},
        credentials: "same-origin",
      });
      await responseJson(response);
      addNotification("success", `Active override cleared for ${zoneCode}.`);
      await refreshSnapshot(true);
      return true;
    } catch (error) {
      addNotification("error", error instanceof Error ? error.message : "Unable to clear override.");
      return false;
    }
  }, [addNotification, refreshSnapshot]);

  return (
    <Context.Provider value={{
      zones,
      activeIncidents,
      incidents,
      priorityQueue,
      systemHealth,
      user,
      csrfToken,
      authChecked,
      dataLoading,
      wsStatus,
      lastSyncAt,
      notifications,
      login,
      logout,
      refreshSnapshot,
      queryIncidents,
      fetchIncidentTimeline,
      fetchZoneDetails,
      fetchAdminHealth,
      acknowledgeIncident,
      reportNote,
      applyOverride,
      clearOverride,
      addNotification,
      removeNotification,
    }}>
      {children}
    </Context.Provider>
  );
}
