import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createBrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  useNavigate,
  useParams,
} from "react-router";
import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  ClipboardList,
  CloudOff,
  Database,
  Droplets,
  Eye,
  EyeOff,
  FileText,
  Flame,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Network,
  Radio,
  RefreshCw,
  Search,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  Users,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import {
  RobofusionProvider,
  useRobofusion,
  type ConnectivityState,
  type DashboardZone,
  type HazardType,
  type IncidentRecord,
  type IncidentTimelineEvent,
  type PriorityItem,
  type SafetyState,
  type ZoneDetailsPayload,
} from "./RobofusionContext";

type DisplayStatus = SafetyState | "ONLINE" | "OFFLINE" | "DEGRADED" | "NOT_CONFIGURED";
type ThemeMode = "dark" | "light";

const shell = "border border-[var(--border)] bg-[var(--surface-1)]/90 shadow-[0_16px_48px_rgba(0,0,0,.28)] backdrop-blur-xl";
const dataText = "font-['JetBrains_Mono','IBM_Plex_Mono',monospace] tabular-nums text-[12px] tracking-[.01em]";

const hazardLabels: Record<HazardType, string> = {
  FIRE: "Fire / flame",
  GAS: "Gas concentration",
  FLOOD: "Water / flood",
  OCCUPANCY: "Occupancy",
  NONE: "No active hazard",
};

const statusStyles: Record<DisplayStatus, { text: string; surface: string; stripe: string; icon: typeof CircleCheck }> = {
  ONLINE:         { text: "text-[var(--safe-ink)]",     surface: "border-[var(--safe-border)]     bg-[var(--safe-surface)]",     stripe: "bg-[var(--risk-safe)]",     icon: Wifi },
  SAFE:           { text: "text-[var(--safe-ink)]",     surface: "border-[var(--safe-border)]     bg-[var(--safe-surface)]",     stripe: "bg-[var(--risk-safe)]",     icon: CircleCheck },
  WARNING:        { text: "text-[var(--warning-ink)]",  surface: "border-[var(--warning-border)]  bg-[var(--warning-surface)]",  stripe: "bg-[var(--risk-warning)]",  icon: AlertTriangle },
  CRITICAL:       { text: "text-[var(--critical-ink)]", surface: "border-[var(--critical-border)] bg-[var(--critical-surface)]", stripe: "bg-[var(--risk-critical)]", icon: ShieldAlert },
  DEGRADED:       { text: "text-[var(--warning-ink)]",  surface: "border-[var(--warning-border)]  bg-[var(--warning-surface)]",  stripe: "bg-[var(--risk-warning)]",  icon: CircleAlert },
  OFFLINE:        { text: "text-[var(--offline-ink)]",  surface: "border-[var(--offline-border)]  bg-[var(--offline-surface)]",  stripe: "bg-[var(--risk-offline)]",  icon: WifiOff },
  NOT_CONFIGURED: { text: "text-[var(--offline-ink)]",  surface: "border-[var(--offline-border)]  bg-[var(--offline-surface)]",  stripe: "bg-[var(--risk-offline)]",  icon: CloudOff },
};

function displayStatus(zone: DashboardZone): DisplayStatus {
  if (zone.connectivityState === "OFFLINE") return "OFFLINE";
  if (zone.connectivityState === "DEGRADED") return "DEGRADED";
  if (zone.connectivityState === "NOT_CONFIGURED") return "NOT_CONFIGURED";
  return zone.state;
}

function zoneIconEl(code: string, size: number) {
  if (code.includes("SERVER")) return <Server size={size} />;
  if (code.includes("IOT")) return <Wifi size={size} />;
  if (code.includes("ROBOT")) return <Bot size={size} />;
  if (code.includes("DATA")) return <Gauge size={size} />;
  return <Network size={size} />;
}

function hazardIconEl(hazard?: HazardType | null, size = 11) {
  if (hazard === "FIRE") return <Flame size={size} />;
  if (hazard === "GAS") return <Activity size={size} />;
  if (hazard === "FLOOD") return <Droplets size={size} />;
  if (hazard === "OCCUPANCY") return <Users size={size} />;
  return <ShieldCheck size={size} />;
}

function dateLabel(value?: string | Date | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function shortTime(value?: string | Date | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function durationLabel(start?: string | null, end?: string | null) {
  if (!start) return "—";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "—";
  const totalSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function secondsLabel(value: number) {
  const totalSeconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}



function useThemeMode() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("scs-theme");
    return stored === "light" ? "light" : "dark";
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("theme-light", theme === "light");
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("scs-theme", theme);
  }, [theme]);
  return [theme, setTheme] as const;
}

function StatusBadge({ status, compact = false }: { status: DisplayStatus; compact?: boolean }) {
  const tone = statusStyles[status];
  const Icon = tone.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] ${tone.surface} ${tone.text} ${dataText} ${compact ? "text-[10px]" : "text-[11px]"} font-medium`}>
      <Icon size={compact ? 10 : 12} strokeWidth={2.2} />
      {status.replace("_", " ")}
    </span>
  );
}

function ConnectivityBadge({ state }: { state: ConnectivityState }) {
  const status: DisplayStatus = state;
  return <StatusBadge status={status} compact />;
}

function RiskRing({ value, status }: { value: number; status: DisplayStatus }) {
  const tone = statusStyles[status];
  const clamped = Math.max(0, Math.min(100, value));
  const color = status === "OFFLINE" || status === "NOT_CONFIGURED"
    ? "var(--risk-offline)"
    : status === "CRITICAL"
      ? "var(--risk-critical)"
      : status === "WARNING" || status === "DEGRADED"
        ? "var(--risk-warning)"
        : "var(--risk-safe)";
  return (
    <div
      className="relative grid size-[54px] place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} ${clamped * 3.6}deg, var(--risk-track) 0deg)` }}
      aria-label={`Risk score ${value}`}
    >
      <div className="grid size-[42px] place-items-center rounded-full" style={{ background: "var(--surface-1)" }}>
        <span className={`${dataText} text-[13px] font-medium ${tone.text}`}>{status === "OFFLINE" ? "—" : Math.round(value)}</span>
      </div>
    </div>
  );
}

function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink-3)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--foreground)]"
    >
      {children}
    </button>
  );
}

function LoadingBlock({ label = "Synchronizing command data…" }: { label?: string }) {
  return (
    <div className={`${shell} flex min-h-[240px] items-center justify-center rounded-xl`}>
      <div className="text-center text-[var(--ink-3)]">
        <RefreshCw className="mx-auto animate-spin text-[var(--primary)]" size={18} />
        <p className="mt-3 text-[12px]">{label}</p>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className={`${shell} rounded-xl px-6 py-14 text-center`}>
      <CircleAlert className="mx-auto text-[var(--ink-4)]" size={20} />
      <p className="mt-3 text-[14px] font-medium text-[var(--foreground)]">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-[12px] leading-6 text-[var(--ink-3)]">{body}</p>
    </div>
  );
}

function PageIntro({ eyebrow, title, children, action }: { eyebrow: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className={`${dataText} text-[10px] tracking-[.2em] text-[var(--primary)] uppercase`}>{eyebrow}</p>
        <h1 className="mt-2 font-['IBM_Plex_Mono',monospace] text-2xl font-semibold tracking-tight text-[var(--foreground)]">{title}</h1>
        {children ? <div className="mt-2 text-[12px] leading-6 text-[var(--ink-3)]">{children}</div> : null}
      </div>
      {action}
    </header>
  );
}

