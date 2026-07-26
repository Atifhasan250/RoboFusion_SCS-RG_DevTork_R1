import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RobofusionProvider, useRobofusion } from "./RobofusionContext";
import { createBrowserRouter, Navigate, NavLink, Outlet, useNavigate, useParams } from "react-router";
import {
  AlertTriangle, Bell, Bot, Check, ChevronRight, CircleAlert, CircleCheck,
  CircleDotDashed, CircleX, CloudOff, Droplets, Flame, Gauge, History,
  Eye, EyeOff, LogOut, MapPinned, Menu, Network, Radio, Search, Server,
  ShieldAlert, ShieldCheck, Sparkles, Sun, Thermometer, UserRound, Users,
  Waves, Wifi, WifiOff, X, Zap, Moon
} from "lucide-react";

type Status = "SAFE" | "WARNING" | "CRITICAL" | "OFFLINE" | "NOT_CONFIGURED";
type Zone = { id: string; name: string; code: string; status: Status; risk: number; predicted: number; fire: string; gas: string; water: string; occupancy: number; updated: string; online: boolean; hazard: string; trend: "rising" | "stable" | "falling"; icon: typeof Wifi };

const zoneIcon = (code: string) => code.includes("SERVER") ? Server : code.includes("IOT") ? Wifi : code.includes("ROBOT") ? Bot : code.includes("DATA") ? Gauge : Network;
const dateLabel = (value?: string | null) => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value)) : "—";
const hazardLabel = (hazard: string) => ({ FIRE: "Fire hazard", GAS: "Gas concentration", FLOOD: "Flood risk", OCCUPANCY: "Occupancy anomaly", NONE: "No active hazard" }[hazard] ?? hazard);

function useMappedData() {
  const { zones: backendZones, incidents: backendIncidents } = useRobofusion();
  const zones = useMemo(() => backendZones.map(zone => ({
    id: zone.id, name: zone.name, code: zone.code, status: zone.state, risk: Math.round(zone.riskScore ?? 0), predicted: Math.round(zone.riskScore ?? 0),
    fire: zone.primaryHazard === "FIRE" ? "Detected" : "Normal", gas: zone.primaryHazard === "GAS" ? "Elevated" : "Normal", water: zone.primaryHazard === "FLOOD" ? "Detected" : "Dry",
    occupancy: zone.occupancy ? 1 : 0, updated: dateLabel(zone.lastReadingAt?.toString()), online: zone.connectivityState !== "OFFLINE", hazard: hazardLabel(zone.primaryHazard || "NONE"), trend: "stable" as const, icon: zoneIcon(zone.code),
  })), [backendZones]);
  
  const incidents = useMemo(() => backendIncidents.map(incident => {
    const zone = backendZones.find((item) => item.id === incident.zoneId);
    return { id: incident.id, zone: zone?.name ?? incident.zoneId, zoneId: incident.zoneId, hazard: hazardLabel(incident.primaryHazard || "NONE"), trigger: dateLabel(incident.startedAt?.toString()), acknowledged: incident.acknowledgedBy ? `${incident.acknowledgedBy} · ${dateLabel(incident.acknowledgedAt?.toString())}` : "Unassigned", resolved: dateLabel(incident.resolvedAt?.toString()), duration: "Live", status: incident.status === "RESOLVED" ? "RESOLVED" : zone?.state === "WARNING" ? "WARNING" : "CRITICAL" };
  }), [backendIncidents, backendZones]);
  
  return { zones, incidents };
}
const statusStyles: Record<Status, { text: string; line: string; surface: string; icon: typeof CircleCheck }> = {
  SAFE: { text: "text-[#b1c9a8]", line: "bg-[#88a879]", surface: "border-[#88a879]/25 bg-[#88a879]/[.09]", icon: CircleCheck },
  WARNING: { text: "text-[#d8ae71]", line: "bg-[#c8954f]", surface: "border-[#c8954f]/25 bg-[#c8954f]/[.10]", icon: AlertTriangle },
  CRITICAL: { text: "text-[#de8b7d]", line: "bg-[#b95045]", surface: "border-[#b95045]/35 bg-[#b95045]/[.12]", icon: ShieldAlert },
  OFFLINE: { text: "text-[#8f99a5]", line: "bg-[#69727c]", surface: "border-[#69727c]/30 bg-[#69727c]/[.10]", icon: WifiOff },
  NOT_CONFIGURED: { text: "text-[#8f99a5]", line: "bg-[#69727c]", surface: "border-[#69727c]/30 bg-[#69727c]/[.10]", icon: WifiOff },
};

const shell = "border border-white/[.09] bg-[#151917]/82 shadow-[0_24px_64px_rgba(0,0,0,.34)] backdrop-blur-2xl";
const data = "font-['Inter'] tabular-nums text-[13px] tracking-[.02em]";

type ThemeMode = "dark" | "light";

function useThemeMode() {
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("scs-theme") as ThemeMode) || "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("theme-light", theme === "light");
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("scs-theme", theme);
  }, [theme]);
  return [theme, setTheme] as const;
}

function ThemeToggle({ theme, setTheme }: { theme: ThemeMode; setTheme: (theme: ThemeMode) => void }) {
  const isLight = theme === "light";
  return <button onClick={() => setTheme(isLight ? "dark" : "light")} aria-label={`Switch to ${isLight ? "dark" : "light"} theme`} title={`Switch to ${isLight ? "dark" : "light"} theme`} className="group flex h-9 items-center gap-2 rounded-xl border border-white/[.10] bg-white/[.035] px-2.5 text-[#c9ccc4] shadow-[0_8px_24px_rgba(0,0,0,.12)] transition hover:border-[#c8954f]/45 hover:bg-[#c8954f]/[.08] hover:text-[#dfba7c]">
    <span className="grid size-5 place-items-center rounded-md bg-[#c8954f]/[.13] text-[#dfba7c] transition group-hover:scale-105">{isLight ? <Moon size={13}/> : <Sun size={14}/>}</span>
    <span className={`${data} hidden text-[11px] tracking-[.08em] sm:block`}>{isLight ? "DARK" : "LIGHT"}</span>
  </button>;
}

