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

const shell = "border border-white/[.09] bg-[#151917]/82 shadow-[0_24px_64px_rgba(0,0,0,.30)] backdrop-blur-2xl";
const dataText = "font-['Inter'] tabular-nums text-[13px] tracking-[.02em]";

const hazardLabels: Record<HazardType, string> = {
  FIRE: "Fire / flame",
  GAS: "Gas concentration",
  FLOOD: "Water / flood",
  OCCUPANCY: "Occupancy",
  NONE: "No active hazard",
};

const statusStyles: Record<DisplayStatus, { text: string; surface: string; icon: typeof CircleCheck }> = {
  ONLINE: { text: "text-emerald-700 dark:text-emerald-300", surface: "bg-emerald-500/10 border-emerald-500/30", icon: Wifi },
  SAFE: { text: "text-[#b1c9a8]", surface: "border-[#88a879]/25 bg-[#88a879]/[.09]", icon: CircleCheck },
  WARNING: { text: "text-[#d8ae71]", surface: "border-[#c8954f]/25 bg-[#c8954f]/[.10]", icon: AlertTriangle },
  CRITICAL: { text: "text-[#de8b7d]", surface: "border-[#b95045]/35 bg-[#b95045]/[.12]", icon: ShieldAlert },
  DEGRADED: { text: "text-[#d8ae71]", surface: "border-[#c8954f]/25 bg-[#c8954f]/[.10]", icon: CircleAlert },
  OFFLINE: { text: "text-[#8f99a5]", surface: "border-[#69727c]/30 bg-[#69727c]/[.10]", icon: WifiOff },
  NOT_CONFIGURED: { text: "text-[#8f99a5]", surface: "border-[#69727c]/30 bg-[#69727c]/[.10]", icon: CloudOff },
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
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${tone.surface} ${tone.text} ${dataText} ${compact ? "text-[11px]" : "text-[12px]"}`}>
      <Icon size={compact ? 11 : 13} strokeWidth={2.1} />
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
      className="relative grid size-[58px] place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} ${clamped * 3.6}deg, var(--risk-track) 0deg)` }}
      aria-label={`Risk score ${value}`}
    >
      <div className="grid size-[46px] place-items-center rounded-full bg-[#171a1d]">
        <span className={`${dataText} text-[14px] ${tone.text}`}>{status === "OFFLINE" ? "—" : Math.round(value)}</span>
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
      className="grid size-9 place-items-center rounded-xl border border-white/[.075] bg-white/[.025] text-[#aeb5ba] transition hover:border-white/[.15] hover:bg-white/[.07] hover:text-white"
    >
      {children}
    </button>
  );
}

function LoadingBlock({ label = "Synchronizing command data…" }: { label?: string }) {
  return (
    <div className={`${shell} flex min-h-[240px] items-center justify-center rounded-2xl`}>
      <div className="text-center text-[#9ba2a3]">
        <RefreshCw className="mx-auto animate-spin" size={20} />
        <p className="mt-3 text-[13px]">{label}</p>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className={`${shell} rounded-2xl px-6 py-14 text-center`}>
      <CircleAlert className="mx-auto text-[#8c9495]" size={22} />
      <p className="mt-3 text-[15px] font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-[13px] leading-6 text-[#828a8d]">{body}</p>
    </div>
  );
}