function ThemeToggle({ theme, setTheme }: { theme: ThemeMode; setTheme: (theme: ThemeMode) => void }) {
  const light = theme === "light";
  return (
    <button
      onClick={() => setTheme(light ? "dark" : "light")}
      aria-label={`Switch to ${light ? "dark" : "light"} theme`}
      className="group flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-[var(--ink-2)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--foreground)]"
    >
      <span className="grid size-4 place-items-center text-[var(--primary)]">
        {light ? <Moon size={12} /> : <Sun size={12} />}
      </span>
      <span className={`${dataText} hidden text-[10px] tracking-[.1em] sm:block`}>{light ? "DARK" : "LIGHT"}</span>
    </button>
  );
}

function Login() {
  const navigate = useNavigate();
  const { login, user, authChecked } = useRobofusion();
  const [role, setRole] = useState<"ADMIN" | "SECURITY_STAFF">("SECURITY_STAFF");
  const [email, setEmail] = useState("staff@scs.local");
  const [password, setPassword] = useState("scs-grid");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useThemeMode();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmail(role === "ADMIN" ? "admin@scs.local" : "staff@scs.local");
  }, [role]);

  useEffect(() => {
    if (authChecked && user) navigate("/", { replace: true });
  }, [authChecked, navigate, user]);

  const submit = async () => {
    setLoading(true);
    const success = await login(email, password);
    setLoading(false);
    if (success) navigate("/", { replace: true });
  };

  return (
    <main className="min-h-screen overflow-hidden px-5" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="absolute right-5 top-5 z-10"><ThemeToggle theme={theme} setTheme={setTheme} /></div>
      <div className="pointer-events-none fixed inset-0" style={{ backgroundImage: "radial-gradient(ellipse 55% 45% at 15% 10%, rgba(0,217,126,0.05), transparent), radial-gradient(ellipse 40% 50% at 85% 90%, rgba(0,217,126,0.03), transparent)" }} />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
        <section className="max-w-xl">
          <div className="mb-10 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg border" style={{ borderColor: "var(--primary-border)", background: "var(--primary-dim)", color: "var(--primary)" }}><ShieldCheck size={19} /></div>
            <div>
              <p className={`${dataText} font-semibold text-[13px]`} style={{ color: "var(--foreground)" }}>SCS — RG</p>
              <p className={`${dataText} text-[10px] tracking-[.18em] mt-0.5`} style={{ color: "var(--ink-3)" }}>CAMPUS SAFETY GRID</p>
            </div>
          </div>
          <p className={`${dataText} text-[10px] tracking-[.22em] uppercase`} style={{ color: "var(--primary)" }}>Secure Operations Access</p>
          <h1 className="mt-3 max-w-md font-['IBM_Plex_Mono',monospace] text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl" style={{ color: "var(--foreground)" }}>Safety is a<br />live system.</h1>
          <p className="mt-5 max-w-md text-[13px] leading-7" style={{ color: "var(--ink-3)" }}>Monitor five independent lab zones, rank simultaneous incidents and coordinate response from one source of truth.</p>
          <div className="mt-8 flex flex-wrap gap-5 text-[11px]" style={{ color: "var(--ink-4)" }}>
            <span className="flex items-center gap-1.5"><ShieldCheck size={12} />Backend-enforced RBAC</span>
            <span className="flex items-center gap-1.5"><Radio size={12} />WebSocket + polling recovery</span>
          </div>
        </section>

        <section className={`${shell} rounded-xl p-7 sm:p-8`}>
          <p className={`${dataText} text-[10px] tracking-[.18em] uppercase`} style={{ color: "var(--ink-3)" }}>Operator Identity</p>
          <h2 className="mt-2 font-['IBM_Plex_Mono',monospace] text-xl font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>Enter the grid</h2>
          <div className="mt-6 grid grid-cols-2 gap-1.5 rounded-lg p-1" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            {(["SECURITY_STAFF", "ADMIN"] as const).map(item => (
              <button
                key={item}
                onClick={() => setRole(item)}
                className="rounded-md px-3 py-2.5 text-left text-[13px] transition-all"
                style={role === item
                  ? { background: "var(--surface-1)", color: "var(--foreground)", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", border: "1px solid var(--border-strong)" }
                  : { color: "var(--ink-3)", border: "1px solid transparent" }}
              >
                <span className="block font-medium">{item === "ADMIN" ? "Admin" : "Security Staff"}</span>
                <span className="mt-0.5 block text-[11px] opacity-65">{item === "ADMIN" ? "Override + system health" : "Monitor + acknowledge"}</span>
              </button>
            ))}
          </div>
          <label className={`mt-5 block ${dataText} text-[10px] tracking-[.12em] uppercase`} style={{ color: "var(--ink-3)" }}>
            Campus Email
            <input value={email} onChange={event => setEmail(event.target.value)} className="mt-2 w-full rounded-lg px-4 py-2.5 text-[13px] outline-none transition-colors" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)" }} />
          </label>
          <label className={`mt-4 block ${dataText} text-[10px] tracking-[.12em] uppercase`} style={{ color: "var(--ink-3)" }}>
            Password
            <span className="relative mt-2 block">
              <input type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => event.key === "Enter" && void submit()} className="w-full rounded-lg px-4 py-2.5 pr-11 text-[13px] outline-none transition-colors" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)" }} />
              <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-3)" }}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button>
            </span>
          </label>
          <button
            disabled={loading || !email || password.length < 8}
            onClick={() => void submit()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[13px] font-semibold transition-all disabled:opacity-40"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {loading ? <RefreshCw className="animate-spin" size={14} /> : <ShieldCheck size={14} />}
            {loading ? "Authenticating…" : "Authenticate"}
          </button>
          <p className={`mt-4 text-center ${dataText} text-[10px] leading-5`} style={{ color: "var(--ink-4)" }}>Demo credentials seeded from <code>DEMO_PASSWORD</code>. Role selection changes the account.</p>
        </section>
      </div>
    </main>
  );
}

const navItems = [
  { to: "/", label: "Live dashboard", icon: LayoutDashboard, end: true },
  { to: "/priority", label: "Priority queue", icon: Zap },
  { to: "/incidents", label: "Incident register", icon: History },
  { to: "/reports", label: "Incident report", icon: FileText },
];