function StatusBadge({ status, compact = false }: { status: Status; compact?: boolean }) {
  const tone = statusStyles[status]; const Icon = tone.icon;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${tone.surface} ${tone.text} ${data} ${compact ? "text-[11px]" : "text-[12px]"}`}><Icon size={compact ? 11 : 13} strokeWidth={2.1}/>{status}</span>;
}
function RiskRing({ value, status }: { value: number; status: Status }) {
  const tone = statusStyles[status];
  return <div className="relative grid size-[52px] place-items-center rounded-full" style={{ background: `conic-gradient(${status === "OFFLINE" ? "var(--risk-offline)" : status === "CRITICAL" ? "var(--risk-critical)" : status === "WARNING" ? "var(--risk-warning)" : "var(--risk-safe)"} ${value * 3.6}deg, var(--risk-track) 0deg)` }}><div className="grid size-[42px] place-items-center rounded-full bg-[#171a1d]"><span className={`${data} text-[14px] ${tone.text}`}>{status === "OFFLINE" ? "—" : value}</span></div></div>;
}
function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) { return <button aria-label={label} title={label} onClick={onClick} className="grid size-9 place-items-center rounded-xl border border-white/[.075] bg-white/[.025] text-[#aeb5ba] transition hover:border-white/[.15] hover:bg-white/[.07] hover:text-white">{children}</button>; }

function Login() {
  const navigate = useNavigate(); const [role, setRole] = useState<"Admin" | "Security Staff">("Security Staff"); const [loading, setLoading] = useState(false); const [isPasswordVisible, setIsPasswordVisible] = useState(false); const [theme, setTheme] = useThemeMode();
  const { login } = useRobofusion();
  const [email, setEmail] = useState("admin@scs.local");
  const [password, setPassword] = useState("scs-grid");
  const enter = async () => { 
    setLoading(true); 
    const ok = await login(email, password); 
    if (ok) {
      sessionStorage.setItem("scs-auth", role); 
      navigate("/"); 
    } else {
      setLoading(false);
    }
  };
  return <main className="min-h-screen overflow-hidden bg-[#0b0e0c] px-5 text-[#e8e7e3] selection:bg-[#c8954f]/30 [.theme-light_&]:!bg-[#F6F8FB]"><div className="absolute right-5 top-5 z-10"><ThemeToggle theme={theme} setTheme={setTheme}/></div><div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(172,124,63,.12),transparent_26%),radial-gradient(circle_at_82%_82%,rgba(101,130,109,.11),transparent_31%)]"/><div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_.9fr]"><section className="max-w-xl"><div className="mb-12 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl border border-[#c8954f]/30 bg-[#c8954f]/10 text-[#e3bd82]"><ShieldCheck size={20}/></div><div><p className={`${data} text-[#d9d6cf]`}>SCS—RG</p><p className="text-[13px] tracking-[.14em] text-[#767d83]">CAMPUS SAFETY GRID</p></div></div><p className={`${data} text-[13px] tracking-[.2em] text-[#c8954f]`}>SECURE OPERATIONS ACCESS</p><h1 className="mt-4 max-w-md font-['Manrope'] text-4xl font-medium leading-[1.12] tracking-[-.035em] text-[#efede8] sm:text-5xl">Safety is a live system.</h1><p className="mt-6 max-w-md text-sm leading-7 text-[#9ba1a4]">Authenticate to view and coordinate the multi-hazard response posture across technical laboratories.</p><div className="mt-12 flex gap-6 text-[13px] text-[#787f84]"><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#88a879]"/>Encrypted channel</span><span>Campus edge · 24 ms</span></div></section><section className={`${shell} rounded-[28px] p-7 sm:p-9`}><p className={`${data} text-[13px] tracking-[.18em] text-[#a4aaa8]`}>OPERATOR IDENTITY</p><h2 className="mt-3 font-['Manrope'] text-2xl font-medium tracking-[-.025em]">Enter the grid</h2><div className="mt-7 grid grid-cols-2 gap-2 rounded-2xl border border-white/[.07] bg-black/10 p-1.5">{(["Security Staff", "Admin"] as const).map((item) => <button key={item} onClick={() => setRole(item)} className={`rounded-xl px-3 py-3 text-left text-[14px] transition ${role === item ? "bg-[#d6d1c5] text-[#10120f] shadow-sm" : "text-[#8d9499] hover:bg-white/[.05] hover:text-white"}`}><span className="block font-medium">{item}</span><span className="mt-1 block text-[12px] opacity-65">{item === "Admin" ? "Override authority" : "Response coordination"}</span></button>)}</div><label className="mt-6 block text-[13px] tracking-[.1em] text-[#92999b]">CAMPUS EMAIL<input value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-white/[.1] bg-[#101213] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-[#5c6368] focus:border-[#c8954f]/65"/></label><label className="mt-4 block text-[13px] tracking-[.1em] text-[#92999b]">ACCESS KEY<div className="mt-2 flex rounded-xl border border-white/[.1] bg-[#101213] focus-within:border-[#c8954f]/65"><input type={isPasswordVisible ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-transparent px-3.5 py-3 text-sm text-white outline-none transition [.theme-light_&]:!bg-transparent [.theme-light_&]:!shadow-none [.theme-light_:has(>&:focus)]:![border-color:rgba(164,109,50,0.65)]"/><button type="button" onClick={() => setIsPasswordVisible((visible) => !visible)} aria-label={isPasswordVisible ? "Hide access key" : "Show access key"} title={isPasswordVisible ? "Hide access key" : "Show access key"} className="grid w-11 shrink-0 place-items-center text-[#8b9498] transition hover:text-[#dfba7c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8954f]/65 focus-visible:ring-inset [.theme-light_&]:!text-[#667085] [.theme-light_&]:hover:!text-[#0F766E]">{isPasswordVisible ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label><button onClick={enter} disabled={loading} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#d6d1c5] py-3.5 text-[14px] font-semibold text-[#10120f] transition-colors hover:bg-[#f0ece2] hover:text-[#10120f] disabled:opacity-70 [.theme-light_&:not(:disabled)]:!bg-[#285847] [.theme-light_&:hover]:!bg-[#115E59] [.theme-light_&:hover]:![color:#18342d]">{loading ? <CircleDotDashed className="animate-spin" size={15}/> : <ShieldCheck size={15}/>} {loading ? "Verifying identity…" : "Access command dashboard"}</button><p className="mt-4 text-center text-[12px] leading-4 text-[#6f777d]">By continuing, you agree to the SCS-RG audit and response protocol.</p></section></div></main>;
}

function AppShell() {
  const nav = useNavigate(); const { user: auth, wsStatus, logout } = useRobofusion(); const [drawer, setDrawer] = useState(false); const [alertsOpen, setAlertsOpen] = useState(false); const [now, setNow] = useState(new Date()); const [theme, setTheme] = useThemeMode();
  useEffect(() => { if (!sessionStorage.getItem("scs-auth")) nav("/login"); }, [nav]);
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id); }, []);
  const links = [[MapPinned, "Live zone map", "/"], [Zap, "Priority queue", "/priority"], [History, "Incidents", "/incidents"]] as const;
  const role = auth?.role === "ADMIN" ? "Admin" : "Security Staff";
  if (!auth) return <Navigate to="/login" replace/>;
  return <div className="min-h-screen bg-transparent font-['Inter'] text-[#e7e5e0] selection:bg-[#c8954f]/30"><div className="pointer-events-none fixed inset-0 opacity-80 [background-image:linear-gradient(rgba(255,255,255,.017)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.017)_1px,transparent_1px)] [background-size:34px_34px]"/>{(wsStatus === "OFFLINE" || wsStatus === "RECONNECTING") && <div className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-xl items-center justify-between rounded-2xl border border-[#b95045]/30 bg-[#2b1e1e] px-4 py-3 shadow-2xl [.theme-light_&]:bg-[#FEF2F2] [.theme-light_&]:border-[#FCA5A5] [.theme-light_&]:text-[#991B1B]"><span className="flex items-center gap-2 text-[14px] text-[#d7bccc] [.theme-light_&]:text-[#B91C1C]"><CloudOff size={15}/> {wsStatus === "RECONNECTING" ? "Reconnecting to live telemetry..." : "Live telemetry offline"}</span></div>}<header className="sticky top-0 z-40 h-[68px] border-b border-white/[.07] bg-[#0b0e0c]/92 px-4 backdrop-blur-xl lg:px-6"><div className="mx-auto flex h-full max-w-[1600px] items-center gap-3"><button onClick={() => setDrawer(true)} className="grid size-9 place-items-center text-[#adb2b3] lg:hidden"><Menu size={20}/></button><NavLink to="/" className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl border border-[#c8954f]/25 bg-[#c8954f]/10 text-[#dfba7c]"><ShieldCheck size={18}/></span><span className="hidden sm:block"><b className={`${data} block text-[13px] font-medium tracking-[.14em]`}>SCS—RG</b><span className="block text-[11px] tracking-[.16em] text-[#747b80]">SAFETY RESPONSE GRID</span></span></NavLink><span className="hidden h-5 w-px bg-white/[.1] sm:block"/><p className="hidden text-[14px] text-[#a9ada9] md:block">Command dashboard</p><div className="ml-auto flex items-center gap-2 sm:gap-3"><button className="hidden items-center gap-2 rounded-full border border-[#c8954f]/20 bg-[#c8954f]/[.07] px-3 py-1.5 text-[12px] text-[#dfba7c] lg:flex"><span className="size-1.5 animate-pulse rounded-full bg-[#c8954f]"/>SYSTEM ACTIVE</button><span className={`${data} hidden text-[13px] text-[#8c9496] xl:block`}>{now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()} · {now.toLocaleTimeString("en-GB")}</span><ThemeToggle theme={theme} setTheme={setTheme}/><IconButton label="Open notification center" onClick={() => setAlertsOpen(!alertsOpen)}><Bell size={16}/></IconButton><div className="flex items-center gap-2 rounded-xl border border-white/[.075] bg-white/[.025] py-1 pl-1 pr-2.5"><span className="grid size-7 place-items-center rounded-lg bg-[#596b62] text-[12px] font-bold text-[#e3e3dc] [.theme-light_&]:!bg-[#98A2B3] [.theme-light_&]:!text-white">AM</span><span className="hidden leading-tight sm:block"><b className="block text-[13px] font-medium">{auth?.name || "A. Mensah"}</b><span className="block text-[11px] text-[#899095]">{role}</span></span></div></div></div></header><aside className={`fixed bottom-0 left-0 top-[68px] z-40 w-[248px] border-r border-white/[.07] bg-[#101411]/95 p-4 backdrop-blur-xl transition-transform lg:translate-x-0 ${drawer ? "translate-x-0" : "-translate-x-full"}`}><div className="mb-7 px-3 pt-2"><p className={`${data} text-[12px] tracking-[.15em] text-[#6f777c]`}>OPERATIONS</p></div><nav className="space-y-1">{links.map(([Icon, label, to]) => <NavLink key={to} end={to === "/"} to={to} onClick={() => setDrawer(false)} className={({isActive}) => `flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] transition ${isActive ? "bg-[#d6d1c5] text-[#161716]" : "text-[#9ba1a3] hover:bg-white/[.05] hover:text-white"}`}><Icon size={16}/>{label}</NavLink>)}</nav><div className="absolute bottom-5 left-4 right-4"><button onClick={() => { logout().then(() => nav("/login")); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[14px] text-[#8d9498] transition hover:bg-[#b95045]/10 hover:text-[#e09a8e]"><LogOut size={16}/> Logout</button></div></aside><main className="relative mx-auto max-w-[1600px] px-4 py-6 lg:ml-[248px] lg:px-7 [.theme-light_&]:bg-[#F6F8FB] [.theme-light_&]:[background-image:linear-gradient(135deg,rgba(255,255,255,.72),rgba(255,255,255,0)_44rem)] [.theme-light_&_[class*='bg-[#121713]']]:!bg-white [.theme-light_&_[class*='bg-[#151917]']]:!bg-white [.theme-light_&_[class*='bg-[#171a1d]']]:!bg-[#F9FAFC] [.theme-light_&_[class*='text-[#c8954f]']]:!text-[#0F766E] [.theme-light_&_[class*='text-[#dfba7c]']]:!text-[#0F766E] [.theme-light_&_[class*='text-[#dbb06d]']]:!text-[#D97706] [.theme-light_&_[class*='text-[#d8ae71]']]:!text-[#D97706] [.theme-light_&_[class*='text-[#d8bb85]']]:!text-[#0F766E] [.theme-light_&_[class*='text-[#d2b37e]']]:!text-[#0F766E] [.theme-light_&_[class*='bg-[#c8954f]/']]:!bg-[#FFF7ED] [.theme-light_&_[class~='bg-[#c8954f]']]:!bg-[#D97706] [.theme-light_&_[class*='border-[#c8954f]']]:!border-[#F4C38A] [.theme-light_&_[class*='hover:bg-[#f0ece2]']]:hover:!bg-[#115E59] [.theme-light_&_[class*='hover:text-[#10120f]']]:hover:!text-[#FFFFFF]"><Outlet context={{ setAlertsOpen }}/></main>{alertsOpen && <AlertCenter close={() => setAlertsOpen(false)}/>}<button onClick={() => setDrawer(false)} className={`fixed inset-0 z-30 bg-black/50 lg:hidden ${drawer ? "block" : "hidden"}`}/></div>;
}

function PageIntro({ eyebrow, title, children, action }: { eyebrow: string; title: string; children: ReactNode; action?: ReactNode }) { return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className={`${data} text-[12px] tracking-[.16em] text-[#c8954f]`}>{eyebrow}</p><h1 className="mt-2 text-2xl font-medium tracking-[-.03em] text-[#f0eee9]">{title}</h1><p className="mt-1.5 text-[14px] text-[#939a9b]">{children}</p></div>{action}</div>; }
function ZoneCard({ zone }: { zone: Zone }) {
  const nav = useNavigate();
  const Icon = zone.icon;
  const isCritical = zone.status === "CRITICAL";
  const telemetryState = zone.online ? "Live telemetry" : "Gateway offline";
  const statusStyles: Record<Status, { ring: string; text: string; line: string }> = {
    SAFE: { ring: "border-white/[.08]", text: "text-[#d1d0c5]", line: "bg-[#88a879]" },
    WARNING: { ring: "border-[#c8954f]/35", text: "text-[#d2b37e]", line: "bg-[#c8954f]" },
    CRITICAL: { ring: "border-[#b95045]/40", text: "text-[#dc9a90]", line: "bg-[#b95045]" },
    OFFLINE: { ring: "border-white/[.08]", text: "text-[#8d9496]", line: "bg-[#545b61]" },
    NOT_CONFIGURED: { ring: "border-white/[.08]", text: "text-[#8d9496]", line: "bg-[#545b61]" },
  };

  const [dynamicTrend, setDynamicTrend] = useState<"RISING" | "STABLE" | "FALLING" | "TRENDING_TOWARD_CRITICAL" | "INSUFFICIENT_DATA" | "LOADING">("LOADING");
  const [dynamicPredicted, setDynamicPredicted] = useState<number | null>(null);

  useEffect(() => {
    if (!zone.online) return;
    fetch(`/api/v1/trends/${zone.code}`).then(r => r.json()).then(d => {
       if (d.trend?.status) setDynamicTrend(d.trend.status);
    }).catch(console.error);
    fetch(`/api/v1/predictions/${zone.code}`).then(r => r.json()).then(d => {
       if (d.prediction?.probability !== undefined) {
         setDynamicPredicted(Math.round(d.prediction.probability * 100));
       }
    }).catch(console.error);
  }, [zone.code, zone.risk, zone.online]);

  return (
    <button
      onClick={() => nav(`/zones/${zone.id}`)}
      className={`${shell} group w-full rounded-2xl p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-white/[.16] hover:bg-white/[.025] ${isCritical ? "ring-1 ring-[#b95045]/20" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[.08] bg-white/[.04] text-[#d6ddd8] transition group-hover:bg-white/[.07]">
            <Icon size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-5 text-[#f7f8f4]">{zone.name}</p>
            <p className={`${data} mt-1 text-[10px] tracking-[.1em] text-[#c1cac8]`}>{zone.code}</p>
          </div>
        </div>
        <StatusBadge status={zone.status} compact />
      </div>

      <div className="mt-5 rounded-xl border border-white/[.07] bg-black/[.12] p-3.5">
        <div className="flex items-center gap-3.5">
          <RiskRing value={zone.risk} status={zone.status} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`${data} text-[11px] text-[#f3f6f3]`}>LIVE RISK</span>
              <span className={`${data} numeric-emphasis shrink-0 text-[13px] font-semibold ${statusStyles[zone.status].text}`}>
                {zone.online ? `${zone.risk}/100` : "UNAVAILABLE"}
              </span>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[.08]">
              <div className={`h-full rounded-full ${statusStyles[zone.status].line}`} style={{ width: `${zone.risk}%` }} />
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[.06] pt-2.5">
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-[#c1cac8]">
            <span className={`size-1.5 shrink-0 rounded-full ${zone.online ? "bg-[#88a879]" : "bg-[#69727c]"}`} />
            <span className="truncate">{telemetryState}</span>
          </span>
          <span className={`${data} shrink-0 text-[10px] text-[#c1cac8]`}>{zone.updated}</span>
        </div>
      </div>

      <div className="mt-4">
        <div className={`${data} mb-2 text-[10px] tracking-[.13em] text-[#d7dfdb]`}>SENSOR SNAPSHOT</div>
        <div className="grid grid-cols-2 gap-2">
          <Reading icon={<Flame size={12} />} label="FIRE" value={zone.fire} />
          <Reading icon={<Waves size={12} />} label="GAS" value={zone.gas} />
          <Reading icon={<Droplets size={12} />} label="WATER" value={zone.water} />
          <Reading icon={<Users size={12} />} label="OCCUPANCY" value={String(zone.occupancy)} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[.065] pt-3">
        <span className={`${data} text-[10px] tracking-[.08em] text-[#d0d9d5]`}>
          FORECAST <b className="numeric-emphasis ml-1 text-[12px] text-[#f3f6f3]">{dynamicPredicted ?? "—"}</b>
        </span>
        <span className={`flex shrink-0 items-center gap-1 ${data} text-[10px] tracking-[.08em] ${dynamicTrend.includes("RISING") ? "text-[#d8ae71]" : "text-[#899b84]"}`}>
          <span>{dynamicTrend.includes("RISING") ? "↗" : dynamicTrend === "FALLING" ? "↘" : dynamicTrend === "INSUFFICIENT_DATA" ? "?" : "→"}</span>
          {dynamicTrend.includes("RISING") ? "TRENDING UP" : dynamicTrend.replace(/_/g, " ")}
        </span>
      </div>
    </button>
  );
}

function Reading({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[.06] bg-white/[.025] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[#c6cfcd]">
        {icon}
        <p className={`${data} text-[10px] tracking-[.09em] text-[#f3f6f3]`}>{label}</p>
      </div>
      <p className="numeric-emphasis mt-1.5 truncate text-[12px] font-medium text-[#e4e9e5]">{value}</p>
    </div>
  );
}

function Dashboard() {
  const { zones } = useMappedData();
  const { reportNote, priorityQueue } = useRobofusion();
  const [note, setNote] = useState("");
  const [interpretation, setInterpretation] = useState<string | null>(null);
  
  const critical = zones.filter((z) => z.status === "CRITICAL");
  const linkedCount = zones.filter(z => z.online).length;

  return <div>
    <PageIntro eyebrow="LIVE COMMAND POSTURE" title="Laboratory response overview" action={<button onClick={() => document.getElementById("note")?.focus()} className="flex items-center gap-2 rounded-xl border border-[#c8954f]/25 bg-[#c8954f]/[.08] px-3 py-2.5 text-[13px] text-[#dfba7c] transition hover:bg-[#c8954f]/[.14]"><Sparkles size={14}/> Report observation</button>}>
      {critical.length > 0 ? `${critical.length} critical zone${critical.length > 1 ? "s require" : " requires"} immediate assessment. Telemetry refreshes every 5 seconds.` : "All zones operating within normal parameters. Telemetry refreshes every 5 seconds."}
    </PageIntro>
    
    {critical.length > 0 ? (
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[#b95045]/35 bg-[#b95045]/[.12] px-4 py-3.5">
        <ShieldAlert className="shrink-0 text-[#df9083]" size={18}/>
        <p className="text-[14px] text-[#e6b4aa]">
          <b>Critical response posture.</b> {critical.map(z => z.name).join(" and ")} active {critical.length > 1 ? "anomalies" : "anomaly"}.
        </p>
        <NavLink to="/priority" className="ml-auto hidden shrink-0 items-center gap-1 text-[13px] text-[#efc1b8] hover:text-white sm:flex">Open ranked queue <ChevronRight size={14}/></NavLink>
      </div>
    ) : (
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[#88a879]/35 bg-[#88a879]/[.12] px-4 py-3.5">
        <ShieldCheck className="shrink-0 text-[#a0c291]" size={18}/>
        <p className="text-[14px] text-[#c0d6b5]">
          <b>All systems secure.</b> No immediate life-safety hazards detected across active zones.
        </p>
      </div>
    )}

    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[17px] font-medium">Live zone map</h2>
          <p className="mt-1 text-[12px] text-[#7f8789]">Current score is separate from forecast and trend indicators.</p>
        </div>
        <span className={`${data} flex items-center gap-1.5 text-[12px] text-[#8da487]`}><Radio size={12}/>{zones.length} ZONES · {linkedCount} LINKED</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{zones.map((zone) => <ZoneCard key={zone.id} zone={zone}/>)}</div>
    </section>

    {critical.length > 1 && <section className="mt-7"><div className="mb-3 flex items-end justify-between"><div><h2 className="text-[17px] font-medium">Priority queue</h2><p className="mt-1 text-[12px] text-[#7f8789]">Ranked by live risk, life-safety signal, occupancy, and time active.</p></div><NavLink to="/priority" className="text-[13px] text-[#cbbd9f] hover:text-white">Full queue</NavLink></div><div className="grid gap-3 lg:grid-cols-2">{priorityQueue.slice(0, 2).map((item: any, index: number) => <PriorityCard key={item.incident_id} item={item} rank={index + 1}/>)}</div></section>}
    <section className={`${shell} mt-7 rounded-2xl p-4 sm:p-5`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className={`${data} text-[12px] tracking-[.14em] text-[#c8954f]`}>NATURAL-LANGUAGE INCIDENT INPUT</p><p className="mt-1 text-[13px] text-[#92999a]">Notes are parsed for confirmation before they can affect queue ranking.</p></div>{interpretation && <span className="rounded-lg border border-[#88a879]/25 bg-[#88a879]/[.09] px-2.5 py-1.5 text-[12px] text-[#b7cfaf]">Understood: {interpretation}</span>}</div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. smell of gas near the IoT Lab bench" className="min-w-0 flex-1 rounded-xl border border-white/[.1] bg-[#0e1011] px-3.5 py-3 text-[14px] outline-none placeholder:text-[#626a6e] focus:border-[#c8954f]/60"/><button onClick={() => { if (!note) { setInterpretation("enter an observation first"); return; } reportNote(note).then(res => setInterpretation(res.message || "")); }} className="rounded-xl border border-white/[.1] px-4 py-3 text-[13px] text-[#c5c6bf] hover:bg-white/[.06]">Confirm interpretation</button></div></section>
  </div>; 
}
function PriorityCard({ item, rank }: { item: any; rank: number }) {
  const nav = useNavigate();
  const isTopPriority = rank === 1;
  const rationale = item.ranking_reason;

  return (
    <article className={`${shell} rounded-2xl p-5 ${isTopPriority ? "border-[#b95045]/35 ring-1 ring-[#b95045]/10" : ""}`}>
      <div className="flex gap-4 sm:gap-5">
        <div className="flex shrink-0 flex-col items-center">
          <span className={`${data} grid size-11 place-items-center rounded-xl text-[14px] font-semibold ${isTopPriority ? "bg-[#b95045]/18 text-[#f0a79b] ring-1 ring-[#b95045]/30" : "bg-[#c8954f]/12 text-[#efc987] ring-1 ring-[#c8954f]/22"}`}>
            0{rank}
          </span>
          <span className={`mt-2 h-full min-h-8 w-px ${isTopPriority ? "bg-[#b95045]/30" : "bg-[#c8954f]/22"}`} />
        </div>

        <div className="min-w-0 flex-1 pb-0.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`${data} text-[10px] tracking-[.14em] text-[#d7dfdb]`}>RESPONSE PRIORITY · {String(rank).padStart(2, "0")}</p>
              <h3 className="mt-1.5 text-[17px] font-semibold text-[#f7f8f4]">{item.zone_name}</h3>
              <p className="mt-1 text-[13px] leading-5 text-[#d2dad6]">{item.primary_hazard}</p>
            </div>
            <StatusBadge status={item.status} compact />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Metric label="LIVE RISK" value={`${item.risk_score}/100`} highlight={isTopPriority} />
            <Metric label="OCCUPANCY" value={item.occupancy ? "Present" : "Clear"} />
            <Metric label="TIME ACTIVE" value={`${Math.round(item.critical_duration_seconds / 60)} min`} />
          </div>

          <div className={`mt-4 rounded-xl border p-3.5 ${isTopPriority ? "border-[#b95045]/18 bg-[#b95045]/[.055]" : "border-white/[.07] bg-white/[.025]"}`}>
            <p className={`${data} text-[10px] tracking-[.12em] ${isTopPriority ? "text-[#f0a79b]" : "text-[#d7dfdb]"}`}>WHY THIS IS RANKED #{rank}</p>
            <p className="mt-1.5 text-[13px] leading-5 text-[#d9dfdb]">{rationale}</p>
          </div>

          <button
            onClick={() => nav(`/zones/${item.zone_id}`)}
            className="mt-4 flex items-center gap-1.5 text-[13px] font-medium text-[#efc987] transition hover:text-white"
          >
            Open live zone details <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${highlight ? "border-[#b95045]/22 bg-[#b95045]/[.06]" : "border-white/[.065] bg-black/[.10]"}`}>
      <p className={`${data} text-[10px] tracking-[.1em] text-[#d7dfdb]`}>{label}</p>
      <p className={`numeric-emphasis mt-1.5 text-[14px] font-semibold ${highlight ? "text-[#f0a79b]" : "text-[#f3f6f3]"}`}>{value}</p>
    </div>
  );
}

function PriorityQueue() { const { priorityQueue } = useRobofusion(); return <div><PageIntro eyebrow="MULTI-ZONE ESCALATION" title="Priority response queue">Two CRITICAL zones are ranked using transparent operational criteria.</PageIntro><div className="space-y-3">{priorityQueue.map((item, i) => <PriorityCard item={item} rank={i+1} key={item.incident_id}/>)}</div><div className={`${shell} mt-5 rounded-2xl p-5`}><p className={`${data} text-[12px] tracking-[.14em] text-[#89918f]`}>RANKING METHOD</p><div className="mt-3 grid gap-3 sm:grid-cols-4">{[["01", "Life safety", "Fire, gas and occupancy"],["02", "Live risk", "Current safety score"],["03", "Escalation", "Score velocity and forecast"],["04", "Elapsed time", "Time without recovery"]].map(([n,t,c]) => <div key={n} className="border-l border-[#c8954f]/35 pl-3"><p className={`${data} text-[12px] text-[#d2b37e]`}>{n}</p><p className="mt-2 text-[13px] font-medium">{t}</p><p className="mt-1 text-[12px] text-[#777f83]">{c}</p></div>)}</div></div></div>; }

function ZoneDetails() { 
  const { zones, incidents } = useMappedData(); 
  const { acknowledgeIncident, toggleOverride, user } = useRobofusion(); 
  const { id = "server" } = useParams(); 
  const nav = useNavigate(); 
  const zone = zones.find((z) => z.id === id) ?? zones[0]; 
  const [ack, setAck] = useState(false); 
  const [override, setOverride] = useState(false); 
  const role = user?.role === "ADMIN" ? "Admin" : "Security Staff"; 
  const activeIncident = incidents.find(i => i.zoneId === zone.id && i.status !== "RESOLVED"); 
  const icon = zone.icon; 
  const Icon = icon; 
  
  const [timeline, setTimeline] = useState<any[]>([]);
  useEffect(() => {
    if (activeIncident) {
      fetch(`/api/v1/incidents/${activeIncident.id}/timeline`)
        .then(r => r.json())
        .then(d => setTimeline(d.events || []))
        .catch(console.error);
    } else {
      setTimeline([]);
    }
  }, [activeIncident?.id]);

  return <div><button onClick={() => nav(-1)} className="mb-5 flex items-center gap-1 text-[13px] text-[#939a9a] hover:text-white">‹ Back to command view</button><PageIntro eyebrow={`${zone.code} · ZONE DETAILS`} title={zone.name} action={<StatusBadge status={zone.status}/>}>Last telemetry update {zone.updated} · {zone.online ? "Secure gateway online" : "Gateway unavailable — data may be stale"}</PageIntro><div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]"><section className={`${shell} rounded-2xl p-5`}><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-xl border border-white/[.08] bg-white/[.04] text-[#d0d0c9]"><Icon size={22}/></span><div><p className={`${data} text-[12px] text-[#858d8e]`}>CURRENT LIVE RISK</p><p className="numeric-emphasis mt-1 text-3xl font-medium tracking-[-.04em]">{zone.online ? zone.risk : "—"}<span className="ml-1 text-sm text-[#7d8588]">/100</span></p></div><div className="ml-auto"><RiskRing value={zone.risk} status={zone.status}/></div></div><div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4"><Sensor icon={<Flame size={15}/>} label="FIRE" value={zone.fire}/><Sensor icon={<Waves size={15}/>} label="GAS" value={zone.gas}/><Sensor icon={<Droplets size={15}/>} label="WATER" value={zone.water}/><Sensor icon={<Users size={15}/>} label="PIR / OCC" value={`${zone.occupancy} detected`}/></div><div className="mt-5 rounded-xl border border-white/[.07] bg-black/[.13] p-4"><div className="flex justify-between"><p className={`${data} text-[11px] text-[#7d8588]`}>SENSOR HEALTH</p><span className={`flex items-center gap-1 text-[12px] ${zone.online ? "text-[#afc8a6]" : "text-[#a2aab0]"}`}>{zone.online ? <Wifi size={12}/> : <WifiOff size={12}/>}{zone.online ? "4/4 sensors reporting" : "0/4 sensors reporting"}</span></div><div className="mt-3 flex gap-1.5">{["Fire", "Gas", "Water", "PIR"].map((s) => <span key={s} className={`rounded-lg px-2 py-1 text-[11px] ${zone.online ? "bg-[#88a879]/[.1] text-[#b7ccaf]" : "bg-white/[.06] text-[#899196]"}`}>{s}</span>)}</div></div><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => { if(activeIncident) { acknowledgeIncident(activeIncident.id).then(ok => ok && setAck(true)) } else { setAck(true) } }} disabled={ack || !activeIncident} className={`rounded-xl px-4 py-2.5 text-[13px] font-medium transition ${ack ? "bg-[#88a879]/20 text-[#b8cfaf]" : "bg-[#d6d1c5] text-[#1b1c1a] hover:bg-[#eeeae0]"}`}>{ack ? <span className="flex items-center gap-1"><Check size={13}/> Alert acknowledged</span> : "Acknowledge incident"}</button>{role === "Admin" && <button onClick={() => { toggleOverride(zone.code, override ? "CLEAR" : "SILENCE").then(ok => ok && setOverride(!override)) }} className={`rounded-xl border px-4 py-2.5 text-[13px] transition ${override ? "border-[#b95045]/50 bg-[#b95045]/15 text-[#e4a49b]" : "border-[#b95045]/30 text-[#dc9a90] hover:bg-[#b95045]/10"}`}><ShieldAlert className="mr-1 inline" size={13}/>{override ? "Override armed" : "Manual override"}</button>}</div>{role !== "Admin" && <p className="mt-3 text-[12px] text-[#777f83]">Manual override restricted to Admin role.</p>}</section><section className={`${shell} rounded-2xl p-5`}><p className={`${data} text-[12px] tracking-[.14em] text-[#89918f]`}>ZONE HISTORY</p><div className="mt-5 space-y-0">{timeline.length ? timeline.map((event, i) => <div key={event.id} className="relative flex gap-3 pb-5 last:pb-0"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${i === 0 ? "bg-[#b95045] shadow-[0_0_0_4px_rgba(185,80,69,.13)]" : i === 1 ? "bg-[#c8954f]" : "bg-[#88a879]"}`}/>{i < timeline.length - 1 && <span className="absolute left-[3px] top-5 h-[calc(100%-8px)] w-px bg-white/[.09]"/>}<div className="flex-1"><div className="flex justify-between"><span className={`${data} text-[12px] text-[#c6c8c0]`}>{event.type}</span><span className={`${data} text-[11px] text-[#70787c]`}>{new Date(event.timestamp).toLocaleTimeString()}</span></div><p className="mt-1 text-[12px] text-[#858d8e]">{event.description || JSON.stringify(event.payload)}</p></div></div>) : <p className="text-[13px] text-[#70787c]">No active incident timeline events found.</p>}</div></section></div></div>; }
function Sensor({icon,label,value}:{icon:ReactNode;label:string;value:string}){return <div className="rounded-xl border border-white/[.065] bg-white/[.025] p-3"><span className="text-[#a7aaa3]">{icon}</span><p className={`${data} mt-3 text-[10px] text-[#71797c]`}>{label}</p><p className="numeric-emphasis mt-1 text-[13px] text-[#d4d3cd]">{value}</p></div>;}

function Incidents() { const { incidents, zones } = useMappedData(); const navigate = useNavigate(); const [filters, setFilters] = useState({ zone: "All zones", hazard: "All hazards", status: "All statuses" }); const filtered = useMemo(() => incidents.filter(i => (filters.zone === "All zones" || i.zone === filters.zone) && (filters.hazard === "All hazards" || i.hazard === filters.hazard) && (filters.status === "All statuses" || i.status === filters.status)), [filters, incidents]); return <div><PageIntro eyebrow="TIMELINE & HISTORY" title="Incident register" action={<div className="flex items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.025] px-3 py-2 text-[13px] text-[#8d9496]"><Search size={14}/> Search incident</div>}>Review active and resolved incidents with a complete trigger → acknowledgement → recovery trail.</PageIntro><div className={`${shell} rounded-2xl overflow-hidden`}><div className="flex flex-wrap gap-2 border-b border-white/[.065] p-3"><select className="rounded-lg border border-white/[.08] bg-[#121713] px-2.5 py-2 text-[12px] text-[#c5c6c0] outline-none"><option>DATE · Last 24 hours</option><option>DATE · Last 7 days</option></select>{[["zone", ["All zones", ...zones.map(z=>z.name)]],["hazard", ["All hazards", ...Array.from(new Set(incidents.map(i=>i.hazard)))]],["status", ["All statuses", "CRITICAL", "WARNING", "RESOLVED"]]].map(([key, values]) => <select key={key as string} value={filters[key as keyof typeof filters]} onChange={e=>setFilters({...filters,[key as string]:e.target.value})} className="rounded-lg border border-white/[.08] bg-[#121713] px-2.5 py-2 text-[12px] text-[#c5c6c0] outline-none">{(values as string[]).map(v=><option key={v}>{v}</option>)}</select>)}</div><div className="overflow-x-auto"><table className="min-w-[920px] w-full text-left"><thead className="border-b border-white/[.065] bg-white/[.018]"><tr>{["INCIDENT ID", "ZONE", "HAZARD", "TRIGGER TIME", "ACKNOWLEDGED BY", "RESOLVED", "DURATION", "STATUS"].map(h=><th key={h} className={`${data} px-4 py-3 text-[11px] font-medium text-[#737b7e]`}>{h}</th>)}</tr></thead><tbody>{filtered.length ? filtered.map((i) => <tr key={i.id} onClick={() => navigate(`/incidents/${i.id}`)} className="cursor-pointer border-b border-white/[.055] transition hover:bg-white/[.035]"><td className={`${data} numeric-emphasis px-4 py-4 text-[12px] text-[#d8bb85]`}>{i.id}</td><td className="px-4 py-4 text-[13px] font-medium">{i.zone}</td><td className="px-4 py-4 text-[13px] text-[#a8adab]">{i.hazard}</td><td className={`${data} px-4 py-4 text-[11px] text-[#969d9e]`}>{i.trigger}</td><td className="px-4 py-4 text-[12px] text-[#aeb2af]">{i.acknowledged}</td><td className={`${data} px-4 py-4 text-[11px] text-[#858d8e]`}>{i.resolved}</td><td className={`${data} numeric-emphasis px-4 py-4 text-[11px] text-[#b4b7b0]`}>{i.duration}</td><td className="px-4 py-4">{i.status === "RESOLVED" ? <span className="text-[12px] text-[#b4cdaa]">✓ RESOLVED</span> : <StatusBadge status={i.status as Status} compact/>}</td></tr>) : <tr><td colSpan={8} className="px-5 py-16 text-center text-[13px] text-[#7d8588]"><CircleX className="mx-auto mb-2" size={19}/>No incidents match the selected filters.</td></tr>}</tbody></table></div></div></div>; }
function IncidentDetails() { const { incidents } = useMappedData(); const { incidentId } = useParams(); const nav = useNavigate(); const incident = incidents.find(i=>i.id === incidentId) ?? incidents[0]; const active = incident.status !== "RESOLVED"; return <div><button onClick={() => nav("/incidents")} className="mb-5 flex items-center gap-1 text-[13px] text-[#939a9a] hover:text-white">‹ Back to incident register</button><PageIntro eyebrow={`${incident.id} · INCIDENT TIMELINE`} title={incident.hazard} action={active ? <StatusBadge status={incident.status as Status}/> : <span className="text-[13px] text-[#b4cdaa]">✓ RESOLVED</span>}>{incident.zone} · Triggered {incident.trigger}</PageIntro><div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]"><section className={`${shell} rounded-2xl p-5`}><p className={`${data} text-[12px] tracking-[.14em] text-[#89918f]`}>INCIDENT SUMMARY</p><div className="mt-5 space-y-4">{[["Zone",incident.zone],["Hazard",incident.hazard],["Triggered",incident.trigger],["Acknowledged",incident.acknowledged],["Resolved",incident.resolved],["Duration",incident.duration]].map(([l,v])=><div className="flex justify-between gap-4 border-b border-white/[.06] pb-3" key={l}><span className="text-[12px] text-[#767e82]">{l}</span><span className="text-right text-[13px] text-[#d2d2cc]">{v}</span></div>)}</div>{active && <button onClick={() => nav(`/zones/${incident.zoneId}`)} className="mt-5 w-full rounded-xl bg-[#d6d1c5] py-3 text-[13px] font-medium text-[#10120f]">Open live zone details</button>}</section><section className={`${shell} rounded-2xl p-5`}><p className={`${data} text-[12px] tracking-[.14em] text-[#89918f]`}>EVENT TRAIL</p><div className="mt-6 space-y-0">{[[incident.trigger,"TRIGGER",`${incident.hazard} detected in ${incident.zone}`],[incident.acknowledged.split(" · ")[1] || "—","ACKNOWLEDGEMENT",incident.acknowledged === "Unassigned" ? "Awaiting operator acknowledgement" : `Acknowledged by ${incident.acknowledged.split(" · ")[0]}`],[incident.resolved,"RECOVERY",incident.resolved === "—" ? "Recovery has not yet been verified" : "All readings returned to safe operating envelope"]].map(([time, phase, description], i) => <div key={String(phase)} className="relative flex gap-4 pb-7 last:pb-0"><span className={`mt-1.5 grid size-6 shrink-0 place-items-center rounded-full ${i === 0 ? "bg-[#b95045]/20 text-[#df8f82]" : i === 1 ? "bg-[#c8954f]/15 text-[#dfba7c]" : incident.resolved === "—" ? "bg-white/[.06] text-[#7b8386]" : "bg-[#88a879]/15 text-[#b3caaa]"}`}>{i === 0 ? <AlertTriangle size={13}/> : i === 1 ? <UserRound size={13}/> : <Check size={13}/>}</span>{i<2 && <span className="absolute left-3 top-8 h-[calc(100%-14px)] w-px bg-white/[.09]"/>}<div><p className={`${data} text-[11px] text-[#dfba7c]`}>{phase} <span className="ml-2 text-[#727a7d]">{time}</span></p><p className="mt-1 text-[13px] text-[#c6c8c1]">{description}</p></div></div>)}</div></section></div></div>; }

function AlertCenter({ close }: { close: () => void }) { const { incidents } = useMappedData(); const { acknowledgeIncident } = useRobofusion(); const nav = useNavigate(); const [ack, setAck] = useState<string[]>([]); const active = incidents.filter(i=>i.status !== "RESOLVED"); return <div className="fixed inset-y-0 right-0 z-[60] w-full max-w-[430px] border-l border-white/[.08] bg-[#121713]/98 p-5 shadow-2xl backdrop-blur-2xl"><div className="flex items-center justify-between"><div><p className={`${data} text-[12px] tracking-[.15em] text-[#c8954f]`}>ACTIVE ALERTS</p><h2 className="mt-1 text-[22px] font-medium">Notification center</h2></div><IconButton label="Close notifications" onClick={close}><X size={17}/></IconButton></div><div className="mt-5 space-y-3">{active.map((alert) => { const isAck = ack.includes(alert.id); return <article key={alert.id} className={`rounded-2xl border p-4 ${isAck ? "border-white/[.07] bg-white/[.025] opacity-60" : alert.status === "CRITICAL" ? "border-[#b95045]/30 bg-[#b95045]/[.09]" : "border-[#c8954f]/25 bg-[#c8954f]/[.07]"}`}><div className="flex items-start gap-3"><span className={`mt-0.5 ${alert.status === "CRITICAL" ? "text-[#dc8a7d]" : "text-[#dbb06d]"}`}>{alert.status === "CRITICAL" ? <ShieldAlert size={17}/> : <AlertTriangle size={17}/>}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="text-[14px] font-medium">{alert.zone}</p><StatusBadge status={alert.status as Status} compact/></div><p className="mt-1 text-[12px] text-[#b1b4ad]">{alert.hazard}</p><p className={`${data} mt-2 text-[11px] text-[#7f8789]`}>TRIGGERED {alert.trigger}</p></div></div><div className="mt-3 flex gap-2"><button onClick={() => acknowledgeIncident(alert.id).then(ok => ok && setAck([...ack, alert.id]))} disabled={isAck} className="rounded-lg border border-white/[.09] px-2.5 py-1.5 text-[12px] text-[#d1d0ca] hover:bg-white/[.07] disabled:text-[#91aa88]">{isAck ? "Acknowledged" : "Acknowledge"}</button><button onClick={() => { close(); nav(`/incidents/${alert.id}`); }} className="text-[12px] text-[#dfba7c] hover:text-white">View incident →</button></div></article>})}</div><div className="mt-5 rounded-xl border border-[#88a879]/20 bg-[#88a879]/[.07] p-3 text-[12px] leading-4 text-[#b4c7ac]"><Wifi className="mr-1 inline" size={12}/>Reconnect protection is enabled. Any missed state changes will surface individually after synchronization.</div></div>; }
function NotFound() { return <div className="py-24 text-center"><CircleAlert className="mx-auto text-[#c8954f]"/><p className="mt-3 text-sm">This command view is unavailable.</p><NavLink to="/" className="mt-4 inline-block text-[14px] text-[#dfba7c]">Return to live map</NavLink></div>; }

function ToastContainer() {
  const { notifications, removeNotification } = useRobofusion();
  if (notifications.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {notifications.map((notif) => {
        const isErr = notif.type === "error";
        const isSuccess = notif.type === "success";
        
        const errClasses = "border-[#b95045]/30 bg-[#2b1e1e]/95 text-[#f0a79b] [.theme-light_&]:border-[#FCA5A5] [.theme-light_&]:bg-[#FEF2F2]/95 [.theme-light_&]:text-[#B91C1C]";
        const successClasses = "border-[#88a879]/30 bg-[#1e2b20]/95 text-[#b7cfaf] [.theme-light_&]:border-[#86EFAC] [.theme-light_&]:bg-[#F0FDF4]/95 [.theme-light_&]:text-[#166534]";
        const infoClasses = "border-[#c8954f]/30 bg-[#282116]/95 text-[#e0c79f] [.theme-light_&]:border-[#FDE047] [.theme-light_&]:bg-[#FEFCE8]/95 [.theme-light_&]:text-[#854D0E]";
        
        return (
          <div key={notif.id} className={`flex w-[320px] items-start gap-3 rounded-xl border p-4 shadow-2xl backdrop-blur-xl transition-all ${isErr ? errClasses : isSuccess ? successClasses : infoClasses}`}>
            <span className="mt-0.5 shrink-0">{isErr ? <CircleX size={16}/> : isSuccess ? <Check size={16}/> : <CircleAlert size={16}/>}</span>
            <p className="flex-1 text-[13px] leading-5">{notif.message}</p>
            <button onClick={() => removeNotification(notif.id)} className="shrink-0 opacity-50 hover:opacity-100"><X size={14}/></button>
          </div>
        );
      })}
    </div>
  );
}

function Root() {
  return (
    <RobofusionProvider>
      <Outlet />
      <ToastContainer />
    </RobofusionProvider>
  );
}

export const router = typeof window === "undefined" ? undefined : createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/login", Component: Login },
      { path: "/", Component: AppShell, children: [
        { index: true, Component: Dashboard }, { path: "priority", Component: PriorityQueue }, { path: "zones/:id", Component: ZoneDetails }, { path: "incidents", Component: Incidents }, { path: "incidents/:incidentId", Component: IncidentDetails }, { path: "*", Component: NotFound },
      ]}
    ]
  }
]);