function PageIntro({ eyebrow, title, children, action }: { eyebrow: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className={`${dataText} text-[11px] tracking-[.18em] text-[#c8954f]`}>{eyebrow}</p>
        <h1 className="mt-2 font-['Manrope'] text-3xl font-medium tracking-[-.035em]">{title}</h1>
        {children ? <div className="mt-2 text-[13px] leading-6 text-[#8f9797]">{children}</div> : null}
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
      className="group flex h-9 items-center gap-2 rounded-xl border border-white/[.10] bg-white/[.035] px-2.5 text-[#c9ccc4] transition hover:border-[#c8954f]/45 hover:bg-[#c8954f]/[.08]"
    >
      <span className="grid size-5 place-items-center rounded-md bg-[#c8954f]/[.13] text-[#dfba7c]">
        {light ? <Moon size={13} /> : <Sun size={14} />}
      </span>
      <span className={`${dataText} hidden text-[11px] tracking-[.08em] sm:block`}>{light ? "DARK" : "LIGHT"}</span>
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
    <main className="min-h-screen overflow-hidden bg-[#0b0e0c] px-5 text-[#e8e7e3] [.theme-light_&]:!bg-[#F6F8FB]">
      <div className="absolute right-5 top-5 z-10"><ThemeToggle theme={theme} setTheme={setTheme} /></div>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(172,124,63,.12),transparent_26%),radial-gradient(circle_at_82%_82%,rgba(101,130,109,.11),transparent_31%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
        <section className="max-w-xl">
          <div className="mb-12 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl border border-[#c8954f]/30 bg-[#c8954f]/10 text-[#e3bd82]"><ShieldCheck size={20} /></div>
            <div><p className={`${dataText} text-[#d9d6cf]`}>SCS—RG</p><p className="text-[13px] tracking-[.14em] text-[#767d83]">CAMPUS SAFETY GRID</p></div>
          </div>
          <p className={`${dataText} text-[13px] tracking-[.2em] text-[#c8954f]`}>SECURE OPERATIONS ACCESS</p>
          <h1 className="mt-4 max-w-md font-['Manrope'] text-4xl font-medium leading-[1.12] tracking-[-.035em] sm:text-5xl">Safety is a live system.</h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-[#9ba1a4]">Authenticate to monitor five independent lab zones, rank simultaneous incidents and coordinate response from one source of truth.</p>
          <div className="mt-10 flex flex-wrap gap-5 text-[12px] text-[#858d8e]"><span className="flex items-center gap-2"><ShieldCheck size={13} />Backend-enforced RBAC</span><span className="flex items-center gap-2"><Radio size={13} />WebSocket + polling recovery</span></div>
        </section>

        <section className={`${shell} rounded-[28px] p-7 sm:p-9`}>
          <p className={`${dataText} text-[12px] tracking-[.18em] text-[#a4aaa8]`}>OPERATOR IDENTITY</p>
          <h2 className="mt-3 font-['Manrope'] text-2xl font-medium tracking-[-.025em]">Enter the grid</h2>
          <div className="mt-7 grid grid-cols-2 gap-2 rounded-2xl border border-white/[.07] bg-black/10 p-1.5">
            {(["SECURITY_STAFF", "ADMIN"] as const).map(item => (
              <button
                key={item}
                onClick={() => setRole(item)}
                className={`rounded-xl px-3 py-3 text-left text-[14px] transition ${role === item ? "bg-[#d6d1c5] text-[#10120f] shadow-sm" : "text-[#8d9499] hover:bg-white/[.05] hover:text-white"}`}
              >
                <span className="block font-medium">{item === "ADMIN" ? "Admin" : "Security Staff"}</span>
                <span className="mt-1 block text-[12px] opacity-65">{item === "ADMIN" ? "Override and system health" : "Monitor and acknowledge"}</span>
              </button>
            ))}
          </div>
          <label className="mt-6 block text-[12px] tracking-[.1em] text-[#92999b]">
            CAMPUS EMAIL
            <input value={email} onChange={event => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.09] bg-black/10 px-4 py-3 text-[14px] text-white outline-none focus:border-[#c8954f]/45" />
          </label>
          <label className="mt-4 block text-[12px] tracking-[.1em] text-[#92999b]">
            PASSWORD
            <span className="relative mt-2 block">
              <input type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => event.key === "Enter" && void submit()} className="w-full rounded-xl border border-white/[.09] bg-black/10 px-4 py-3 pr-12 text-[14px] text-white outline-none focus:border-[#c8954f]/45" />
              <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8f9797]">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </span>
          </label>
          <button disabled={loading || !email || password.length < 8} onClick={() => void submit()} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#d6d1c5] py-3.5 text-[14px] font-medium text-[#10120f] transition hover:bg-white disabled:opacity-50">
            {loading ? <RefreshCw className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
            {loading ? "Authenticating…" : "Authenticate"}
          </button>
          <p className="mt-4 text-center text-[11px] leading-5 text-[#737b7e]">Demo credentials are seeded from <code>DEMO_PASSWORD</code>. The selected role changes the actual account used.</p>
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

  if (!authChecked) return <main className="min-h-screen bg-[#0b0e0c] p-6 text-white"><LoadingBlock label="Checking secure session…" /></main>;
  if (!user) return <Navigate to="/login" replace />;

  const openAttention = activeIncidents.filter(incident => incident.status === "OPEN").length;
  const connectionTone = wsStatus === "CONNECTED" ? "text-[#b4cdaa]" : wsStatus === "RECONNECTING" || wsStatus === "CONNECTING" ? "text-[#d8ae71]" : "text-[#de8b7d]";

  return (
    <div className="min-h-screen bg-[#0b0e0c] text-[#e8e7e3] [.theme-light_&]:!bg-[#F6F8FB]">
      <aside className={`fixed inset-y-0 left-0 z-50 w-[255px] border-r border-white/[.07] bg-[#0e1210]/98 p-4 backdrop-blur-xl transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-2 py-2">
          <NavLink to="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl border border-[#c8954f]/30 bg-[#c8954f]/10 text-[#e3bd82]"><ShieldCheck size={18} /></span>
            <span><span className={`${dataText} block text-[#dedbd4]`}>SCS—RG</span><span className="block text-[10px] tracking-[.16em] text-[#777f82]">COMMAND GRID</span></span>
          </NavLink>
          <button className="lg:hidden" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>
        <nav className="mt-8 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] transition ${isActive ? "bg-[#c8954f]/[.12] text-[#e7c58d]" : "text-[#90989a] hover:bg-white/[.04] hover:text-white"}`}>
                <Icon size={16} /><span>{item.label}</span>
              </NavLink>
            );
          })}
          {user.role === "ADMIN" ? (
            <NavLink to="/system-health" onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] transition ${isActive ? "bg-[#c8954f]/[.12] text-[#e7c58d]" : "text-[#90989a] hover:bg-white/[.04] hover:text-white"}`}>
              <Database size={16} />System health
            </NavLink>
          ) : null}
        </nav>
        <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-3">
          <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-white/[.06]"><UserRound size={15} /></span><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-medium">{user.name}</p><p className={`${dataText} mt-0.5 text-[10px] text-[#788083]`}>{user.role.replace("_", " ")}</p></div></div>
          <button onClick={() => void logout()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/[.07] py-2 text-[12px] text-[#aeb4b3] hover:bg-white/[.05]"><LogOut size={13} />Logout</button>
        </div>
      </aside>

      <div className="lg:pl-[255px]">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/[.065] bg-[#0b0e0c]/88 px-4 backdrop-blur-xl sm:px-6 [.theme-light_&]:!bg-[#F6F8FB]/90">
          <div className="flex items-center gap-3">
            <IconButton label="Open navigation" onClick={() => setMobileOpen(true)}><Menu className="lg:hidden" size={17} /></IconButton>
            <div className="hidden sm:block">
              <p className={`${dataText} ${connectionTone} text-[11px] tracking-[.1em]`}>{wsStatus === "CONNECTED" ? "LIVE CHANNEL CONNECTED" : `${wsStatus} · REST FALLBACK ACTIVE`}</p>
              <p className="mt-0.5 text-[10px] text-[#747c7e]">Last authoritative sync {lastSyncAt ? shortTime(lastSyncAt) : "pending"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <button onClick={() => setAlertsOpen(true)} className="relative grid size-9 place-items-center rounded-xl border border-white/[.075] bg-white/[.025] text-[#aeb5ba] hover:bg-white/[.07]" aria-label="Open alerts">
              <Bell size={16} />
              {openAttention > 0 ? <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#b95045] px-1 text-[10px] text-white">{openAttention}</span> : null}
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
    <div className={`${shell} rounded-2xl p-4`}>
      <div className="flex items-center justify-between"><p className={`${dataText} text-[10px] tracking-[.12em] text-[#7f8789]`}>{label}</p><Icon size={14} className="text-[#c8954f]" /></div>
      <p className={`${dataText} mt-4 text-2xl text-[#eeece7]`}>{value}</p>
      <p className="mt-1 text-[11px] text-[#7d8587]">{note}</p>
    </div>
  );
}

function ZoneCard({ zone }: { zone: DashboardZone }) {
  const navigate = useNavigate();
  const status = displayStatus(zone);
  const predictionPercent = zone.prediction ? Math.round(zone.prediction.probability * 100) : null;
  return (
    <button onClick={() => navigate(`/zones/${zone.code}`)} className={`${shell} group w-full rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:border-white/[.16]`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[.08] bg-white/[.035] text-[#c8ccca]">{zoneIconEl(zone.code, 17)}</span><div className="min-w-0"><p className="truncate text-[15px] font-medium">{zone.name}</p><p className={`${dataText} mt-1 text-[10px] text-[#747d7f]`}>{zone.code}</p></div></div>
        <RiskRing value={zone.riskScore} status={status} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2"><StatusBadge status={status} compact /><span className="inline-flex items-center gap-1.5 rounded-full border border-white/[.07] px-2 py-1 text-[11px] text-[#aeb4b2]">{hazardIconEl(zone.primaryHazard, 11)}{hazardLabels[zone.primaryHazard ?? "NONE"]}</span></div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-xl bg-white/[.025] p-2.5"><p className="text-[#70797b]">Occupancy</p><p className="mt-1 text-[#d0d2cd]">{zone.occupancy ? "Occupied" : "No presence"}</p></div>
        <div className="rounded-xl bg-white/[.025] p-2.5"><p className="text-[#70797b]">Predicted Risk</p><p className="mt-1 text-[#d0d2cd]">{predictionPercent === null ? "No model sample" : `${predictionPercent}% advisory`}</p></div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-white/[.055] pt-3 text-[10px] text-[#737c7d]"><span>{zone.isTrendingCritical ? "↗ Trending toward critical" : "Trend monitored"}</span><span className="flex items-center gap-1">Updated {shortTime(zone.lastReceivedAt ?? zone.lastReadingAt)} <ChevronRight className="transition group-hover:translate-x-0.5" size={12} /></span></div>
    </button>
  );
}

function PriorityCard({ item, compact = false }: { item: PriorityItem; compact?: boolean }) {
  const navigate = useNavigate();
  const { acknowledgeIncident } = useRobofusion();
  return (
    <article className={`rounded-2xl border ${item.rank === 1 ? "border-[#b95045]/35 bg-[#b95045]/[.09]" : "border-white/[.08] bg-white/[.025]"} ${compact ? "p-3" : "p-5"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3"><span className={`${dataText} grid size-8 shrink-0 place-items-center rounded-full ${item.rank === 1 ? "bg-[#b95045]/25 text-[#ef9b8d]" : "bg-white/[.06] text-[#c7cbc7]"}`}>#{item.rank}</span><div><p className="text-[15px] font-medium">{item.zone_name}</p><p className={`${dataText} mt-1 text-[10px] text-[#7e8789]`}>{item.primary_hazard} · {item.occupancy ? "OCCUPIED" : "NO OCCUPANCY"}</p></div></div>
        <div className="text-right"><p className={`${dataText} text-[18px] text-[#efc987]`}>{item.priority_score.toFixed(1)}</p><p className="text-[10px] text-[#737c7e]">PRIORITY SCORE</p></div>
      </div>
      <p className={`${compact ? "mt-3 line-clamp-2" : "mt-4"} text-[12px] leading-5 text-[#aeb4b2]`}>{item.ranking_reason}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[.06] pt-3">
        <div className={`${dataText} flex gap-4 text-[10px] text-[#7e8789]`}><span>Risk {item.risk_score}</span><span>Critical {secondsLabel(item.critical_duration_seconds)}</span>{item.nlp_advisory_bonus > 0 ? <span>NLP +{item.nlp_advisory_bonus}</span> : null}</div>
        <div className="flex gap-2">
          {item.status === "OPEN" ? <button onClick={() => void acknowledgeIncident(item.incident_id)} className="rounded-lg border border-[#c8954f]/30 px-2.5 py-1.5 text-[11px] text-[#dfba7c] hover:bg-[#c8954f]/10">Acknowledge</button> : <span className="flex items-center gap-1 text-[11px] text-[#b4cdaa]"><Check size={12} />Acknowledged</span>}
          <button onClick={() => navigate(`/incidents/${item.incident_id}`)} className="text-[11px] text-[#c8cbc6] hover:text-white">Timeline →</button>
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

          <div className={`${shell} rounded-2xl p-5`}>
            <p className={`${dataText} text-[11px] tracking-[.14em] text-[#848d8d]`}>RECENT STATE / INCIDENT EVENTS</p>
            <div className="mt-5 space-y-4">{events.length ? events.map(event => <div key={event.id} className="flex gap-3 border-b border-white/[.055] pb-4 last:border-0 last:pb-0"><span className="mt-1 size-2 shrink-0 rounded-full bg-[#c8954f]" /><div><p className={`${dataText} text-[10px] text-[#7f8789]`}>{event.eventType} · {dateLabel(event.occurredAt)}</p><p className="mt-1 text-[12px] leading-5 text-[#b6bbb7]">{event.description}</p></div></div>) : <p className="text-[12px] text-[#7d8587]">No event trail recorded yet.</p>}</div>
          </div>

          <div className={`${shell} rounded-2xl p-5`}>
            <div className="flex items-center justify-between"><p className={`${dataText} text-[11px] tracking-[.14em] text-[#848d8d]`}>RAW READING HISTORY</p><span className="text-[10px] text-[#7e8789]">{raw_readings_visible ? "ADMIN ACCESS" : "RESTRICTED BY ROLE"}</span></div>
            {raw_readings_visible ? <div className="mt-4 overflow-x-auto"><table className="min-w-[680px] w-full text-left"><thead><tr className="border-b border-white/[.06]">{["Observed", "Fire", "Gas", "Water", "PIR", "Risk", "State"].map(label => <th key={label} className={`${dataText} px-2 py-2 text-[10px] font-medium text-[#747d7f]`}>{label}</th>)}</tr></thead><tbody>{readings.slice(0, 15).map(reading => <tr key={reading.id} className="border-b border-white/[.045]"><td className={`${dataText} px-2 py-2 text-[10px]`}>{shortTime(reading.observedAt)}</td><td className="px-2 py-2 text-[11px]">{reading.fire ? "YES" : "NO"}</td><td className={`${dataText} px-2 py-2 text-[10px]`}>{reading.gas}</td><td className={`${dataText} px-2 py-2 text-[10px]`}>{reading.water}</td><td className="px-2 py-2 text-[11px]">{reading.pir ? "YES" : "NO"}</td><td className={`${dataText} px-2 py-2 text-[10px]`}>{reading.riskScore}</td><td className="px-2 py-2"><StatusBadge status={reading.calculatedState} compact /></td></tr>)}</tbody></table></div> : <p className="mt-4 text-[12px] leading-5 text-[#81898b]">Security Staff can see operational summaries and incident timelines. Raw historical sensor values are restricted to Admin, matching the data-retention/access policy.</p>}
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
      <div className={`${shell} rounded-2xl`}>
        <div className="flex flex-wrap gap-2 border-b border-white/[.065] p-4">
          <label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#70797b]" size={14} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search ID, zone, hazard…" className="w-full rounded-xl border border-white/[.08] bg-black/10 py-2.5 pl-9 pr-3 text-[12px] outline-none" /></label>
          <select value={range} onChange={event => setRange(event.target.value)} className="rounded-xl border border-white/[.08] bg-[#121713] px-3 py-2 text-[12px]"><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All retained</option></select>
          <select value={zoneId} onChange={event => setZoneId(event.target.value)} className="rounded-xl border border-white/[.08] bg-[#121713] px-3 py-2 text-[12px]"><option value="">All zones</option>{zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select>
          <select value={hazard} onChange={event => setHazard(event.target.value)} className="rounded-xl border border-white/[.08] bg-[#121713] px-3 py-2 text-[12px]"><option value="">All hazards</option>{(["FIRE", "GAS", "FLOOD", "OCCUPANCY"] as const).map(item => <option key={item}>{item}</option>)}</select>
          <select value={status} onChange={event => setStatus(event.target.value)} className="rounded-xl border border-white/[.08] bg-[#121713] px-3 py-2 text-[12px]"><option value="all">All statuses</option><option value="active">Active</option><option value="OPEN">Open</option><option value="ACKNOWLEDGED">Acknowledged</option><option value="RESOLVED">Resolved</option></select>
        </div>
        <div className="overflow-x-auto"><table className="min-w-[1040px] w-full text-left"><thead className="border-b border-white/[.065] bg-white/[.018]"><tr>{["INCIDENT", "ZONE", "HAZARD", "TRIGGER", "PEAK RISK", "ACKNOWLEDGED", "RESOLVED", "DURATION", "STATUS"].map(label => <th key={label} className={`${dataText} px-4 py-3 text-[10px] font-medium text-[#737b7e]`}>{label}</th>)}</tr></thead><tbody>{visible.length ? visible.map(incident => { const zone = zones.find(item => item.id === incident.zoneId); const display = incidentStatusLabel(incident); return <tr key={incident.id} onClick={() => navigate(`/incidents/${incident.id}`)} className="cursor-pointer border-b border-white/[.05] hover:bg-white/[.03]"><td className={`${dataText} px-4 py-4 text-[11px] text-[#d8bb85]`}>{incident.id}</td><td className="px-4 py-4 text-[12px] font-medium">{zone?.name ?? incident.zoneId}</td><td className="px-4 py-4 text-[12px] text-[#a8adab]">{hazardLabels[incident.primaryHazard]}</td><td className={`${dataText} px-4 py-4 text-[10px]`}>{dateLabel(incident.startedAt)}</td><td className={`${dataText} px-4 py-4 text-[11px]`}>{incident.peakRiskScore}</td><td className="px-4 py-4 text-[11px]">{incident.acknowledgedAt ? `${incident.acknowledgedBy ?? "User"} · ${dateLabel(incident.acknowledgedAt)}` : "Unassigned"}</td><td className={`${dataText} px-4 py-4 text-[10px]`}>{dateLabel(incident.resolvedAt)}</td><td className={`${dataText} px-4 py-4 text-[10px]`}>{durationLabel(incident.startedAt, incident.resolvedAt ?? null)}</td><td className="px-4 py-4">{display === "RESOLVED" ? <span className="inline-flex items-center gap-1 text-[11px] text-[#b4cdaa]"><Check size={12} />RESOLVED</span> : <StatusBadge status={display} compact />}</td></tr>; }) : <tr><td colSpan={9} className="px-5 py-16 text-center text-[13px] text-[#7d8588]">No incidents match the selected backend filters.</td></tr>}</tbody></table></div>
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
        <section className={`${shell} rounded-2xl p-5`}>
          <p className={`${dataText} text-[11px] tracking-[.14em] text-[#89918f]`}>INCIDENT SUMMARY</p>
          <div className="mt-5 space-y-4">{[["Zone", zone?.name ?? incident.zoneId], ["Initial risk", String(incident.initialRiskScore)], ["Peak risk", String(incident.peakRiskScore)], ["Status", incident.status], ["Triggered", dateLabel(incident.startedAt)], ["Acknowledged", incident.acknowledgedAt ? `${incident.acknowledgedBy ?? "User"} · ${dateLabel(incident.acknowledgedAt)}` : "Pending"], ["Resolved", dateLabel(incident.resolvedAt)], ["Duration", durationLabel(incident.startedAt, incident.resolvedAt ?? null)]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-white/[.055] pb-3"><span className="text-[11px] text-[#757e80]">{label}</span><span className="text-right text-[12px] text-[#d0d2cd]">{value}</span></div>)}</div>
          {incident.status === "OPEN" ? <button onClick={() => void acknowledgeIncident(incident.id).then(async success => { if (success) setTimeline(await fetchIncidentTimeline(incident.id)); })} className="mt-5 w-full rounded-xl bg-[#d6d1c5] py-3 text-[12px] font-medium text-[#10120f]">Acknowledge incident</button> : null}
          <button onClick={() => navigate(`/zones/${zone?.code ?? ""}`)} disabled={!zone} className="mt-2 w-full rounded-xl border border-white/[.08] py-3 text-[12px] disabled:opacity-40">Open live zone</button>
        </section>
        <section className={`${shell} rounded-2xl p-5`}>
          <p className={`${dataText} text-[11px] tracking-[.14em] text-[#89918f]`}>EVENT TRAIL</p>
          <div className="mt-6 space-y-0">{events.length ? events.map((event, index) => { const Icon = eventIcon(event); return <div key={event.id} className="relative flex gap-4 pb-7 last:pb-0"><span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full border border-white/[.08] bg-white/[.035] text-[#dfba7c]"><Icon size={13} /></span>{index < events.length - 1 ? <span className="absolute left-[13px] top-9 h-[calc(100%-17px)] w-px bg-white/[.08]" /> : null}<div><p className={`${dataText} text-[10px] text-[#dfba7c]`}>{event.eventType} <span className="ml-2 text-[#737b7e]">{dateLabel(event.occurredAt)}</span></p><p className="mt-1 text-[12px] leading-5 text-[#c1c5c0]">{event.description}</p><p className="mt-1 text-[10px] text-[#727b7c]">Source: {event.eventSource}</p></div></div>; }) : <p className="text-[12px] text-[#7d8587]">No timeline events recorded.</p>}</div>
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
        <section className={`${shell} rounded-2xl p-5`}>
          <label className={`${dataText} text-[11px] tracking-[.12em] text-[#858e8f]`}>FREE-TEXT OBSERVATION<textarea value={text} onChange={event => setText(event.target.value)} className="mt-3 min-h-[190px] w-full rounded-2xl border border-white/[.08] bg-black/10 p-4 text-[13px] leading-6 outline-none focus:border-[#c8954f]/40" /></label>
          <button onClick={() => void submit()} disabled={loading || text.trim().length < 5} className="mt-4 flex items-center gap-2 rounded-xl bg-[#d6d1c5] px-4 py-3 text-[12px] font-medium text-[#10120f] disabled:opacity-50">{loading ? <RefreshCw className="animate-spin" size={14} /> : <Send size={14} />}Parse, validate and store</button>
          <p className="mt-4 text-[11px] leading-5 text-[#7f8789]">An accepted report can only add a small priority bonus when it matches an already-active Critical incident in the same zone and hazard. It never changes the live risk score or actuates hardware.</p>
        </section>
        <section className={`${shell} rounded-2xl p-5`}>
          <p className={`${dataText} text-[11px] tracking-[.14em] text-[#858e8f]`}>STRUCTURED RESULT</p>
          {result ? <pre className="mt-4 max-h-[420px] overflow-auto rounded-xl bg-black/20 p-4 text-[11px] leading-5 text-[#c8ccc7]">{JSON.stringify(result, null, 2)}</pre> : <div className="mt-12 text-center text-[#7e8789]"><Sparkles className="mx-auto" size={21} /><p className="mt-3 text-[12px]">Submit a note to inspect the validated structured signal.</p></div>}
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
      <div className={`${shell} mt-5 rounded-2xl p-5`}><div className="flex items-center justify-between"><p className={`${dataText} text-[11px] tracking-[.14em] text-[#858e8f]`}>COMPLETE HEALTH PAYLOAD</p><span className="text-[10px] text-[#7d8587]">Checked {dateLabel(health?.checked_at as string | undefined)}</span></div><pre className="mt-4 max-h-[560px] overflow-auto rounded-xl bg-black/20 p-4 text-[11px] leading-5 text-[#c8ccc7]">{JSON.stringify(health, null, 2)}</pre></div>
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