function AppShell() {
  const { user, authChecked, logout, wsStatus, lastSyncAt, activeIncidents } = useRobofusion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [theme, setTheme] = useThemeMode();

  if (!authChecked) return <main className="min-h-screen p-6" style={{ background: "var(--background)" }}><LoadingBlock label="Checking secure session…" /></main>;
  if (!user) return <Navigate to="/login" replace />;

  const openAttention = activeIncidents.filter(incident => incident.status === "OPEN").length;
  const connectionColor = wsStatus === "CONNECTED" ? "var(--risk-safe)" : wsStatus === "RECONNECTING" || wsStatus === "CONNECTING" ? "var(--risk-warning)" : "var(--risk-critical)";

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[248px] p-4 backdrop-blur-xl transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ borderRight: "1px solid var(--border)", background: "var(--sidebar)" }}
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <NavLink to="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg" style={{ border: "1px solid var(--primary-border)", background: "var(--primary-dim)", color: "var(--primary)" }}><ShieldCheck size={16} /></span>
            <span>
              <span className={`${dataText} block text-[13px] font-semibold`} style={{ color: "var(--foreground)" }}>SCS—RG</span>
              <span className={`${dataText} block text-[9px] tracking-[.2em] mt-0.5`} style={{ color: "var(--ink-4)" }}>COMMAND GRID</span>
            </span>
          </NavLink>
          <button className="lg:hidden" onClick={() => setMobileOpen(false)} style={{ color: "var(--ink-3)" }}><X size={16} /></button>
        </div>
        <nav className="mt-7 space-y-0.5">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                    isActive ? "font-medium" : ""
                  }`
                }
                style={({ isActive }) => isActive
                  ? { background: "var(--primary-dim)", color: "var(--primary)", border: "1px solid var(--primary-border)" }
                  : { color: "var(--ink-2)", border: "1px solid transparent" }
                }
              >
                <Icon size={15} /><span>{item.label}</span>
              </NavLink>
            );
          })}
          {user.role === "ADMIN" ? (
            <NavLink
              to="/system-health" onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${isActive ? "font-medium" : ""}`}
              style={({ isActive }) => isActive
                ? { background: "var(--primary-dim)", color: "var(--primary)", border: "1px solid var(--primary-border)" }
                : { color: "var(--ink-2)", border: "1px solid transparent" }
              }
            >
              <Database size={15} />System health
            </NavLink>
          ) : null}
        </nav>
        <div className="absolute bottom-4 left-4 right-4 rounded-lg p-3" style={{ border: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-full" style={{ background: "var(--surface-3)", color: "var(--ink-2)" }}><UserRound size={13} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium" style={{ color: "var(--foreground)" }}>{user.name}</p>
              <p className={`${dataText} mt-0.5 text-[10px]`} style={{ color: "var(--ink-4)" }}>{user.role.replace("_", " ")}</p>
            </div>
          </div>
          <button onClick={() => void logout()} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] transition-colors" style={{ border: "1px solid var(--border)", color: "var(--ink-3)" }}><LogOut size={12} />Logout</button>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header
          className="sticky top-0 z-40 flex h-14 items-center justify-between px-4 backdrop-blur-xl sm:px-6"
          style={{ borderBottom: "1px solid var(--border)", background: "color-mix(in srgb, var(--background) 90%, transparent)" }}
        >
          <div className="flex items-center gap-3">
            <IconButton label="Open navigation" onClick={() => setMobileOpen(true)}><Menu className="lg:hidden" size={15} /></IconButton>
            <div className="hidden sm:block">
              <p className={`${dataText} text-[10px] tracking-[.12em] font-semibold`} style={{ color: connectionColor }}>{wsStatus === "CONNECTED" ? "LIVE CHANNEL CONNECTED" : `${wsStatus} · REST FALLBACK ACTIVE`}</p>
              <p className={`${dataText} mt-0.5 text-[10px]`} style={{ color: "var(--ink-4)" }}>Last authoritative sync {lastSyncAt ? shortTime(lastSyncAt) : "pending"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <button
              onClick={() => setAlertsOpen(true)}
              className="relative grid size-8 place-items-center rounded-lg transition-colors"
              style={{ border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--ink-2)" }}
              aria-label="Open alerts"
            >
              <Bell size={14} />
              {openAttention > 0 ? <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold" style={{ background: "var(--risk-critical)", color: "#fff" }}>{openAttention}</span> : null}
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1540px] px-4 py-6 sm:px-6 lg:px-8"><Outlet /></main>
      </div>
      {alertsOpen ? <AlertCenter close={() => setAlertsOpen(false)} /> : null}
    </div>
  );
}

function MetricCard({ label, value, note, icon: Icon }: { label: string; value: string | number; note: string; icon: typeof Activity }) {
  return (
    <div className={`${shell} rounded-xl p-4`}>
      <div className="flex items-center justify-between">
        <p className={`${dataText} text-[9px] tracking-[.16em] uppercase`} style={{ color: "var(--ink-4)" }}>{label}</p>
        <span className="grid size-6 place-items-center rounded-md" style={{ background: "var(--primary-dim)", color: "var(--primary)" }}><Icon size={12} /></span>
      </div>
      <p className={`${dataText} mt-3 text-[22px] font-semibold`} style={{ color: "var(--foreground)" }}>{value}</p>
      <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>{note}</p>
    </div>
  );
}

function ZoneCard({ zone }: { zone: DashboardZone }) {
  const navigate = useNavigate();
  const status = displayStatus(zone);
  const tone = statusStyles[status];
  const predictionPercent = zone.prediction ? Math.round(zone.prediction.probability * 100) : null;
  return (
    <button
      onClick={() => navigate(`/zones/${zone.code}`)}
      className="group relative w-full overflow-hidden rounded-xl text-left transition-all hover:-translate-y-px"
      style={{ border: "1px solid var(--border)", background: "var(--surface-1)" }}
    >
      {/* Signature element: status stripe */}
      <span className={`absolute inset-y-0 left-0 w-[3px] ${tone.stripe} rounded-l-xl`} />
      <div className="pl-4 pr-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--ink-2)" }}>{zoneIconEl(zone.code, 16)}</span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold" style={{ color: "var(--foreground)" }}>{zone.name}</p>
              <p className={`${dataText} mt-0.5 text-[10px]`} style={{ color: "var(--ink-4)" }}>{zone.code}</p>
            </div>
          </div>
          <RiskRing value={zone.riskScore} status={status} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={status} compact />
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10px]" style={{ border: "1px solid var(--border)", color: "var(--ink-3)" }}>
            {hazardIconEl(zone.primaryHazard, 10)}{hazardLabels[zone.primaryHazard ?? "NONE"]}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
            <p style={{ color: "var(--ink-4)" }}>Occupancy</p>
            <p className="mt-0.5 font-medium" style={{ color: "var(--ink-2)" }}>{zone.occupancy ? "Occupied" : "No presence"}</p>
          </div>
          <div className="rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
            <p style={{ color: "var(--ink-4)" }}>Predicted Risk</p>
            <p className="mt-0.5 font-medium" style={{ color: "var(--ink-2)" }}>{predictionPercent === null ? "No model sample" : `${predictionPercent}% advisory`}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t pt-3 pb-3 text-[10px]" style={{ borderColor: "var(--border)", color: "var(--ink-4)" }}>
          <span>{zone.isTrendingCritical ? "↗ Trending critical" : "Trend monitored"}</span>
          <span className="flex items-center gap-1">Updated {shortTime(zone.lastReceivedAt ?? zone.lastReadingAt)} <ChevronRight className="transition group-hover:translate-x-0.5" size={11} /></span>
        </div>
      </div>
    </button>
  );
}

function PriorityCard({ item, compact = false }: { item: PriorityItem; compact?: boolean }) {
  const navigate = useNavigate();
  const { acknowledgeIncident } = useRobofusion();
  const isTop = item.rank === 1;
  return (
    <article
      className={`relative overflow-hidden rounded-xl ${compact ? "p-3" : "p-4"}`}
      style={isTop
        ? { border: "1px solid var(--critical-border)", background: "var(--critical-surface)" }
        : { border: "1px solid var(--border)", background: "var(--surface-1)" }
      }
    >
      {isTop && <span className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl" style={{ background: "var(--risk-critical)" }} />}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span
            className={`${dataText} grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold`}
            style={isTop
              ? { background: "var(--critical-surface)", border: "1px solid var(--critical-border)", color: "var(--critical-ink)" }
              : { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-2)" }
            }
          >#{item.rank}</span>
          <div>
            <p className="text-[14px] font-semibold" style={{ color: "var(--foreground)" }}>{item.zone_name}</p>
            <p className={`${dataText} mt-0.5 text-[10px]`} style={{ color: "var(--ink-4)" }}>{item.primary_hazard} · {item.occupancy ? "OCCUPIED" : "EMPTY"}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`${dataText} text-[17px] font-semibold`} style={{ color: "var(--warning-ink)" }}>{item.priority_score.toFixed(1)}</p>
          <p className={`${dataText} text-[9px]`} style={{ color: "var(--ink-4)" }}>PRIORITY SCORE</p>
        </div>
      </div>
      <p className={`${compact ? "mt-2 line-clamp-2" : "mt-3"} text-[12px] leading-5`} style={{ color: "var(--ink-2)" }}>{item.ranking_reason}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-2.5" style={{ borderColor: "var(--border)" }}>
        <div className={`${dataText} flex gap-4 text-[10px]`} style={{ color: "var(--ink-4)" }}>
          <span>Risk {item.risk_score}</span>
          <span>Critical {secondsLabel(item.critical_duration_seconds)}</span>
          {item.nlp_advisory_bonus > 0 ? <span>NLP +{item.nlp_advisory_bonus}</span> : null}
        </div>
        <div className="flex gap-2">
          {item.status === "OPEN"
            ? <button onClick={() => void acknowledgeIncident(item.incident_id)} className="rounded-md px-2 py-1 text-[11px] transition-colors" style={{ border: "1px solid var(--warning-border)", color: "var(--warning-ink)" }}>Acknowledge</button>
            : <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--safe-ink)" }}><Check size={11} />Acknowledged</span>
          }
          <button onClick={() => navigate(`/incidents/${item.incident_id}`)} className="text-[11px] transition-colors" style={{ color: "var(--ink-2)" }}>Timeline →</button>
        </div>
      </div>
    </article>
  );
}

function Dashboard() {
  const { zones, priorityQueue, systemHealth, dataLoading, refreshSnapshot, activeIncidents } = useRobofusion();
  const navigate = useNavigate();
  const orderedZones = useMemo(() => [...zones].sort((a, b) => {
    const priority: Record<DisplayStatus, number> = { CRITICAL: 6, OFFLINE: 5, DEGRADED: 4, WARNING: 3, ONLINE: 2, SAFE: 1, NOT_CONFIGURED: 0 };
    return priority[displayStatus(b)] - priority[displayStatus(a)] || b.riskScore - a.riskScore;
  }), [zones]);
  const avgRisk = zones.length ? Math.round(zones.reduce((sum, zone) => sum + zone.riskScore, 0) / zones.length) : 0;

  return (
    <div>
      <PageIntro eyebrow="LIVE MULTI-ZONE COMMAND VIEW" title="Campus safety posture" action={<button onClick={() => void refreshSnapshot()} className="flex items-center gap-2 rounded-xl border border-white/[.09] px-3 py-2 text-[12px] text-[#c9cdc8] hover:bg-white/[.05]"><RefreshCw className={dataLoading ? "animate-spin" : ""} size={14} />Refresh source of truth</button>}>
        Five lab zones share one backend risk engine, incident lifecycle and deterministic response order.
      </PageIntro>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="SAFE" value={systemHealth?.safe_zones ?? zones.filter(zone => zone.state === "SAFE").length} note="Last known safety state" icon={ShieldCheck} />
        <MetricCard label="WARNING" value={systemHealth?.warning_zones ?? zones.filter(zone => zone.state === "WARNING").length} note="Visual attention only" icon={AlertTriangle} />
        <MetricCard label="CRITICAL" value={systemHealth?.critical_zones ?? zones.filter(zone => zone.state === "CRITICAL").length} note="Actuation + queue" icon={ShieldAlert} />
        <MetricCard label="OFFLINE" value={systemHealth?.offline_zones ?? zones.filter(zone => zone.connectivityState === "OFFLINE").length} note="Never treated as empty" icon={WifiOff} />
        <MetricCard label="AVG RISK" value={avgRisk} note="Server-computed 0–100" icon={Gauge} />
        <MetricCard label="ACTIVE INCIDENTS" value={activeIncidents.length} note="Open + acknowledged" icon={ClipboardList} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_.75fr]">
        <section>
          <div className="mb-3 flex items-center justify-between"><div><p className={`${dataText} text-[11px] tracking-[.14em] text-[#8a9291]`}>LIVE ZONE MAP</p><p className="mt-1 text-[12px] text-[#757e80]">Status uses icon + label as well as colour.</p></div><span className={`${dataText} text-[10px] text-[#7d8587]`}>{zones.length} CONFIGURED</span></div>
          {orderedZones.length ? <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{orderedZones.map(zone => <ZoneCard key={zone.id} zone={zone} />)}</div> : <EmptyState title="No configured zones returned" body="Run the idempotent migration and seed command, then confirm the deployment is using the intended MongoDB database." />}
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between"><div><p className={`${dataText} text-[11px] tracking-[.14em] text-[#8a9291]`}>PRIORITY QUEUE</p><p className="mt-1 text-[12px] text-[#757e80]">Risk + occupancy + critical duration.</p></div><button onClick={() => navigate("/priority")} className="text-[11px] text-[#dfba7c]">Open full queue →</button></div>
          <div className="space-y-3">{priorityQueue.length ? priorityQueue.slice(0, 4).map(item => <PriorityCard key={item.incident_id} item={item} compact />) : <EmptyState title="No Critical zones" body="The response queue is intentionally empty unless a zone is currently Critical. Active Warning incidents remain in the incident register." />}</div>
        </section>
      </div>
    </div>
  );
}

function PriorityQueuePage() {
  const { priorityQueue, refreshSnapshot } = useRobofusion();
  return (
    <div>
      <PageIntro eyebrow="DETERMINISTIC RESPONSE ORDER" title="Priority queue" action={<button onClick={() => void refreshSnapshot()} className="flex items-center gap-2 rounded-xl border border-white/[.09] px-3 py-2 text-[12px]"><RefreshCw size={14} />Recalculate</button>}>
        Only currently Critical zones appear here. Tie-breaks use risk, occupancy, earlier Critical time and zone code.
      </PageIntro>
      {priorityQueue.length ? <div className="space-y-4">{priorityQueue.map(item => <PriorityCard key={item.incident_id} item={item} />)}</div> : <EmptyState title="No response queue" body="No zone is currently Critical. Warning states remain visible on the live map without triggering relay or buzzer actuation." />}
    </div>
  );
}

function RiskComponent({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]"><span className="text-[#838b8d]">{label}</span><span className={`${dataText} text-[#d2d4cf]`}>{value.toFixed(1)}</span></div>
      <div className="mt-2 h-1.5 rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-[#c8954f]" style={{ width: `${width}%` }} /></div>
    </div>
  );
}

function ZoneDetails() {
  const { zoneCode } = useParams();
  const { fetchZoneDetails, user, applyOverride, clearOverride } = useRobofusion();
  const [payload, setPayload] = useState<ZoneDetailsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!zoneCode) return;
    let cancelled = false;
    const load = async () => {
      const result = await fetchZoneDetails(zoneCode);
      if (!cancelled) { setPayload(result); setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [fetchZoneDetails, zoneCode]);

  if (loading) return <LoadingBlock label="Loading live zone state…" />;
  if (!payload) return <EmptyState title="Zone unavailable" body="The zone was not found or the authenticated API could not be reached." />;

  const { zone, sensors, events, trend, prediction, readings, raw_readings_visible } = payload;
  const status = displayStatus(zone);
  const components = zone.riskComponents ?? { fire: 0, gas: 0, water: 0, occupancy: 0 };

  return (
    <div>
      <button onClick={() => navigate("/")} className="mb-5 text-[12px] text-[#929a9a] hover:text-white">‹ Back to live dashboard</button>
      <PageIntro eyebrow={`${zone.code} · LIVE ZONE`} title={zone.name} action={<div className="flex flex-wrap gap-2"><StatusBadge status={status} /><ConnectivityBadge state={zone.connectivityState} /></div>}>
        Last observed {dateLabel(zone.lastObservedAt)} · Last received by backend {dateLabel(zone.lastReceivedAt ?? zone.lastReadingAt)}
      </PageIntro>

      {zone.connectivityState === "OFFLINE" ? (
        <div className="mb-5 rounded-2xl border border-[#69727c]/30 bg-[#69727c]/[.09] p-4 text-[12px] leading-5 text-[#b8c0c5]"><WifiOff className="mr-2 inline" size={14} />Sensor transport is OFFLINE. The displayed safety state, risk and occupancy are explicitly labelled as last known values; the backend does not convert a disconnected zone to Safe or empty.</div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
        <section className="space-y-5">
          <div className={`${shell} rounded-2xl p-5`}>
            <div className="flex items-center justify-between"><div><p className={`${dataText} text-[11px] tracking-[.14em] text-[#848d8d]`}>LIVE RISK FUSION</p><p className="mt-2 text-[13px] text-[#aeb3b0]">{hazardLabels[zone.primaryHazard ?? "NONE"]}</p></div><RiskRing value={zone.riskScore} status={status} /></div>
            <div className="mt-6 space-y-4"><RiskComponent label="Fire contribution" value={components.fire} /><RiskComponent label="Gas contribution" value={components.gas} /><RiskComponent label="Water contribution" value={components.water} /><RiskComponent label="Occupancy contribution" value={components.occupancy} /></div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-[11px]"><div className="rounded-xl bg-white/[.025] p-3"><p className="text-[#757e80]">Occupancy</p><p className="mt-1 text-[#d2d4cf]">{zone.occupancy ? "Present" : "Not detected"}</p></div><div className="rounded-xl bg-white/[.025] p-3"><p className="text-[#757e80]">Trend</p><p className="mt-1 text-[#d2d4cf]">{trend.status.replaceAll("_", " ")} · slope {trend.slope}</p></div></div>
          </div>

          <div className={`${shell} rounded-2xl p-5`}>
            <p className={`${dataText} text-[11px] tracking-[.14em] text-[#848d8d]`}>PREDICTED RISK · BONUS 3</p>
            {prediction ? <><div className="mt-4 flex items-end justify-between"><p className={`${dataText} text-3xl text-[#efc987]`}>{Math.round(prediction.probability * 100)}%</p><p className="text-[11px] text-[#7e8789]">within {prediction.horizonMinutes} min</p></div><p className="mt-3 text-[12px] leading-5 text-[#a8aeab]">Model {prediction.modelVersion}. This indicator is separate from live risk and advisory only.</p></> : <p className="mt-4 text-[12px] text-[#828a8c]">Prediction requires recent sensor history.</p>}
            <div className="mt-4 rounded-xl border border-[#88a879]/20 bg-[#88a879]/[.06] p-3 text-[11px] leading-5 text-[#b5c7ae]"><ShieldCheck className="mr-1 inline" size={12} />Predicted Risk can never trigger the relay, buzzer or LEDs.</div>
          </div>

          {user?.role === "ADMIN" ? (
            <div className={`${shell} rounded-2xl p-5`}>
              <p className={`${dataText} text-[11px] tracking-[.14em] text-[#848d8d]`}>ADMIN MANUAL OVERRIDE</p>
              <p className="mt-2 text-[12px] leading-5 text-[#858e8f]">Backend RBAC and command-version checks apply. RESET cannot force a Critical sensor state to Safe.</p>
              <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => void applyOverride(zone.code, "SILENCE")} className="rounded-xl border border-white/[.09] py-2.5 text-[12px] hover:bg-white/[.05]">Silence buzzer</button><button onClick={() => void applyOverride(zone.code, "TEST_ACTUATOR")} className="rounded-xl border border-[#c8954f]/25 py-2.5 text-[12px] text-[#dfba7c] hover:bg-[#c8954f]/10">Test actuators</button><button onClick={() => void applyOverride(zone.code, "RESET")} className="rounded-xl border border-white/[.09] py-2.5 text-[12px] hover:bg-white/[.05]">Safe reset request</button><button onClick={() => void clearOverride(zone.code)} className="rounded-xl border border-[#b95045]/25 py-2.5 text-[12px] text-[#e09a8e] hover:bg-[#b95045]/10">Clear override</button></div>
            </div>
          ) : null}
        </section>

        <section className="space-y-5">
          <div className={`${shell} rounded-2xl p-5`}>
            <p className={`${dataText} text-[11px] tracking-[.14em] text-[#848d8d]`}>SENSOR HEALTH</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">{sensors.map(sensor => <div key={sensor.id} className="flex items-center justify-between rounded-xl border border-white/[.065] bg-white/[.02] p-3"><div><p className="text-[12px] font-medium">{sensor.sensorType}</p><p className="mt-1 text-[10px] text-[#757e80]">Last seen {shortTime(sensor.lastSeenAt)}</p></div><StatusBadge status={sensor.status === "WARMING_UP" ? "DEGRADED" : sensor.status as DisplayStatus} compact /></div>)}</div>
          </div>

          <div className={`${shell} rounded-xl p-5`}>
            <p className={`${dataText} text-[11px] tracking-[.14em] uppercase`} style={{ color: "var(--ink-3)" }}>RECENT STATE / INCIDENT EVENTS</p>
            <div className="mt-5 space-y-4">{events.length ? events.map(event => <div key={event.id} className="flex gap-3 pb-4 last:pb-0" style={{ borderBottom: "1px solid var(--border)" }}><span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: "var(--primary)" }} /><div><p className={`${dataText} text-[10px]`} style={{ color: "var(--ink-4)" }}>{event.eventType} · {dateLabel(event.occurredAt)}</p><p className="mt-1 text-[12px] leading-5" style={{ color: "var(--foreground)" }}>{event.description}</p></div></div>) : <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>No event trail recorded yet.</p>}</div>
          </div>

          <div className={`${shell} rounded-xl p-5`}>
            <div className="flex items-center justify-between"><p className={`${dataText} text-[11px] tracking-[.14em] uppercase`} style={{ color: "var(--ink-3)" }}>RAW READING HISTORY</p><span className="text-[10px]" style={{ color: "var(--ink-4)" }}>{raw_readings_visible ? "ADMIN ACCESS" : "RESTRICTED BY ROLE"}</span></div>
            {raw_readings_visible ? <div className="mt-4 overflow-x-auto"><table className="min-w-[680px] w-full text-left"><thead><tr style={{ borderBottom: "1px solid var(--border)" }}>{["Observed", "Fire", "Gas", "Water", "PIR", "Risk", "State"].map(label => <th key={label} className={`${dataText} px-2 py-2 text-[10px] font-medium`} style={{ color: "var(--ink-4)" }}>{label}</th>)}</tr></thead><tbody>{readings.slice(0, 15).map(reading => <tr key={reading.id} style={{ borderBottom: "1px solid var(--border)" }}><td className={`${dataText} px-2 py-2 text-[10px]`}>{shortTime(reading.observedAt)}</td><td className="px-2 py-2 text-[11px]">{reading.fire ? "YES" : "NO"}</td><td className={`${dataText} px-2 py-2 text-[10px]`}>{reading.gas}</td><td className={`${dataText} px-2 py-2 text-[10px]`}>{reading.water}</td><td className="px-2 py-2 text-[11px]">{reading.pir ? "YES" : "NO"}</td><td className={`${dataText} px-2 py-2 text-[10px]`}>{reading.riskScore}</td><td className="px-2 py-2"><StatusBadge status={reading.calculatedState} compact /></td></tr>)}</tbody></table></div> : <p className="mt-4 text-[12px] leading-5" style={{ color: "var(--ink-3)" }}>Security Staff can see operational summaries and incident timelines. Raw historical sensor values are restricted to Admin, matching the data-retention/access policy.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function incidentStatusLabel(incident: IncidentRecord): DisplayStatus | "RESOLVED" {
  if (incident.status === "RESOLVED") return "RESOLVED";
  return "CRITICAL";
}

function Incidents() {
  const { zones, incidents, queryIncidents } = useRobofusion();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [range, setRange] = useState("7d");
  const [status, setStatus] = useState("all");
  const [zoneId, setZoneId] = useState("");
  const [hazard, setHazard] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const from = range === "24h" ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
      : range === "7d" ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        : range === "30d" ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void queryIncidents({
      status: status as "all" | "active" | "resolved" | "OPEN" | "ACKNOWLEDGED" | "RESOLVED",
      zoneId: zoneId || undefined,
      hazard: hazard ? hazard as HazardType : undefined,
      from: from?.toISOString(),
      to: now.toISOString(),
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hazard, queryIncidents, range, status, zoneId]);

  const visible = incidents.filter(incident => {
    const zone = zones.find(item => item.id === incident.zoneId);
    const needle = search.trim().toLowerCase();
    return !needle || [incident.id, zone?.name, incident.primaryHazard, incident.status].some(value => String(value ?? "").toLowerCase().includes(needle));
  });

  return (
    <div>
      <PageIntro eyebrow="SEARCHABLE HISTORICAL LOG" title="Incident register" action={loading ? <RefreshCw className="animate-spin text-[#c8954f]" size={17} /> : <span className={`${dataText} text-[11px] text-[#7e8789]`}>{visible.length} RESULTS</span>}>
        Date-range, zone, hazard and lifecycle filters are executed against the backend incident API.
      </PageIntro>
      <div className={`${shell} rounded-xl`}>
        <div className="flex flex-wrap gap-2 p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-4)" }} size={14} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search ID, zone, hazard…" className="w-full rounded-lg py-2.5 pl-9 pr-3 text-[12px] outline-none transition-colors" style={{ background: "var(--input)", border: "1px solid var(--border)", color: "var(--foreground)" }} /></label>
          <select value={range} onChange={event => setRange(event.target.value)} className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--input)", border: "1px solid var(--border)", color: "var(--foreground)" }}><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All retained</option></select>
          <select value={zoneId} onChange={event => setZoneId(event.target.value)} className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--input)", border: "1px solid var(--border)", color: "var(--foreground)" }}><option value="">All zones</option>{zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select>
          <select value={hazard} onChange={event => setHazard(event.target.value)} className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--input)", border: "1px solid var(--border)", color: "var(--foreground)" }}><option value="">All hazards</option>{(["FIRE", "GAS", "FLOOD", "OCCUPANCY"] as const).map(item => <option key={item}>{item}</option>)}</select>
          <select value={status} onChange={event => setStatus(event.target.value)} className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--input)", border: "1px solid var(--border)", color: "var(--foreground)" }}><option value="all">All statuses</option><option value="active">Active</option><option value="OPEN">Open</option><option value="ACKNOWLEDGED">Acknowledged</option><option value="RESOLVED">Resolved</option></select>
        </div>
        <div className="overflow-x-auto"><table className="min-w-[1040px] w-full text-left"><thead style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}><tr>{["INCIDENT", "ZONE", "HAZARD", "TRIGGER", "PEAK RISK", "ACKNOWLEDGED", "RESOLVED", "DURATION", "STATUS"].map(label => <th key={label} className={`${dataText} px-4 py-3 text-[10px] font-medium`} style={{ color: "var(--ink-3)" }}>{label}</th>)}</tr></thead><tbody>{visible.length ? visible.map(incident => { const zone = zones.find(item => item.id === incident.zoneId); const display = incidentStatusLabel(incident); return <tr key={incident.id} onClick={() => navigate(`/incidents/${incident.id}`)} className="cursor-pointer transition-colors" style={{ borderBottom: "1px solid var(--border)" }} onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><td className={`${dataText} px-4 py-4 text-[11px]`} style={{ color: "var(--warning-ink)" }}>{incident.id}</td><td className="px-4 py-4 text-[12px] font-medium" style={{ color: "var(--foreground)" }}>{zone?.name ?? incident.zoneId}</td><td className="px-4 py-4 text-[12px]" style={{ color: "var(--ink-2)" }}>{hazardLabels[incident.primaryHazard]}</td><td className={`${dataText} px-4 py-4 text-[10px]`}>{dateLabel(incident.startedAt)}</td><td className={`${dataText} px-4 py-4 text-[11px]`}>{incident.peakRiskScore}</td><td className="px-4 py-4 text-[11px]">{incident.acknowledgedAt ? `${incident.acknowledgedBy ?? "User"} · ${dateLabel(incident.acknowledgedAt)}` : "Unassigned"}</td><td className={`${dataText} px-4 py-4 text-[10px]`}>{dateLabel(incident.resolvedAt)}</td><td className={`${dataText} px-4 py-4 text-[10px]`}>{durationLabel(incident.startedAt, incident.resolvedAt ?? null)}</td><td className="px-4 py-4">{display === "RESOLVED" ? <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--safe-ink)" }}><Check size={12} />RESOLVED</span> : <StatusBadge status={display} compact />}</td></tr>; }) : <tr><td colSpan={9} className="px-5 py-16 text-center text-[13px]" style={{ color: "var(--ink-3)" }}>No incidents match the selected backend filters.</td></tr>}</tbody></table></div>
      </div>
    </div>
  );
}

function eventIcon(event: IncidentTimelineEvent) {
  if (event.eventType.includes("ACKNOWLEDGED")) return UserRound;
  if (event.eventType.includes("RESOLVED") || event.eventType === "ZONE_SAFE") return Check;
  if (event.eventType.includes("OFFLINE")) return WifiOff;
  if (event.eventType.includes("CRITICAL") || event.eventType.includes("OPENED")) return ShieldAlert;
  if (event.eventType.includes("WARNING")) return AlertTriangle;
  return CircleAlert;
}

function IncidentDetails() {
  const { incidentId } = useParams();
  const { fetchIncidentTimeline, zones, acknowledgeIncident } = useRobofusion();
  const [timeline, setTimeline] = useState<{ incident: IncidentRecord; events: IncidentTimelineEvent[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!incidentId) return;
    let cancelled = false;
    void fetchIncidentTimeline(incidentId).then(result => { if (!cancelled) { setTimeline(result); setLoading(false); } });
    return () => { cancelled = true; };
  }, [fetchIncidentTimeline, incidentId]);

  if (loading) return <LoadingBlock label="Loading durable incident timeline…" />;
  if (!timeline) return <EmptyState title="Incident not found" body="No incident with this identifier exists in the durable incident store." />;

  const { incident, events } = timeline;
  const zone = zones.find(item => item.id === incident.zoneId);
  return (
    <div>
      <button onClick={() => navigate("/incidents")} className="mb-5 text-[12px] text-[#929a9a] hover:text-white">‹ Back to incident register</button>
      <PageIntro eyebrow={`${incident.id} · DURABLE TIMELINE`} title={hazardLabels[incident.primaryHazard]} action={incident.status === "RESOLVED" ? <span className="flex items-center gap-1 text-[12px] text-[#b4cdaa]"><Check size={13} />RESOLVED</span> : <StatusBadge status="CRITICAL" />}>
        {zone?.name ?? incident.zoneId} · Triggered {dateLabel(incident.startedAt)}
      </PageIntro>
      <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <section className={`${shell} rounded-xl p-5`}>
          <p className={`${dataText} text-[11px] tracking-[.14em] uppercase`} style={{ color: "var(--ink-3)" }}>INCIDENT SUMMARY</p>
          <div className="mt-5 space-y-4">{[["Zone", zone?.name ?? incident.zoneId], ["Initial risk", String(incident.initialRiskScore)], ["Peak risk", String(incident.peakRiskScore)], ["Status", incident.status], ["Triggered", dateLabel(incident.startedAt)], ["Acknowledged", incident.acknowledgedAt ? `${incident.acknowledgedBy ?? "User"} · ${dateLabel(incident.acknowledgedAt)}` : "Pending"], ["Resolved", dateLabel(incident.resolvedAt)], ["Duration", durationLabel(incident.startedAt, incident.resolvedAt ?? null)]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}><span className="text-[11px]" style={{ color: "var(--ink-3)" }}>{label}</span><span className="text-right text-[12px]" style={{ color: "var(--foreground)" }}>{value}</span></div>)}</div>
          {incident.status === "OPEN" ? <button onClick={() => void acknowledgeIncident(incident.id).then(async success => { if (success) setTimeline(await fetchIncidentTimeline(incident.id)); })} className="mt-5 w-full rounded-lg py-3 text-[12px] font-medium transition-colors" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Acknowledge incident</button> : null}
          <button onClick={() => navigate(`/zones/${zone?.code ?? ""}`)} disabled={!zone} className="mt-2 w-full rounded-lg py-3 text-[12px] disabled:opacity-40 transition-colors" style={{ border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)" }}>Open live zone</button>
        </section>
        <section className={`${shell} rounded-xl p-5`}>
          <p className={`${dataText} text-[11px] tracking-[.14em] uppercase`} style={{ color: "var(--ink-3)" }}>EVENT TRAIL</p>
          <div className="mt-6 space-y-0">{events.length ? events.map((event, index) => { const Icon = eventIcon(event); return <div key={event.id} className="relative flex gap-4 pb-7 last:pb-0"><span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full" style={{ background: "var(--primary-dim)", border: "1px solid var(--primary-border)", color: "var(--primary)" }}><Icon size={13} /></span>{index < events.length - 1 ? <span className="absolute left-[13px] top-9 h-[calc(100%-17px)] w-px" style={{ background: "var(--border)" }} /> : null}<div><p className={`${dataText} text-[10px]`} style={{ color: "var(--primary)" }}>{event.eventType} <span className="ml-2" style={{ color: "var(--ink-4)" }}>{dateLabel(event.occurredAt)}</span></p><p className="mt-1 text-[12px] leading-5" style={{ color: "var(--ink-2)" }}>{event.description}</p><p className="mt-1 text-[10px]" style={{ color: "var(--ink-4)" }}>Source: {event.eventSource}</p></div></div>; }) : <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>No timeline events recorded.</p>}</div>
        </section>
      </div>
    </div>
  );
}

function ReportsPage() {
  const { reportNote } = useRobofusion();
  const [text, setText] = useState("Smell of gas near the IoT Lab bench, seems strong and urgent.");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const submit = async () => {
    setLoading(true);
    const response = await reportNote(text);
    setLoading(false);
    setResult(response.data ?? { validated: response.validated, message: response.message });
  };
  return (
    <div>
      <PageIntro eyebrow="NATURAL-LANGUAGE INCIDENT REPORTING · BONUS 4" title="Validated staff report">
        The language layer converts free text to zone, hazard and severity, then a deterministic gate verifies the structured signal before any bounded ranking bonus is allowed.
      </PageIntro>
      <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]">
        <section className={`${shell} rounded-xl p-5`}>
          <label className={`${dataText} text-[11px] tracking-[.12em] uppercase`} style={{ color: "var(--ink-3)" }}>FREE-TEXT OBSERVATION<textarea value={text} onChange={event => setText(event.target.value)} className="mt-3 min-h-[190px] w-full rounded-lg px-4 py-3 text-[13px] leading-6 outline-none transition-colors" style={{ background: "var(--input)", border: "1px solid var(--border)", color: "var(--foreground)" }} /></label>
          <button onClick={() => void submit()} disabled={loading || text.trim().length < 5} className="mt-4 flex items-center gap-2 rounded-lg px-4 py-3 text-[12px] font-medium transition-all disabled:opacity-40" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{loading ? <RefreshCw className="animate-spin" size={14} /> : <Send size={14} />}Parse, validate and store</button>
          <p className="mt-4 text-[11px] leading-5" style={{ color: "var(--ink-3)" }}>An accepted report can only add a small priority bonus when it matches an already-active Critical incident in the same zone and hazard. It never changes the live risk score or actuates hardware.</p>
        </section>
        <section className={`${shell} rounded-xl p-5`}>
          <p className={`${dataText} text-[11px] tracking-[.14em] uppercase`} style={{ color: "var(--ink-3)" }}>STRUCTURED RESULT</p>
          {result ? <pre className="mt-4 max-h-[420px] overflow-auto rounded-lg p-4 text-[11px] leading-5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-2)" }}>{JSON.stringify(result, null, 2)}</pre> : <div className="mt-12 text-center" style={{ color: "var(--ink-3)" }}><Sparkles className="mx-auto" size={21} /><p className="mt-3 text-[12px]">Submit a note to inspect the validated structured signal.</p></div>}
        </section>
      </div>
    </div>
  );
}

function SystemHealthPage() {
  const { user, fetchAdminHealth } = useRobofusion();
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    let cancelled = false;
    const load = async () => {
      const result = await fetchAdminHealth();
      if (!cancelled) { setHealth(result); setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [fetchAdminHealth, user?.role]);

  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;
  if (loading) return <LoadingBlock label="Loading admin-only system health…" />;
  const zones = (health?.zones ?? {}) as Record<string, unknown>;
  const incidents = (health?.incidents ?? {}) as Record<string, unknown>;
  return (
    <div>
      <PageIntro eyebrow="ADMIN-ONLY BACKEND VIEW" title="System health">
        This route is protected by backend RBAC; changing the browser route does not grant access to Security Staff.
      </PageIntro>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="CONFIGURED ZONES" value={String(zones.total ?? 0)} note="Official monitoring scope" icon={Network} /><MetricCard label="OFFLINE ZONES" value={String(zones.offline ?? 0)} note="Transport/sensor faults" icon={WifiOff} /><MetricCard label="OPEN INCIDENTS" value={String(incidents.open ?? 0)} note="Awaiting acknowledgement" icon={ShieldAlert} /><MetricCard label="READINGS / MIN" value={String(health?.readings_last_minute ?? 0)} note="Recent ingestion throughput" icon={Activity} /></div>
      <div className={`${shell} mt-5 rounded-xl p-5`}><div className="flex items-center justify-between"><p className={`${dataText} text-[11px] tracking-[.14em] uppercase`} style={{ color: "var(--ink-3)" }}>COMPLETE HEALTH PAYLOAD</p><span className="text-[10px]" style={{ color: "var(--ink-4)" }}>Checked {dateLabel(health?.checked_at as string | undefined)}</span></div><pre className="mt-4 max-h-[560px] overflow-auto rounded-lg p-4 text-[11px] leading-5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-2)" }}>{JSON.stringify(health, null, 2)}</pre></div>
    </div>
  );
}

function AlertCenter({ close }: { close: () => void }) {
  const { activeIncidents, zones, acknowledgeIncident } = useRobofusion();
  const navigate = useNavigate();
  const ordered = [...activeIncidents].sort((a, b) => Number(a.status === "ACKNOWLEDGED") - Number(b.status === "ACKNOWLEDGED") || new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return (
    <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-[430px] border-l border-white/[.08] bg-[#121713]/98 p-5 shadow-2xl backdrop-blur-2xl">
      <div className="flex items-center justify-between"><div><p className={`${dataText} text-[11px] tracking-[.15em] text-[#c8954f]`}>ACTIVE ALERTS</p><h2 className="mt-1 text-[22px] font-medium">Notification center</h2></div><IconButton label="Close notifications" onClick={close}><X size={17} /></IconButton></div>
      <div className="mt-5 space-y-3">{ordered.length ? ordered.map(incident => { const zone = zones.find(item => item.id === incident.zoneId); const acknowledged = incident.status === "ACKNOWLEDGED"; return <article key={incident.id} className={`rounded-2xl border p-4 ${acknowledged ? "border-white/[.07] bg-white/[.025] opacity-70" : "border-[#b95045]/30 bg-[#b95045]/[.09]"}`}><div className="flex items-start gap-3"><span className={acknowledged ? "text-[#b4cdaa]" : "text-[#dc8a7d]"}>{acknowledged ? <Check size={17} /> : <ShieldAlert size={17} />}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-[13px] font-medium">{zone?.name ?? incident.zoneId}</p><span className={`${dataText} text-[10px] text-[#7e8789]`}>{incident.status}</span></div><p className="mt-1 text-[11px] text-[#b1b4ad]">{hazardLabels[incident.primaryHazard]} · risk peak {incident.peakRiskScore}</p><p className={`${dataText} mt-2 text-[10px] text-[#7f8789]`}>TRIGGERED {dateLabel(incident.startedAt)}</p></div></div><div className="mt-3 flex gap-3">{!acknowledged ? <button onClick={() => void acknowledgeIncident(incident.id)} className="rounded-lg border border-[#c8954f]/25 px-2.5 py-1.5 text-[11px] text-[#dfba7c]">Acknowledge</button> : <span className="text-[11px] text-[#b4cdaa]">Attention cue cleared</span>}<button onClick={() => { close(); navigate(`/incidents/${incident.id}`); }} className="text-[11px] text-[#d0d2ce]">View timeline →</button></div></article>; }) : <p className="py-12 text-center text-[12px] text-[#7e8789]">No active incidents.</p>}</div>
      <div className="mt-5 rounded-xl border border-[#88a879]/20 bg-[#88a879]/[.07] p-3 text-[11px] leading-5 text-[#b4c7ac]"><Wifi className="mr-1 inline" size={12} />WebSocket reconnect and two-second REST fallback prevent a disconnected browser from remaining stale.</div>
    </div>
  );
}

function ToastContainer() {
  const { notifications, removeNotification } = useRobofusion();
  if (!notifications.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex max-w-[calc(100vw-2rem)] flex-col gap-2">
      {notifications.map(notification => {
        const classes = notification.type === "critical"
          ? "border-[#b95045]/45 bg-[#2b1e1e]/98 text-[#f0a79b]"
          : notification.type === "error"
            ? "border-[#b95045]/30 bg-[#2b1e1e]/95 text-[#f0a79b]"
            : notification.type === "success"
              ? "border-[#88a879]/30 bg-[#1e2b20]/95 text-[#b7cfaf]"
              : "border-[#c8954f]/30 bg-[#282116]/95 text-[#e0c79f]";
        const Icon = notification.type === "critical" ? ShieldAlert : notification.type === "error" ? CircleX : notification.type === "success" ? Check : CircleAlert;
        return <div key={notification.id} className={`flex w-[360px] max-w-full items-start gap-3 rounded-xl border p-4 shadow-2xl backdrop-blur-xl ${classes}`}><Icon className="mt-0.5 shrink-0" size={16} /><p className="flex-1 text-[12px] leading-5">{notification.message}</p><button onClick={() => removeNotification(notification.id)} className="opacity-55 hover:opacity-100"><X size={14} /></button></div>;
      })}
    </div>
  );
}

function NotFound() {
  return <EmptyState title="Command view not found" body="The requested route is not part of the deployed SCS-RG dashboard." />;
}

function Root() {
  return <RobofusionProvider><Outlet /><ToastContainer /></RobofusionProvider>;
}

export const router = typeof window === "undefined" ? undefined : createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/login", Component: Login },
      {
        path: "/",
        Component: AppShell,
        children: [
          { index: true, Component: Dashboard },
          { path: "priority", Component: PriorityQueuePage },
          { path: "zones/:zoneCode", Component: ZoneDetails },
          { path: "incidents", Component: Incidents },
          { path: "incidents/:incidentId", Component: IncidentDetails },
          { path: "reports", Component: ReportsPage },
          { path: "system-health", Component: SystemHealthPage },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
]);
