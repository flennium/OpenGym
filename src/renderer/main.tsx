// @ts-nocheck -- renderer records are validated at the IPC boundary.
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Activity,
  Archive,
  CalendarClock,
  Camera,
  CreditCard,
  FileText,
  Dumbbell,
  Download,
  HardDriveDownload,
  LogOut,
  Menu,
  Moon,
  History,
  Play,
  Plus,
  RefreshCw,
  Search,
  ScanLine,
  ScrollText,
  Settings,
  ShieldCheck,
  Snowflake,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import appLogo from "../../logo.png";
import { Badge, DataToolbar, Field, Modal, Page, SelectField, Stat, Table } from "./components/ui";
import "./styles.css";
const api = async (channel: string, payload?: unknown) => {
  const r = await window.openGym.invoke(channel, payload);
  if (!r.ok) {
    window.dispatchEvent(
      new CustomEvent("opengym:error", { detail: r.error.message }),
    );
    throw new Error(r.error.message);
  }
  return r.data;
};
const notifySuccess = (message: string) =>
  window.dispatchEvent(new CustomEvent("opengym:success", { detail: message }));
type ConfirmationRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  requiresPin?: boolean;
  phrase?: string;
  resolve: (confirmed: boolean, credential?: string) => void;
};
const confirmAction = (
  request: Omit<ConfirmationRequest, "resolve">,
): Promise<boolean> =>
  new Promise((resolve) =>
    window.dispatchEvent(
      new CustomEvent("opengym:confirm", {
        detail: { ...request, resolve } satisfies ConfirmationRequest,
      }),
    ),
  );
const confirmWithPin = (
  request: Omit<ConfirmationRequest, "resolve" | "requiresPin">,
): Promise<string | null> =>
  new Promise((resolve) =>
    window.dispatchEvent(new CustomEvent("opengym:confirm", {
      detail: { ...request, requiresPin: true, resolve: (confirmed: boolean, pin?: string) => resolve(confirmed ? pin || null : null) } satisfies ConfirmationRequest,
    })),
  );
type Screen =
  | "Dashboard"
  | "Members"
  | "Plans"
  | "Memberships"
  | "Attendance"
  | "Kiosk"
  | "Payments"
  | "Staff"
  | "Reports"
  | "Audit Log"
  | "Settings"
  | "Backup";
const themes = {
  Pulse: { accent: "#a3cf24", accentInk: "#17202a", lightTint: "#eff7d7", darkTint: "#29351b", sidebar: "#17202a", sidebarHover: "#26343f" },
  Ocean: { accent: "#087f8c", accentInk: "#ffffff", lightTint: "#dceff1", darkTint: "#17363b", sidebar: "#102a31", sidebarHover: "#1a4149" },
  Ember: { accent: "#c45124", accentInk: "#ffffff", lightTint: "#f7e5de", darkTint: "#43271e", sidebar: "#2b1c18", sidebarHover: "#4a2d23" },
  Violet: { accent: "#7051bd", accentInk: "#ffffff", lightTint: "#ebe6f6", darkTint: "#302744", sidebar: "#211b31", sidebarHover: "#392e51" },
  Rose: { accent: "#b83e65", accentInk: "#ffffff", lightTint: "#f6e2e9", darkTint: "#40242f", sidebar: "#2c1b23", sidebarHover: "#482a37" },
  Gold: { accent: "#d2a117", accentInk: "#17202a", lightTint: "#f7efd5", darkTint: "#3c3219", sidebar: "#292419", sidebarHover: "#433a24" },
  Mint: { accent: "#147d5d", accentInk: "#ffffff", lightTint: "#def0e9", darkTint: "#18382f", sidebar: "#142a24", sidebarHover: "#20463b" },
  Sky: { accent: "#276db2", accentInk: "#ffffff", lightTint: "#e0ebf6", darkTint: "#1c3248", sidebar: "#172534", sidebarHover: "#243c53" },
  Coral: { accent: "#b84942", accentInk: "#ffffff", lightTint: "#f7e4e2", darkTint: "#412724", sidebar: "#2d1e1c", sidebarHover: "#4a302d" },
  Mono: { accent: "#59666e", accentInk: "#ffffff", lightTint: "#e7ebed", darkTint: "#2b3439", sidebar: "#1d252a", sidebarHover: "#303d44" },
} as const;
type ThemeName = keyof typeof themes;
function applyAppearance(theme: ThemeName, dark: boolean) {
  const token = themes[theme] || themes.Pulse;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.mode = dark ? "dark" : "light";
  root.style.setProperty("--accent", token.accent);
  root.style.setProperty("--accent-ink", token.accentInk);
  root.style.setProperty("--accent-tint", dark ? token.darkTint : token.lightTint);
  root.style.setProperty("--sidebar", token.sidebar);
  root.style.setProperty("--sidebar-hover", token.sidebarHover);
  const neutrals = dark
    ? { ink: "#F1F5F6", muted: "#A9B6BD", canvas: "#0D151B", surface: "#162129", raised: "#1E2B34", line: "#34444F" }
    : { ink: "#17222B", muted: "#65737C", canvas: "#F3F6F5", surface: "#FFFFFF", raised: "#EDF2F1", line: "#D7DFDD" };
  root.style.setProperty("--ink", neutrals.ink);
  root.style.setProperty("--muted", neutrals.muted);
  root.style.setProperty("--canvas", neutrals.canvas);
  root.style.setProperty("--surface", neutrals.surface);
  root.style.setProperty("--surface-raised", neutrals.raised);
  root.style.setProperty("--line", neutrals.line);
}
const money = (n: number, s: any) =>
  new Intl.NumberFormat(s?.locale || "en-US", {
    style: "currency",
    currency: s?.currency || "USD",
  }).format(n / 100);
const setupOptions = {
  locales: [
    // Algeria
    ["en-DZ", "English (Algeria)"],
    ["ar-DZ", "Arabic (Algeria)"],
    ["fr-DZ", "French (Algeria)"],

    // English
    ["en-US", "English (United States)"],
    ["en-GB", "English (United Kingdom)"],
    ["en-CA", "English (Canada)"],
    ["en-AU", "English (Australia)"],
    ["en-NZ", "English (New Zealand)"],
    ["en-IE", "English (Ireland)"],
    ["en-ZA", "English (South Africa)"],
    ["en-IN", "English (India)"],

    // French
    ["fr-FR", "French (France)"],
    ["fr-CA", "French (Canada)"],
    ["fr-BE", "French (Belgium)"],
    ["fr-CH", "French (Switzerland)"],

    // Arabic
    ["ar-SA", "Arabic (Saudi Arabia)"],
    ["ar-AE", "Arabic (United Arab Emirates)"],
    ["ar-EG", "Arabic (Egypt)"],
    ["ar-MA", "Arabic (Morocco)"],
    ["ar-TN", "Arabic (Tunisia)"],

    // European languages
    ["de-DE", "German (Germany)"],
    ["es-ES", "Spanish (Spain)"],
    ["it-IT", "Italian (Italy)"],
    ["pt-PT", "Portuguese (Portugal)"],
    ["pt-BR", "Portuguese (Brazil)"],
    ["nl-NL", "Dutch (Netherlands)"],
    ["pl-PL", "Polish (Poland)"],
    ["tr-TR", "Turkish (Turkey)"],
    ["ru-RU", "Russian (Russia)"],

    // Asian languages
    ["zh-CN", "Chinese (Simplified)"],
    ["zh-TW", "Chinese (Traditional)"],
    ["ja-JP", "Japanese (Japan)"],
    ["ko-KR", "Korean (South Korea)"],
    ["hi-IN", "Hindi (India)"],
  ],

  currencies: [
    ["DZD", "Algerian dinar (DZD)"],
    ["EUR", "Euro (EUR)"],
    ["USD", "US dollar (USD)"],
    ["GBP", "British pound (GBP)"],
    ["CAD", "Canadian dollar (CAD)"],
    ["AUD", "Australian dollar (AUD)"],
    ["NZD", "New Zealand dollar (NZD)"],
    ["CHF", "Swiss franc (CHF)"],
    ["JPY", "Japanese yen (JPY)"],
    ["CNY", "Chinese yuan (CNY)"],
    ["KRW", "South Korean won (KRW)"],
    ["INR", "Indian rupee (INR)"],
    ["AED", "UAE dirham (AED)"],
    ["SAR", "Saudi riyal (SAR)"],
    ["MAD", "Moroccan dirham (MAD)"],
    ["TND", "Tunisian dinar (TND)"],
    ["EGP", "Egyptian pound (EGP)"],
    ["TRY", "Turkish lira (TRY)"],
    ["RUB", "Russian ruble (RUB)"],
    ["BRL", "Brazilian real (BRL)"],
    ["MXN", "Mexican peso (MXN)"],
    ["ZAR", "South African rand (ZAR)"],
    ["SEK", "Swedish krona (SEK)"],
    ["NOK", "Norwegian krone (NOK)"],
    ["DKK", "Danish krone (DKK)"],
    ["PLN", "Polish złoty (PLN)"],
    ["CZK", "Czech koruna (CZK)"],
    ["SGD", "Singapore dollar (SGD)"],
    ["HKD", "Hong Kong dollar (HKD)"],
  ],

  timezones: [
    ["Africa/Algiers", "Algiers (UTC+1)"],
    ["Africa/Casablanca", "Casablanca"],
    ["Africa/Tunis", "Tunis"],
    ["Africa/Cairo", "Cairo"],
    ["Africa/Johannesburg", "Johannesburg"],
    ["Africa/Lagos", "Lagos"],

    ["Europe/Paris", "Paris"],
    ["Europe/London", "London"],
    ["Europe/Berlin", "Berlin"],
    ["Europe/Madrid", "Madrid"],
    ["Europe/Rome", "Rome"],
    ["Europe/Amsterdam", "Amsterdam"],
    ["Europe/Brussels", "Brussels"],
    ["Europe/Zurich", "Zurich"],
    ["Europe/Moscow", "Moscow"],
    ["Europe/Istanbul", "Istanbul"],
    ["Europe/Warsaw", "Warsaw"],

    ["America/New_York", "New York"],
    ["America/Chicago", "Chicago"],
    ["America/Denver", "Denver"],
    ["America/Los_Angeles", "Los Angeles"],
    ["America/Toronto", "Toronto"],
    ["America/Vancouver", "Vancouver"],
    ["America/Mexico_City", "Mexico City"],
    ["America/Sao_Paulo", "São Paulo"],

    ["Asia/Dubai", "Dubai"],
    ["Asia/Riyadh", "Riyadh"],
    ["Asia/Kolkata", "India"],
    ["Asia/Shanghai", "Shanghai"],
    ["Asia/Tokyo", "Tokyo"],
    ["Asia/Seoul", "Seoul"],
    ["Asia/Singapore", "Singapore"],
    ["Asia/Hong_Kong", "Hong Kong"],

    ["Australia/Sydney", "Sydney"],
    ["Australia/Melbourne", "Melbourne"],
    ["Pacific/Auckland", "Auckland"],
  ],
};

function ToastHost() {
  const [toast, setToast] = useState({ message: "", tone: "error" });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (tone: "error" | "success") => (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setToast({ message: detail, tone });
      clearTimeout(timer);
      timer = setTimeout(
        () => setToast((current) => ({ ...current, message: "" })),
        tone === "error" ? 5000 : 3000,
      );
    };
    const showError = show("error");
    const showSuccess = show("success");
    window.addEventListener("opengym:error", showError);
    window.addEventListener("opengym:success", showSuccess);
    return () => {
      window.removeEventListener("opengym:error", showError);
      window.removeEventListener("opengym:success", showSuccess);
      clearTimeout(timer);
    };
  }, []);
  if (!toast.message) return null;
  return (
    <div
      className={`toast ${toast.tone}`}
      role={toast.tone === "error" ? "alert" : "status"}
    >
      <span>{toast.message}</span>
      <button
        aria-label="Dismiss notification"
        onClick={() => setToast((current) => ({ ...current, message: "" }))}
      >
        Dismiss
      </button>
    </div>
  );
}
function ConfirmationHost() {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const [credential, setCredential] = useState("");
  useEffect(() => {
    const show = (event: Event) =>
      { setCredential(""); setRequest((event as CustomEvent<ConfirmationRequest>).detail); };
    window.addEventListener("opengym:confirm", show);
    return () => window.removeEventListener("opengym:confirm", show);
  }, []);
  if (!request) return null;
  const finish = (confirmed: boolean) => {
    request.resolve(confirmed, credential);
    setRequest(null);
  };
  return (
    <div className="confirmShade" onMouseDown={() => finish(false)}>
      <section
        className="confirmDialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && finish(false)}
      >
        <div className={`confirmMark ${request.tone || "default"}`}>!</div>
        <h2 id="confirm-title">{request.title}</h2>
        <p id="confirm-message">{request.message}</p>
        {request.requiresPin && <Field autoFocus label="Current PIN" aria-label="Current PIN" type="password" inputMode="numeric" maxLength={6} value={credential} onChange={(event: any) => setCredential(event.target.value.replace(/\D/g, "").slice(0, 6))} />}
        {request.phrase && <Field autoFocus label={`Type ${request.phrase} to continue`} value={credential} onChange={(event: any) => setCredential(event.target.value)} />}
        <footer>
          <button autoFocus={!request.requiresPin && !request.phrase} onClick={() => finish(false)}>
            Keep current
          </button>
          <button
            className={request.tone === "danger" ? "dangerAction" : "primary"}
            disabled={request.requiresPin ? !/^\d{6}$/.test(credential) : request.phrase ? credential !== request.phrase : false}
            onClick={() => finish(true)}
          >
            {request.confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <main className="fatalState">
          <img className="brandMark" src={appLogo} alt="OpenGym logo" />
          <h1>OpenGym needs to reload</h1>
          <p>{this.state.error.message}</p>
          <button className="primary" onClick={() => location.reload()}>
            Reload app
          </button>
        </main>
      );
    return this.props.children;
  }
}
const setupZ = z.object({
  gymName: z.string().min(2),
  ownerName: z.string().min(2),
  pin: z.string().regex(/^\d{6}$/),
  locale: z.string(),
  currency: z.string().length(3),
  timezone: z.string(),
});
function Setup({ done }: any) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(setupZ),
    defaultValues: {
      locale: ["en-DZ", "ar-DZ", "fr-DZ", "en-US", "en-GB", "fr-FR"].includes(navigator.language) ? navigator.language : "en-DZ",
      currency: "DZD",
      timezone: setupOptions.timezones.some(([value]) => value === Intl.DateTimeFormat().resolvedOptions().timeZone) ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Africa/Algiers",
    },
  });
  return (
    <main className="gate">
      <div className="brand">
        <img className="brandMark" src={appLogo} alt="OpenGym logo" />
        <b>OpenGym</b>
      </div>
      <section className="setup">
        <p className="kicker">Your gym, on this machine</p>
        <h1>Open the front desk.</h1>
        <p>
          Create the gym workspace and its first owner. Nothing leaves this
          computer.
        </p>
        <form
          onSubmit={handleSubmit(async (x) => {
            await api("setup:create", x);
            done();
          })}
        >
          <div className="grid2">
            <Field
              label="Gym name"
              {...register("gymName")}
              error={errors.gymName?.message}
            />
            <Field
              label="Owner name"
              {...register("ownerName")}
              error={errors.ownerName?.message}
            />
            <Field
              label="Six-digit PIN"
              type="password"
              inputMode="numeric"
              {...register("pin")}
              error={errors.pin?.message}
            />
            <SelectField label="Currency" {...register("currency")} error={errors.currency?.message}>
              {setupOptions.currencies.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectField>
            <SelectField label="Language and formatting" {...register("locale")}>
              {setupOptions.locales.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectField>
            <SelectField label="Timezone" {...register("timezone")}>
              {setupOptions.timezones.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectField>
          </div>
          <button className="primary" disabled={isSubmitting}>
            Create workspace
          </button>
        </form>
      </section>
    </main>
  );
}
function BrandMark({ branding, className = "" }: any) {
  return branding?.logoDataUrl ? (
    <img className={`brandMark ${className}`} src={branding.logoDataUrl} alt={`${branding.gymName} logo`} />
  ) : (
    <img className={`brandMark ${className}`} src={appLogo} alt="OpenGym logo" />
  );
}
function Login({ done, branding }: any) {
  const [staff, setStaff] = useState<any[]>([]),
    [id, setId] = useState(0),
    [pin, setPin] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    api("session:staff")
      .then((x: any) => { setStaff(x); setId(x[0]?.id || 0); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id) return setError("Choose a staff account.");
    if (!/^\d{6}$/.test(pin)) return setError("Enter your six-digit numeric PIN.");
    setSubmitting(true);
    setError("");
    try { await api("session:signIn", { staffId: id, pin }); done(); }
    catch (e: any) { setError(e.message); setPin(""); }
    finally { setSubmitting(false); }
  };
  const selected = staff.find((person) => person.id === id);
  return (
    <main className="loginGate">
      <section className="loginIdentity">
        <div className="loginBrand"><BrandMark branding={branding} /><span>{branding?.gymName || "OpenGym"}</span></div>
        <div className="loginMessage">
          <span className="deskStatus"><i /> Front desk ready</span>
          <h1>Your members are waiting.</h1>
          <p>Sign in securely to manage today’s visits, memberships, and payments.</p>
        </div>
        <small>Local workspace · Your data stays on this computer</small>
      </section>
      <section className="loginWorkspace">
        <form className="loginPanel" onSubmit={signIn} noValidate>
          <div className="loginShield"><ShieldCheck /></div>
          <div><h2>Staff sign in</h2><p>Choose your account and enter your PIN.</p></div>
          {loading ? <div className="loginLoading">Loading staff accounts…</div> : staff.length ? (
            <>
              <label><span>Staff account</span><select aria-label="Staff account" value={id} onChange={(e) => { setId(+e.target.value); setError(""); }}>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
              </select></label>
              {selected && <div className="selectedStaff"><span>{selected.name.slice(0, 1).toUpperCase()}</span><div><b>{selected.name}</b><small>{selected.role}</small></div></div>}
              <Field label="Six-digit PIN" aria-label="PIN" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} value={pin} onChange={(e: any) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} />
              {error && <div className="loginError" role="alert">{error}</div>}
              <button className="primary loginSubmit" disabled={submitting}>{submitting ? "Checking PIN…" : "Open front desk"}</button>
            </>
          ) : <div className="loginError" role="alert">{error || "No active staff accounts are available. Restore a backup or contact the gym owner."}</div>}
          <small className="loginHelp">Five incorrect attempts temporarily lock this account for 30 seconds.</small>
        </form>
      </section>
    </main>
  );
}
function MemberForm({ close, refresh, member }: any) {
  const [photoPreview, setPhotoPreview] = useState(member?.photoDataUrl || "");
  const [requirements, setRequirements] = useState<any[]>([]);
  const [documents, setDocuments] = useState<Record<number, any>>({});
  useEffect(() => { api("documents:requirements").then(setRequirements); }, []);
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: member
      ? {
          firstName: member.first_name,
          lastName: member.last_name,
          phone: member.phone || "",
          email: member.email || "",
          dateOfBirth: member.date_of_birth || "",
          gender: member.gender || "",
          address: member.address || "",
          emergencyName: member.emergency_name || "",
          emergencyPhone: member.emergency_phone || "",
          status: member.status,
          notes: member.notes || "",
          photoPath: member.photo_path || null,
        }
      : {
          firstName: "",
          lastName: "",
          phone: "",
          email: "",
          dateOfBirth: "",
          gender: "",
          address: "",
          emergencyName: "",
          emergencyPhone: "",
          status: "active",
          notes: "",
          photoPath: null,
        },
  });
  return (
    <Modal title={member ? "Edit member" : "Add member"} onClose={close}>
      <form
        onSubmit={handleSubmit(async (data) => {
          await api("members:save", { id: member?.id, data: { ...data, documents: Object.entries(documents).map(([requirementId, document]) => ({ requirementId: +requirementId, path: (document as any).path })) } });
          refresh();
          close();
          notifySuccess(member ? "Member updated." : "Member added.");
        })}
      >
        <div className="photoPicker">
          <div className="avatar">{photoPreview ? <img src={photoPreview} alt="Member preview" /> : watch("firstName")?.[0] || <Users />}</div>
          <div>
            <button
              type="button"
              onClick={async () => {
                const photo = await api("members:choosePhoto");
                if (photo) { setValue("photoPath", photo.path); setPhotoPreview(photo.dataUrl); }
              }}
            >
              Choose photo
            </button>
            <small>
              {watch("photoPath") ? "Photo selected" : "PNG, JPG, or WebP"}
            </small>
          </div>
        </div>
        {!!requirements.length && <section className="documentChecklist"><header><div><h3>Required documents</h3><p>Attach a scan, photo, or PDF for each item before saving this member.</p></div><FileText /></header>{requirements.map((requirement) => { const stored = member?.documents?.find((document: any) => document.requirementId === requirement.id); const selected = documents[requirement.id]; return <div className={selected || stored ? "complete" : ""} key={requirement.id}><span><b>{requirement.name}</b><small>{selected?.name || stored?.fileName || "Not attached"}</small></span><span className="documentActions">{stored && !selected && <button type="button" onClick={() => api("members:openDocument", { id: stored.id, memberId: member.id })}>Open</button>}<button type="button" onClick={async () => { const document = await api("members:chooseDocument"); if (document) setDocuments((current) => ({ ...current, [requirement.id]: document })); }}>{selected || stored ? "Replace" : "Attach file"}</button></span></div>; })}</section>}
        <div className="grid2">
          <Field required label="First name" {...register("firstName")} />
          <Field required label="Last name" {...register("lastName")} />
          <Field label="Phone" {...register("phone")} />
          <Field label="Email" type="email" {...register("email")} />
          <Field
            label="Date of birth"
            type="date"
            {...register("dateOfBirth")}
          />
          <Field label="Address" {...register("address")} />
          <label>
            <span>Gender</span>
            <select {...register("gender")}>
              <option value="">Not specified</option>
              <option>Female</option>
              <option>Male</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select {...register("status")}>
              <option>active</option>
              <option>inactive</option>
              <option>banned</option>
            </select>
          </label>
          <Field label="Emergency contact" {...register("emergencyName")} />
          <Field label="Emergency phone" {...register("emergencyPhone")} />
        </div>
        <label>
          <span>Notes</span>
          <textarea {...register("notes")} />
        </label>
        <footer>
          <button className="primary">Save member</button>
        </footer>
      </form>
    </Modal>
  );
}
function Members({ settings, user, can }: any) {
  const [rows, setRows] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [editing, setEditing] = useState<any>(null);
  const load = () => api("members:list", { search: "" }).then(setRows);
  useEffect(() => {
    void load();
  }, []);
  const visibleRows = rows.filter((member) => (!status || member.status === status) && [member.first_name,member.last_name,member.phone,member.email,member.member_code].some((value) => String(value || "").toLowerCase().includes(search.trim().toLowerCase())));
  return (
    <Page
      title="Members"
      action={
        <div className="headActions">
          <button onClick={() => api("export:csv", { module: "members" })}>
            Export CSV
          </button>
          {can("Members", "create") && (
            <button className="primary" onClick={() => setEditing({})}>
              <Plus />
              Add member
            </button>
          )}
        </div>
      }
    >
      <DataToolbar label="Search members" value={search} onChange={setSearch} placeholder="Name, phone, email, or chip ID" shown={visibleRows.length} total={rows.length} filters={[{ label: "Member status", value: status, onChange: setStatus, options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "banned", label: "Banned" }] }]} />
      <Table
        heads={["Member", "Chip ID", "Contact", "Status", "Membership ends", "Actions"]}
        rows={visibleRows.map((m) => [
          <b>
            {m.first_name} {m.last_name}
          </b>,
          <span className="memberCode">{m.member_code}</span>,
          m.phone || m.email || "—",
          <Badge text={m.status} />,
          m.membership_end || "No active membership",
          <div className="actions">
            {can("Members", "edit") && (
              <button onClick={async () => { const profile = await api("members:get", { id: m.id }); setEditing(profile.member); }}>Edit</button>
            )}
            {can("Members", "delete") && (
              <button
                onClick={async () => {
                  const authorizationPin = await confirmWithPin({
                      title: "Archive this member?",
                      message: `${m.first_name} ${m.last_name} will disappear from active lists. Enter your current PIN to authorize this action. Their history remains preserved.`,
                      confirmLabel: "Archive member",
                      tone: "danger",
                    });
                  if (authorizationPin) {
                    try { await api("members:archive", { id: m.id, authorizationPin }); } catch { return; }
                    await load();
                    notifySuccess("Member archived.");
                  }
                }}
              >
                Archive
              </button>
            )}
          </div>,
        ])}
      />
      {editing && (
        <MemberForm
          member={editing.id ? editing : null}
          close={() => setEditing(null)}
          refresh={load}
        />
      )}
    </Page>
  );
}
function PlanForm({ close, refresh, plan }: any) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: plan?.name || "",
      description: plan?.description || "",
      durationMonths: plan?.duration_months || "",
      trainingHours: plan?.training_minutes_limit == null ? "" : plan.training_minutes_limit / 60,
      price: plan ? plan.price_minor / 100 : 0,
    },
  });
  return (
    <Modal title={plan ? "Edit membership plan" : "New membership plan"} onClose={close}>
      <form
        onSubmit={handleSubmit(async (x: any) => {
          const durationMonths = x.durationMonths === "" ? 0 : +x.durationMonths;
          const trainingHours = x.trainingHours === "" ? null : +x.trainingHours;
          await api("plans:save", {
            id: plan?.id,
            data: {
              name: x.name,
              description: x.description,
              durationMonths,
              trainingHours,
              priceMinor: Math.round(+x.price * 100),
            },
          });
          refresh();
          close();
          notifySuccess("Membership plan saved.");
        })}
      >
        <p className="formHint">Set months, training hours, or both. When both are set, the membership ends as soon as either limit is reached.</p>
        <Field label="Plan name" required {...register("name")} />
        <Field label="Description" {...register("description")} />
        <div className="grid2">
          <Field
            label="Duration in months (optional)"
            type="number"
            min="1"
            placeholder="No calendar limit"
            {...register("durationMonths")}
          />
          <Field
            label="Price"
            type="number"
            step=".01"
            min="0"
            {...register("price")}
          />
          <Field
            label="Training hours (optional)"
            type="number"
            step=".25"
            min=".25"
            placeholder="Unlimited"
            {...register("trainingHours")}
          />
        </div>
        <footer>
          <button className="primary">Save plan</button>
        </footer>
      </form>
    </Modal>
  );
}
function Memberships({ settings, can }: any) {
  const [rows, setRows] = useState<any[]>([]),
    [plans, setPlans] = useState<any[]>([]),
    [members, setMembers] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [planFilter, setPlanFilter] = useState(""),
    [modal, setModal] = useState(false),
    [freezeHistory, setFreezeHistory] = useState<{ periods: any[]; membership: any } | null>(null);
  const load = () =>
    Promise.all([
      api("memberships:list").then(setRows),
      api("plans:list").then(setPlans),
      api("members:list").then(setMembers),
    ]);
  useEffect(() => {
    load();
  }, []);
  const visibleRows = rows.filter((row) => (!statusFilter || (row.effective_status || row.status) === statusFilter) && (!planFilter || String(row.plan_id) === planFilter) && [row.member_name,row.plan_name,row.start_date,row.end_date,row.effective_status || row.status].some((value) => String(value || "").toLowerCase().includes(query.trim().toLowerCase())));
  return (
    <Page
      title="Memberships"
      action={
        can("Memberships", "create") && (
          <button className="primary" onClick={() => setModal(true)}>
            <Plus />
            Assign plan
          </button>
        )
      }
    >
      <DataToolbar label="Search memberships" value={query} onChange={setQuery} placeholder="Member, plan, status, or date" shown={visibleRows.length} total={rows.length} filters={[{ label: "Status", value: statusFilter, onChange: setStatusFilter, options: ["active","frozen","expired","exhausted","cancelled"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })) }, { label: "Plan", value: planFilter, onChange: setPlanFilter, options: plans.map((plan) => ({ value: String(plan.id), label: plan.name })) }]} />
      <Table
        heads={["Member", "Plan", "Period", "Training time", "Status", "Amount", "Actions"]}
        rows={visibleRows.map((x) => [
          <b>{x.member_name}</b>,
          x.plan_name,
          `${x.start_date} → ${x.end_date === "9999-12-31" ? "No expiry" : x.end_date}`,
          x.training_minutes_limit == null ? "Unlimited" : `${(x.used_minutes / 60).toFixed(1)} / ${(x.training_minutes_limit / 60).toFixed(1)} hr`,
          <div className="membershipStatus"><Badge text={x.effective_status || x.status} />{x.status === "frozen" && <small><Snowflake /> Paused for {formatDuration(x.frozen_duration_ms)}</small>}</div>,
          money(x.price_minor, settings),
          <div className="actions membershipActions">
            {x.freeze_count > 0 && <button className="historyAction" onClick={async () => setFreezeHistory({ periods: await api("memberships:freezeHistory", { id: x.id }), membership: x })}><History /> History <span>{x.freeze_count}</span></button>}
            {can("Memberships", "edit") && (x.effective_status || x.status) === "active" && (
              <>
                <button onClick={() => act(x.id, "renew", load)}>Renew</button>
                <button className="freezeAction" onClick={() => act(x.id, "freeze", load)}>
                  <Snowflake /> Freeze
                </button>
                <button onClick={() => act(x.id, "cancel", load)}>
                  Cancel
                </button>
              </>
            )}
            {can("Memberships", "edit") && x.status === "frozen" && (
              <button className="resumeAction" onClick={() => act(x.id, "resume", load)}><Play /> Resume</button>
            )}
            {can("Memberships", "edit") && ["expired", "exhausted", "cancelled"].includes(x.effective_status || x.status) && (
              <button onClick={() => act(x.id, "renew", load)}>Renew</button>
            )}
          </div>,
        ])}
        emptyText={query ? "No memberships match this search." : "No memberships yet."}
      />
      {modal && (
        <Assign
          members={members}
          plans={plans}
          close={() => setModal(false)}
          refresh={load}
        />
      )}
      {freezeHistory && <Modal title="Membership freeze history" className="freezeHistoryModal" onClose={() => setFreezeHistory(null)}>
        <section className="freezeSummary">
          <div className="freezeSummaryIcon"><Snowflake /></div>
          <div><span>{freezeHistory.membership.member_name}</span><strong>{freezeHistory.membership.plan_name}</strong><small>{freezeHistory.membership.start_date} → {freezeHistory.membership.end_date}</small></div>
          <dl><div><dt>Freeze periods</dt><dd>{freezeHistory.periods.length}</dd></div><div><dt>Total paused</dt><dd>{formatDuration(freezeHistory.membership.frozen_duration_ms)}</dd></div></dl>
        </section>
        <div className="freezeLedger">
          {freezeHistory.periods.map((period, index) => {
            const running = !period.resumed_at;
            const duration = period.duration_ms ?? Date.now() - new Date(period.frozen_at).getTime();
            return <article key={period.id} className={running ? "current" : ""}>
              <header><span className="freezeIndex">{String(freezeHistory.periods.length - index).padStart(2, "0")}</span><div><b>{running ? "Membership currently frozen" : "Completed freeze period"}</b><small>{running ? "Access and expiry are paused" : "Expiry was extended by this duration"}</small></div><strong className="freezeDuration">{formatDuration(duration)}</strong></header>
              <dl className="freezeDetails"><div><dt>Frozen</dt><dd>{formatDateTime(period.frozen_at)}</dd></div><div><dt>Resumed</dt><dd>{period.resumed_at ? formatDateTime(period.resumed_at) : "Not resumed"}</dd></div><div><dt>Frozen by</dt><dd>{period.frozen_by_name}</dd></div><div><dt>Resumed by</dt><dd>{period.resumed_by_name || "—"}</dd></div></dl>
            </article>;
          })}
        </div>
      </Modal>}
    </Page>
  );
}
const formatDuration = (milliseconds: number) => {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = minutes % 60;
  return [days && `${days}d`, hours && `${hours}h`, `${mins}m`].filter(Boolean).join(" ");
};
const formatDateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
function Plans({ settings, can }: any) {
  const [plans, setPlans] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [typeFilter, setTypeFilter] = useState(""),
    [editing, setEditing] = useState<any>(null);
  const refresh = () => api("plans:list").then(setPlans);
  useEffect(() => { void refresh(); }, []);
  const reload = async () => {
    await refresh();
    setEditing(null);
  };
  const visiblePlans = plans.filter((plan) => {
    const type = plan.duration_months > 0 && plan.training_minutes_limit != null ? "hybrid" : plan.duration_months > 0 ? "calendar" : "hours";
    return (!typeFilter || type === typeFilter) && [plan.name,plan.description].some((value) => String(value || "").toLowerCase().includes(query.trim().toLowerCase()));
  });
  return (
    <Page title="Plans" action={can("Memberships", "create") && <button className="primary" onClick={() => setEditing({ new: true })}><Plus />Create plan</button>}>
      <section className="plansPage">
        <div className="planManagerIntro">
          <div><strong>{plans.length} active plan{plans.length === 1 ? "" : "s"}</strong><p>Create and maintain the access packages staff can assign to members.</p></div>
        </div>
          <div className="planSearch"><DataToolbar label="Search plans" value={query} onChange={setQuery} placeholder="Plan name or description" shown={visiblePlans.length} total={plans.length} filters={[{ label: "Plan type", value: typeFilter, onChange: setTypeFilter, options: [{ value: "calendar", label: "Calendar only" }, { value: "hours", label: "Hours only" }, { value: "hybrid", label: "Calendar + hours" }] }]} /></div>
          <div className="planCatalog">
            {visiblePlans.map((plan: any) => {
              const hasMonths = plan.duration_months > 0;
              const hasHours = plan.training_minutes_limit != null;
              const type = hasMonths && hasHours ? "Calendar + hours" : hasMonths ? "Calendar access" : "Training hours";
              return <article className="planCard" key={plan.id}>
                <header><div><span className="planType">{type}</span><h3>{plan.name}</h3></div><strong className="planPrice">{money(plan.price_minor, settings)}</strong></header>
                <p className="planDescription">{plan.description || "No description added."}</p>
                <dl className="planLimits">
                  <div><dt>Calendar</dt><dd>{hasMonths ? `${plan.duration_months} month${plan.duration_months === 1 ? "" : "s"}` : "No expiry"}</dd></div>
                  <div><dt>Training</dt><dd>{hasHours ? `${plan.training_minutes_limit / 60} hours` : "Unlimited"}</dd></div>
                </dl>
                <footer>
                  {can("Memberships", "edit") && <button className="planEdit" onClick={() => setEditing(plan)}>Edit plan</button>}
                  {can("Memberships", "delete") && <button className="planArchive" onClick={async () => {
                  const authorizationPin = await confirmWithPin({ title: "Archive this plan?", message: `${plan.name} will no longer be available for new memberships. Existing membership records are preserved. Enter your current PIN to continue.`, confirmLabel: "Archive plan", tone: "danger" });
                  if (!authorizationPin) return;
                  try { await api("plans:archive", { id: plan.id, authorizationPin }); } catch { return; }
                  await refresh();
                  notifySuccess("Membership plan archived.");
                  }}>Archive</button>}
                </footer>
              </article>;
            })}
            {!visiblePlans.length && <div className="planEmpty"><CalendarClock /><h3>{plans.length ? "No plans match" : "No plans yet"}</h3><p>{plans.length ? "Change the search or reset the active filter." : "Create the first plan to start assigning memberships."}</p>{!plans.length && can("Memberships", "create") && <button className="primary" onClick={() => setEditing({ new: true })}>Create plan</button>}</div>}
          </div>
      </section>
      {editing && <PlanForm plan={editing.new ? null : editing} close={() => setEditing(null)} refresh={reload} />}
    </Page>
  );
}
const act = async (id: number, action: string, load: any) => {
  const copy: Record<
    string,
    { title: string; message: string; label: string }
  > = {
    renew: {
      title: "Renew this membership?",
      message:
        "The membership dates will be recalculated and the membership will become active.",
      label: "Renew membership",
    },
    freeze: {
      title: "Freeze this membership?",
      message:
        "Check-in access stops immediately. The calendar expiry and remaining training hours stay paused until this membership is resumed. This freeze will be recorded in history.",
      label: "Freeze membership",
    },
    resume: {
      title: "Resume this membership?",
      message: "Check-in access returns immediately. The membership expiry will be extended by the exact time it was frozen, and this period will remain in history.",
      label: "Resume membership",
    },
    cancel: {
      title: "Cancel this membership?",
      message:
        "This changes the membership to cancelled. Payment and attendance history will remain preserved.",
      label: "Cancel membership",
    },
  };
  const detail = copy[action];
  const authorizationPin = action === "cancel" && detail ? await confirmWithPin({
      title: detail.title, message: `${detail.message} Enter your current PIN to authorize cancellation.`, confirmLabel: detail.label, tone: "danger",
    }) : null;
  if (action === "cancel" && !authorizationPin) return;
  if (action !== "cancel" && detail && !(await confirmAction({
      title: detail.title,
      message: detail.message,
      confirmLabel: detail.label,
      tone: action === "cancel" ? "danger" : "default",
    }))) return;
  try { await api("memberships:action", { id, action, authorizationPin }); } catch { return; }
  await load();
  notifySuccess(
    `Membership ${{ renew: "renewed", freeze: "frozen", resume: "resumed", cancel: "cancelled" }[action]}.`,
  );
};
function Assign({ members, plans, close, refresh }: any) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      memberId: members[0]?.id,
      planId: plans[0]?.id,
      startDate: new Date().toISOString().slice(0, 10),
      autoRenew: false,
    },
  });
  return (
    <Modal title="Assign membership" onClose={close}>
      <form
        onSubmit={handleSubmit(async (x: any) => {
          await api("memberships:assign", {
            ...x,
            memberId: +x.memberId,
            planId: +x.planId,
          });
          refresh();
          close();
          notifySuccess("Membership assigned.");
        })}
      >
        <label>
          <span>Member</span>
          <select {...register("memberId")}>
            {members.map((x: any) => (
              <option value={x.id}>
                {x.first_name} {x.last_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Plan</span>
          <select {...register("planId")}>
            {plans.map((x: any) => (
              <option value={x.id}>{x.name}</option>
            ))}
          </select>
        </label>
        <Field label="Start date" type="date" {...register("startDate")} />
        <label className="check">
          <input type="checkbox" {...register("autoRenew")} />
          Auto-renew
        </label>
        <footer>
          <button className="primary">Assign plan</button>
        </footer>
      </form>
    </Modal>
  );
}
function Attendance({ can }: any) {
  const [rows, setRows] = useState<any[]>([]),
    [members, setMembers] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [methodFilter, setMethodFilter] = useState("");
  const load = () =>
    Promise.all([
      api("attendance:list").then(setRows),
      api("members:list").then(setMembers),
    ]);
  useEffect(() => {
    load();
  }, []);
  const visibleRows = rows.filter((row) => (!statusFilter || (row.checked_out_at ? "complete" : "in-gym") === statusFilter) && (!methodFilter || row.method === methodFilter) && [row.member_name,row.method,row.checked_in_at,row.checked_out_at,row.checked_out_at ? "complete" : "in gym"].some((value) => String(value || "").toLowerCase().includes(query.trim().toLowerCase())));
  return (
    <Page
      title="Attendance"
      action={
        <div className="headActions">
          <button onClick={() => api("export:csv", { module: "attendance" })}>
            Export CSV
          </button>
          {can("Attendance", "create") && (
            <QuickCheck members={members} refresh={load} />
          )}
        </div>
      }
    >
      <DataToolbar label="Search attendance" value={query} onChange={setQuery} placeholder="Member, status, method, or date" shown={visibleRows.length} total={rows.length} filters={[{ label: "Visit status", value: statusFilter, onChange: setStatusFilter, options: [{ value: "in-gym", label: "In gym" }, { value: "complete", label: "Checked out" }] }, { label: "Check-in method", value: methodFilter, onChange: setMethodFilter, options: [{ value: "manual", label: "Front desk" }, { value: "code", label: "Kiosk scanner" }] }]} />
      <Table
        heads={["Member", "Checked in", "Checked out", "Status"]}
        rows={visibleRows.map((x) => [
          <b>{x.member_name}</b>,
          new Date(x.checked_in_at).toLocaleString(),
          x.checked_out_at || !can("Attendance", "edit") ? (
            x.checked_out_at ? (
              new Date(x.checked_out_at).toLocaleString()
            ) : (
              "In gym"
            )
          ) : (
            <button
              onClick={async () => {
                await api("attendance:checkOut", { id: x.id });
                load();
                notifySuccess("Member checked out.");
              }}
            >
              Check out
            </button>
          ),
          <Badge text={x.checked_out_at ? "complete" : "in gym"} />,
        ])}
        emptyText={query ? "No attendance records match this search." : "No attendance recorded yet."}
      />
    </Page>
  );
}
function QuickCheck({ members, refresh }: any) {
  const [open, setOpen] = useState(false),
    [id, setId] = useState(0);
  return (
    <>
      {
        <button className="primary" onClick={() => setOpen(true)}>
          <Activity />
          Check in
        </button>
      }
      {open && (
        <Modal title="Quick check-in" onClose={() => setOpen(false)}>
          <form className="compactForm" onSubmit={async (event) => {
                event.preventDefault();
                try {
                  await api("attendance:checkIn", { memberId: id });
                  refresh();
                  setOpen(false);
                  notifySuccess("Member checked in.");
                } catch {
                  // The global toast keeps the dialog open and explains the conflict.
                }
              }}>
            <SelectField label="Member" value={id || ""} onChange={(e) => setId(+e.target.value)}>
              <option value="">Choose member</option>
              {members.map((m: any) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
            </SelectField>
            <footer className="modalFooter">
              <button type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button className="primary" disabled={!id}>Check in now</button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
function playKioskSound(kind: "welcome" | "denied") {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const context = new AudioContextClass();
    const notes = kind === "welcome"
      ? [{ frequency: 523.25, start: 0, duration: 0.2 }, { frequency: 659.25, start: 0.09, duration: 0.24 }, { frequency: 783.99, start: 0.18, duration: 0.34 }]
      : [{ frequency: 392, start: 0, duration: 0.22 }, { frequency: 293.66, start: 0.18, duration: 0.32 }];
    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === "welcome" ? "sine" : "triangle";
      oscillator.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + note.start);
      gain.gain.exponentialRampToValueAtTime(kind === "welcome" ? 0.055 : 0.045, context.currentTime + note.start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + note.start + note.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + note.start);
      oscillator.stop(context.currentTime + note.start + note.duration);
    }
    window.setTimeout(() => void context.close(), 800);
  } catch {
    // Visual feedback remains available if this kiosk has no audio output.
  }
}
function Kiosk({ settings, presentation, onEnterPresentation, onExitPresentation }: any) {
  const scannerBuffer = useRef("");
  const lastKeyAt = useRef(0);
  const [result, setResult] = useState<any>(null);
  const [denied, setDenied] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showExit, setShowExit] = useState(false);
  const [exitPin, setExitPin] = useState("");
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    if (!result && !denied) return;
    const timer = window.setTimeout(() => { setResult(null); setDenied(""); }, (settings.kioskWelcomeTimeoutSeconds || 8) * 1000);
    return () => window.clearTimeout(timer);
  }, [result, denied, settings.kioskWelcomeTimeoutSeconds]);
  const submitCode = async (code: string) => {
    if (busy || cooldown || !/^\d{10}$/.test(code)) return;
    setBusy(true);
    try {
      const data = await api("kiosk:checkInByCode", { code });
      setResult(data);
      setDenied("");
      playKioskSound("welcome");
      notifySuccess("Code accepted. Attendance recorded.");
    } catch (error: any) {
      setResult(null);
      setDenied(error.message || "Access denied");
      playKioskSound("denied");
    } finally { setBusy(false); setCooldown(3); }
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const current = Date.now();
      if (current - lastKeyAt.current > 250) scannerBuffer.current = "";
      lastKeyAt.current = current;
      if (/^\d$/.test(event.key)) {
        scannerBuffer.current = (scannerBuffer.current + event.key).slice(-10);
        event.preventDefault();
      } else if (event.key === "Enter") {
        const scanned = scannerBuffer.current;
        scannerBuffer.current = "";
        if (/^\d{10}$/.test(scanned)) void submitCode(scanned);
        else { setResult(null); setDenied("The scanner did not send a valid 10-digit chip ID."); playKioskSound("denied"); }
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, cooldown]);
  const daysLeft = result?.membership?.end_date && result.membership.end_date !== "9999-12-31"
    ? Math.ceil((new Date(`${result.membership.end_date}T23:59:59`).getTime() - Date.now()) / 86400000)
    : null;
  return (
    <Page title={presentation ? settings.gymName : "Member kiosk"} action={!presentation && <button className="primary" onClick={onEnterPresentation}><ShieldCheck /> Start presentation mode</button>}>
      <section className="kioskPanel">
        <header className="kioskHeader"><div><small>Today’s closing time</small><strong>{settings.gymClosingTime || "22:00"}</strong></div>{presentation && <button className="kioskExit" onClick={() => setShowExit(true)}>Exit kiosk</button>}</header>
        <div className="kioskModes">
          <button className="active"><ScanLine /> Scan member key</button>
          {settings.faceRecognitionEnabled && <button title="Face recognition provider configuration"><Camera /> Face recognition</button>}
        </div>
        <div className="kioskScanner">
          <ScanLine size={42} />
          <h2>Scan your OpenGym key</h2>
          <p>Ready for a USB, RFID, NFC, or barcode scanner operating in keyboard/HID mode. Scan the member chip—no typing is required.</p>
          <div className={`scannerState ${busy || cooldown ? "waiting" : "ready"}`}><span />{busy ? "Checking membership…" : cooldown ? `Please wait ${cooldown}s` : "Scanner ready"}</div>
          {cooldown > 0 && <small className="kioskCooldown" role="status">Ready for the next scan in {cooldown} second{cooldown === 1 ? "" : "s"}.</small>}
        </div>
        {denied && <article className="kioskDenied" role="alert"><ShieldCheck /><div><strong>Access denied</strong><span>{denied}</span></div></article>}
        {result && (
          <article className="kioskResult" role="status">
            <div className="liveDot" />
            <div><small>CHECKED IN</small><h2>{result.memberName}</h2><p>{new Date(result.checkedInAt).toLocaleTimeString()}</p></div>
            <div className="kioskMembership">
              <small>MEMBERSHIP</small>
              <strong>{result.membership?.plan_name || "No membership"}</strong>
              {result.membership?.end_date === "9999-12-31" ? <span>No calendar expiry</span> : daysLeft === null ? <span>Ask reception for membership details</span> : daysLeft >= 0 ? <span>{daysLeft} day{daysLeft === 1 ? "" : "s"} left · ends {result.membership.end_date}</span> : <span className="critical">Expired {result.membership.end_date}</span>}
              {result.membership?.remaining_minutes != null && <span>{(result.membership.remaining_minutes / 60).toFixed(1)} training hours remaining</span>}
            </div>
          </article>
        )}
      </section>
      {showExit && <Modal title="Exit presentation mode" onClose={() => { setShowExit(false); setExitPin(""); }}><p className="modalCopy">Enter the six-digit kiosk exit PIN configured by the Owner.</p><form onSubmit={async (event) => { event.preventDefault(); try { await onExitPresentation(exitPin); setShowExit(false); setExitPin(""); } catch { /* global error */ } }}><Field label="Kiosk exit PIN" type="password" inputMode="numeric" maxLength={6} autoFocus value={exitPin} onChange={(event) => setExitPin(event.target.value.replace(/\D/g, ""))} /><footer><button type="button" onClick={() => setShowExit(false)}>Cancel</button><button className="primary" disabled={exitPin.length !== 6}>Unlock and exit</button></footer></form></Modal>}
    </Page>
  );
}
function Payments({ settings, user, can }: any) {
  const [rows, setRows] = useState<any[]>([]),
    [memberships, setMemberships] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [methodFilter, setMethodFilter] = useState(""),
    [open, setOpen] = useState(false);
  const load = () =>
    Promise.all([
      api("payments:list").then(setRows),
      api("memberships:list").then(setMemberships),
    ]);
  useEffect(() => {
    load();
  }, []);
  const visibleRows = rows.filter((row) => (!statusFilter || row.status === statusFilter) && (!methodFilter || row.method === methodFilter) && [row.receipt_number,row.member_name,row.plan_name,row.method,row.status,row.paid_at].some((value) => String(value || "").toLowerCase().includes(query.trim().toLowerCase())));
  return (
    <Page
      title="Payments"
      action={
        <div className="headActions">
          <button onClick={() => api("export:csv", { module: "payments" })}>
            Export CSV
          </button>
          {can("Payments", "create") && (
            <button className="primary" onClick={() => setOpen(true)}>
              <Plus />
              Record payment
            </button>
          )}
        </div>
      }
    >
      <DataToolbar label="Search payments" value={query} onChange={setQuery} placeholder="Receipt, member, plan, method, or status" shown={visibleRows.length} total={rows.length} filters={[{ label: "Payment status", value: statusFilter, onChange: setStatusFilter, options: [{ value: "paid", label: "Paid" }, { value: "refunded", label: "Refunded" }] }, { label: "Method", value: methodFilter, onChange: setMethodFilter, options: [{ value: "cash", label: "Cash" }, { value: "card", label: "Card" }, { value: "transfer", label: "Transfer" }] }]} />
      <Table
        heads={[
          "Receipt",
          "Member",
          "Plan",
          "Paid",
          "Method",
          "Status",
          "Actions",
        ]}
        rows={visibleRows.map((x) => [
          <b>{x.receipt_number}</b>,
          x.member_name,
          x.plan_name,
          money(x.amount_minor, settings),
          x.method,
          <Badge text={x.status} />,
          <div className="actions">
            <button onClick={() => api("payments:receipt", { id: x.id })}>
              Receipt
            </button>
            {user.role === "Owner" && x.status === "paid" && (
              <button
                onClick={async () => {
                  const authorizationPin = await confirmWithPin({
                      title: "Refund this payment?",
                      message: `Receipt ${x.receipt_number} will be marked as refunded. Enter your current Owner PIN. The financial record will remain in history.`,
                      confirmLabel: "Refund payment",
                      tone: "danger",
                    });
                  if (authorizationPin) {
                    try { await api("payments:refund", { id: x.id, authorizationPin }); } catch { return; }
                    await load();
                    notifySuccess("Payment marked as refunded.");
                  }
                }}
              >
                Refund
              </button>
            )}
          </div>,
        ])}
        emptyText={query ? "No payments match this search." : "No payments recorded yet."}
      />
      {open && (
        <Pay
          memberships={memberships}
          close={() => setOpen(false)}
          refresh={load}
        />
      )}
    </Page>
  );
}
function Pay({ memberships, close, refresh }: any) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      membershipId: memberships[0]?.id,
      amount: 0,
      method: "cash",
    },
  });
  return (
    <Modal title="Record payment" onClose={close}>
      <form
        onSubmit={handleSubmit(async (x: any) => {
          await api("payments:record", {
            membershipId: +x.membershipId,
            amountMinor: Math.round(+x.amount * 100),
            method: x.method,
          });
          refresh();
          close();
          notifySuccess("Payment recorded.");
        })}
      >
        <label>
          <span>Membership</span>
          <select {...register("membershipId")}>
            {memberships.map((x: any) => (
              <option value={x.id}>
                {x.member_name} · {x.plan_name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid2">
          <Field
            label="Amount"
            type="number"
            step=".01"
            {...register("amount")}
          />
          <label>
            <span>Method</span>
            <select {...register("method")}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>
        </div>
        <footer>
          <button className="primary">Record payment</button>
        </footer>
      </form>
    </Modal>
  );
}
function Staff({ user }: any) {
  const [rows, setRows] = useState<any[]>([]),
    [permissions, setPermissions] = useState<any[]>([]),
    [open, setOpen] = useState(false),
    [resetting, setResetting] = useState<any>(null),
    [tab, setTab] = useState("Accounts");
  const load = () =>
    Promise.all([
      api("staff:list").then(setRows),
      user.role === "Owner"
        ? api("permissions:list").then(setPermissions)
        : Promise.resolve(),
    ]);
  useEffect(() => {
    load();
  }, []);
  return (
    <Page
      title="Staff"
      action={
        user.role === "Owner" && (
          <button className="primary" onClick={() => setOpen(true)}>
            <Plus />
            Add staff
          </button>
        )
      }
    >
      {user.role === "Owner" && (
        <div className="tabs">
          <button
            className={tab === "Accounts" ? "selected" : ""}
            onClick={() => setTab("Accounts")}
          >
            Accounts
          </button>
          <button
            className={tab === "Permissions" ? "selected" : ""}
            onClick={() => setTab("Permissions")}
          >
            Permissions
          </button>
        </div>
      )}
      {tab === "Accounts" ? (
        <Table
          heads={["Name", "Role", "Access", "Actions"]}
          rows={rows.map((x) => [
            <b>{x.name}</b>,
            x.role,
            <Badge text={x.archivedAt ? "archived" : "active"} />,
            user.role === "Owner" && !x.archivedAt ? (
              <div className="actions">
                <button onClick={() => setResetting(x)}>Reset PIN</button>
                {x.id !== user.id && x.role !== "Owner" && (
                  <button
                    onClick={async () => {
                      const authorizationPin = await confirmWithPin({
                          title: "Archive this staff account?",
                          message: `${x.name} will no longer be able to sign in. Enter your current Owner PIN. Their recorded activity remains attributed to them.`,
                          confirmLabel: "Archive account",
                          tone: "danger",
                        });
                      if (authorizationPin) {
                        try { await api("staff:archive", { id: x.id, authorizationPin }); } catch { return; }
                        await load();
                        notifySuccess("Staff account archived.");
                      }
                    }}
                  >
                    Archive
                  </button>
                )}
              </div>
            ) : null,
          ])}
        />
      ) : (
        <PermissionMatrix rows={permissions} refresh={load} />
      )}
      {open && <StaffForm close={() => setOpen(false)} refresh={load} />}
      {resetting && (
        <ResetPinForm
          staff={resetting}
          close={() => setResetting(null)}
          refresh={load}
        />
      )}
    </Page>
  );
}
function ResetPinForm({ staff, close, refresh }: any) {
  const { register, handleSubmit, watch } = useForm({
    defaultValues: { pin: "", confirmation: "" },
  });
  const pin = watch("pin");
  const confirmation = watch("confirmation");
  return (
    <Modal title={`Reset PIN for ${staff.name}`} onClose={close}>
      <p className="modalCopy">
        Their existing PIN will stop working immediately after this change.
      </p>
      <form
        onSubmit={handleSubmit(async (values) => {
          if (values.pin !== values.confirmation) return;
          const authorizationPin = await confirmWithPin({
              title: "Replace this staff PIN?",
              message: `${staff.name} will need the new PIN the next time they sign in. Enter your current Owner PIN to authorize the change.`,
              confirmLabel: "Replace PIN",
              tone: "danger",
            });
          if (!authorizationPin) return;
          try { await api("staff:resetPin", { id: staff.id, pin: values.pin, authorizationPin }); } catch { return; }
          await refresh();
          close();
          notifySuccess("Staff PIN updated.");
        })}
      >
        <Field
          label="New six-digit PIN"
          type="password"
          inputMode="numeric"
          maxLength={6}
          pattern="\d{6}"
          required
          {...register("pin")}
        />
        <Field
          label="Confirm new PIN"
          type="password"
          inputMode="numeric"
          maxLength={6}
          pattern="\d{6}"
          required
          error={
            confirmation && pin !== confirmation ? "PINs do not match" : ""
          }
          {...register("confirmation")}
        />
        <footer>
          <button
            className="primary"
            disabled={pin.length !== 6 || pin !== confirmation}
          >
            Continue
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function PermissionMatrix({ rows, refresh }: any) {
  const roles = ["Admin", "Front Desk", "Trainer"];
  const modules = [
    "Members",
    "Memberships",
    "Attendance",
    "Payments",
    "Staff",
    "Reports",
  ];
  return (
    <div className="permissionGrid">
      <span />
      {roles.map((role) => (
        <b key={role}>{role}</b>
      ))}
      {modules.map((module) => (
        <React.Fragment key={module}>
          <strong>{module}</strong>
          {roles.map((role) => {
            const row = rows.find(
              (item: any) => item.role === role && item.module === module,
            );
            return (
              <div className="permCell" key={role}>
                {["view", "create", "edit", "delete"].map((action) => {
                  const key = `can${action[0].toUpperCase()}${action.slice(1)}`;
                  return (
                    <label key={action}>
                      <input
                        type="checkbox"
                        checked={!!row?.[key]}
                        onChange={async (event) => {
                          const allowed = event.target.checked;
                          const authorizationPin = await confirmWithPin({ title: "Change role permission?", message: `${allowed ? "Allow" : "Remove"} ${action} access for ${role} in ${module}. Enter your current Owner PIN.`, confirmLabel: "Change permission", tone: "danger" });
                          if (!authorizationPin) return;
                          try { await api("permissions:update", {
                            roleId: row.roleId,
                            module,
                            action,
                            allowed,
                            authorizationPin,
                          }); } catch { return; }
                          await refresh();
                          notifySuccess("Permission updated.");
                        }}
                      />
                      {action}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
function StaffForm({ close, refresh }: any) {
  const { register, handleSubmit } = useForm({
    defaultValues: { name: "", roleId: 3, pin: "" },
  });
  return (
    <Modal title="Add staff account" onClose={close}>
      <form
        onSubmit={handleSubmit(async (x: any) => {
          await api("staff:create", { ...x, roleId: +x.roleId });
          refresh();
          close();
          notifySuccess("Staff account created.");
        })}
      >
        <Field label="Name" {...register("name")} />
        <label>
          <span>Role</span>
          <select {...register("roleId")}>
            <option value="2">Admin</option>
            <option value="3">Front Desk</option>
            <option value="4">Trainer</option>
          </select>
        </label>
        <Field
          label="Six-digit PIN"
          type="password"
          maxLength={6}
          {...register("pin")}
        />
        <footer>
          <button className="primary">Create account</button>
        </footer>
      </form>
    </Modal>
  );
}
function Backup() {
  const [state, setState] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const load = () => api("backup:status").then(setState);
  useEffect(() => {
    void load();
  }, []);
  const lastBackup = state.lastBackup ? new Date(state.lastBackup) : null;
  const backupNow = async () => { setBusy(true); try { const path = await api("backup:export"); if (path) { await load(); notifySuccess("Database backup exported."); } } finally { setBusy(false); } };
  return (
    <Page title="Backup & recovery" action={<button className="primary" disabled={busy} onClick={backupNow}><HardDriveDownload />{busy ? "Saving…" : "Back up now"}</button>}>
      <section className={`protectionStatus ${state.overdue ? "overdue" : "protected"}`}>
        <div className="protectionIcon">{state.overdue ? <TriangleAlert /> : <ShieldCheck />}</div>
        <div><span>Data protection</span><h2>{state.overdue ? (lastBackup ? "Backup is more than 7 days old" : "This gym has never been backed up") : "Your latest backup is current"}</h2><p>{lastBackup ? `Last successful export: ${lastBackup.toLocaleString()}` : "Create an offline copy before adding more operational data."}</p></div>
        <strong>{state.overdue ? "Action needed" : "Protected"}</strong>
      </section>
      <div className="backupFacts"><article><b>What is included</b><p>Members, photos, documents, plans, memberships, attendance, payments, staff, settings, and audit history.</p></article><article><b>Where it goes</b><p>You choose a local drive or removable disk. OpenGym never uploads the backup.</p></article><article><b>Recommended routine</b><p>Export weekly and keep a second copy away from the reception computer.</p></article></div>
      <section className="recoveryPanel">
        <div className="recoveryCopy"><Archive /><div><h2>Restore from a backup</h2><p>OpenGym validates the file and schema first, then creates a timestamped safety copy of the current database before switching.</p><ul><li>Requires the current Owner PIN</li><li>Rejects corrupt or newer unsupported databases</li><li>Restarts the application after a successful restore</li></ul></div></div>
        <button className="secondaryAction" onClick={async () => {
          const authorizationPin = await confirmWithPin({ title: "Restore another database?", message: "OpenGym will validate the selected backup, save a safety copy, and restart. Enter your current Owner PIN.", confirmLabel: "Choose backup", tone: "danger" });
          if (authorizationPin) try { await api("backup:import", { authorizationPin }); } catch { return; }
        }}>Choose backup file</button>
      </section>
      <section className="resetPanel">
        <div><span>Destructive action</span><h2>Factory reset this installation</h2><p>Permanently removes the gym, staff, members, visits, payments, receipts, photos, branding, and preferences. A PIN is not required, but the exact confirmation phrase is.</p></div>
        <button className="factoryResetButton" onClick={async () => {
          const confirmed = await new Promise<boolean>((resolve) => window.dispatchEvent(new CustomEvent("opengym:confirm", { detail: { title: "Factory reset OpenGym?", message: "This cannot be undone. Export a backup first if any data must be kept.", confirmLabel: "Erase everything", tone: "danger", phrase: "RESET OPENGYM", resolve } satisfies ConfirmationRequest })));
          if (confirmed) try { await api("backup:factoryReset"); } catch { return; }
        }}>Erase all OpenGym data</button>
      </section>
    </Page>
  );
}
function AuditLog() {
  const [data, setData] = useState<any>({ rows: [], staff: [], entityTypes: [], actions: [] });
  const [filters, setFilters] = useState<any>({ staffId: "", entityType: "", action: "", from: "", to: "", search: "" });
  const [loading, setLoading] = useState(true);
  const load = async (next = filters) => {
    setLoading(true);
    try {
      setData(await api("audit:list", {
        ...(next.staffId ? { staffId: +next.staffId } : {}),
        ...(next.entityType ? { entityType: next.entityType } : {}),
        ...(next.action ? { action: next.action } : {}),
        ...(next.from ? { from: next.from } : {}),
        ...(next.to ? { to: next.to } : {}),
        search: next.search,
      }));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const detailText = (value: string) => {
    try {
      const parsed = JSON.parse(value || "{}");
      return Object.keys(parsed).length ? Object.entries(parsed).map(([key, item]) => `${key}: ${String(item)}`).join(" · ") : "No additional details";
    } catch { return value || "No additional details"; }
  };
  return (
    <Page title="Audit log" action={<span className="auditCount">{data.rows.length} event{data.rows.length === 1 ? "" : "s"}</span>}>
      <section className="auditIntro"><ScrollText /><div><h2>Accountability across the front desk</h2><p>Every recorded change shows who performed it and when. Audit entries are read-only.</p></div></section>
      <form className="auditFilters" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <label><span>Staff member</span><select value={filters.staffId} onChange={(e) => setFilters({ ...filters, staffId: e.target.value })}><option value="">All staff</option>{data.staff.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label><span>Record type</span><select value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}><option value="">All records</option>{data.entityTypes.map((x: string) => <option key={x}>{x}</option>)}</select></label>
        <label><span>Action</span><select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}><option value="">All actions</option>{data.actions.map((x: string) => <option key={x}>{x.replaceAll("_", " ")}</option>)}</select></label>
        <Field label="From" type="date" value={filters.from} onChange={(e: any) => setFilters({ ...filters, from: e.target.value })} />
        <Field label="To" type="date" value={filters.to} onChange={(e: any) => setFilters({ ...filters, to: e.target.value })} />
        <Field label="Search details" value={filters.search} onChange={(e: any) => setFilters({ ...filters, search: e.target.value })} placeholder="Staff, action, or details" />
        <div className="auditFilterActions"><button className="primary" disabled={loading}>{loading ? "Loading…" : "Apply filters"}</button><button type="button" onClick={() => { const empty = { staffId: "", entityType: "", action: "", from: "", to: "", search: "" }; setFilters(empty); load(empty); }}>Reset</button></div>
      </form>
      {loading ? <div className="empty">Loading audit history…</div> : data.rows.length ? <div className="auditTable"><Table heads={["When", "Staff", "Action", "Record", "Details"]} rows={data.rows.map((row: any) => [
        <time>{new Date(row.createdAt).toLocaleString()}</time>,
        <div className="auditStaff"><b>{row.staffName || "System"}</b><small>{row.staffRole || "Automated"}</small></div>,
        <Badge text={row.action.replaceAll("_", " ")} />,
        <span className="auditEntity">{row.entityType}{row.entityId ? ` #${row.entityId}` : ""}</span>,
        <span className="auditDetails" title={detailText(row.details)}>{detailText(row.details)}</span>,
      ])} /></div> : <div className="empty">No audit events match these filters.</div>}
    </Page>
  );
}
function Dashboard({ settings }: any) {
  const [d, setD] = useState<any>();
  useEffect(() => {
    api("dashboard:get").then(setD);
  }, []);
  if (!d)
    return (
      <Page title="Today">
        <p>Loading the front desk…</p>
      </Page>
    );
  return (
    <Page title="Front desk overview">
      <section className="dashboardHero"><div><span>Live operations</span><strong>{d.openVisits.n}</strong><p>members currently training</p></div><div className="dashboardMetrics"><article><span>Due to expire</span><b>{d.expiring.n}</b><small>Next 14 days</small></article><article><span>Collected today</span><b>{money(d.todayRevenue.n, settings)}</b><small>Paid transactions</small></article></div></section>
      <div className="dashboardGrid">
        <section className="opsPanel"><header><div><h2>In the gym now</h2><p>Live check-ins at this location</p></div><Badge text={`${d.checkedIn.length} active`} /></header>{d.checkedIn.length ? <div className="liveList">{d.checkedIn.map((x:any)=><article key={x.id}><i/><div><b>{x.member_name}</b><span>{x.member_code}</span></div><time>{new Date(x.checked_in_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time></article>)}</div>:<div className="panelEmpty">No one is checked in right now.</div>}</section>
        <section className="opsPanel"><header><div><h2>Needs attention</h2><p>Memberships expiring soon</p></div></header>{d.expiringSoon.length ? <div className="attentionList">{d.expiringSoon.map((x:any)=><article key={x.id}><div><b>{x.member_name}</b><span>{x.plan_name} · ends {x.end_date}</span></div><strong>{x.days_left}d</strong></article>)}</div>:<div className="panelEmpty">No memberships expire in the next 14 days.</div>}</section>
      </div>
      <section className="opsPanel dashboardPayments"><header><div><h2>Latest payments</h2><p>Most recent financial activity</p></div></header><Table heads={["Receipt", "Member", "Plan", "Amount", "Time"]} rows={d.recent.map((x:any)=>[x.receipt_number,x.member_name,x.plan_name,money(x.amount_minor,settings),new Date(x.paid_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})])} emptyText="No payments recorded yet." /></section>
    </Page>
  );
}
function Reports({ settings }: any) {
  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days + 1); return date.toISOString().slice(0, 10); };
  const [range, setRange] = useState({ from: daysAgo(30), to: today, preset: "30" });
  const [data, setData] = useState<any>();
  const [exporting, setExporting] = useState(false);
  const load = (next = range) => api("reports:get", { from: next.from, to: next.to }).then(setData);
  useEffect(() => { load(); }, []);
  const choosePreset = (preset: string) => {
    const from = preset === "7" ? daysAgo(7) : preset === "90" ? daysAgo(90) : preset === "year" ? `${new Date().getFullYear()}-01-01` : daysAgo(30);
    const next = { from, to: today, preset }; setRange(next); load(next);
  };
  if (!data) return <Page title="Reports">Loading report…</Page>;
  const busiest = data.attendance.peakHours[0]?.hour;
  const trend = Array.from(new Set([...data.attendance.trend.map((x: any) => x.day), ...data.revenue.monthly.map((x: any) => x.day)])).sort().map((day: any) => ({ day, visits: Number(data.attendance.trend.find((x: any) => x.day === day)?.value || 0), revenue: Number(data.revenue.monthly.find((x: any) => x.day === day)?.value || 0) }));
  const maxVisits = Math.max(1, ...trend.map((x: any) => x.visits));
  const maxRevenue = Math.max(1, ...trend.map((x: any) => x.revenue));
  const Horizontal = ({ title, rows, format = (value: number) => String(value) }: any) => {
    const max = Math.max(1, ...rows.map((x: any) => Number(x.value)));
    return <section className="reportPanel"><header><h2>{title}</h2></header>{rows.length ? <div className="horizontalBars">{rows.slice(0, 8).map((row: any) => <div key={row.label}><span>{row.label}</span><i><b style={{ width: `${Math.max(3, Number(row.value) / max * 100)}%` }} /></i><strong>{format(Number(row.value))}</strong></div>)}</div> : <div className="reportEmpty">No data in this period.</div>}</section>;
  };
  return (
    <Page title="Reports" action={<button className="primary" onClick={() => setExporting(true)}><Download /> Export report</button>}>
      <div className="reportToolbar">
        <div className="rangePresets">{[["7","7 days"],["30","30 days"],["90","90 days"],["year","This year"]].map(([value,label]) => <button key={value} className={range.preset === value ? "selected" : ""} onClick={() => choosePreset(value)}>{label}</button>)}</div>
        <div className="customRange"><input aria-label="Report start date" type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value, preset: "custom" })} /><span>to</span><input aria-label="Report end date" type="date" value={range.to} min={range.from} max={today} onChange={(e) => setRange({ ...range, to: e.target.value, preset: "custom" })} /><button onClick={() => load()}>Apply</button></div>
      </div>
      <div className="reportKpis">
        <article><span>Revenue</span><strong>{money(data.revenue.total, settings)}</strong><small>{data.revenue.transactions} paid transactions</small></article>
        <article><span>Visits</span><strong>{data.attendance.total}</strong><small>{data.attendance.uniqueMembers} unique members</small></article>
        <article><span>Members joined</span><strong>{data.members.joined}</strong><small>{data.members.total} members now</small></article>
        <article><span>Busiest hour</span><strong>{busiest ? `${busiest}:00` : "—"}</strong><small>{data.revenue.refunds} refunds in period</small></article>
      </div>
      <section className="reportPanel reportTrend"><header><div><h2>Daily activity</h2><p>Visits and revenue share the timeline with independent scales.</p></div><div className="chartLegend"><span><i className="visitKey" />Visits</span><span><i className="revenueKey" />Revenue</span></div></header>{trend.length ? <div className="dualBars" aria-label="Daily visits and revenue chart">{trend.map((point: any, index: number) => <div key={point.day} title={`${point.day}: ${point.visits} visits, ${money(point.revenue, settings)}`}><div><i className="visitBar" style={{ height: `${point.visits / maxVisits * 100}%` }} /><i className="revenueBar" style={{ height: `${point.revenue / maxRevenue * 100}%` }} /></div><small>{index % Math.max(1, Math.ceil(trend.length / 8)) === 0 ? point.day.slice(5) : ""}</small></div>)}</div> : <div className="reportEmpty">Activity will appear after visits and payments are recorded.</div>}</section>
      <div className="reportGrid">
        <Horizontal title="Revenue by plan" rows={data.revenue.byPlan} format={(value: number) => money(value, settings)} />
        <Horizontal title="Peak attendance hours" rows={data.attendance.peakHours.map((x: any) => ({ label: `${x.hour}:00`, value: x.value }))} />
        <Horizontal title="Payment methods" rows={data.revenue.methods} />
        <Horizontal title="Staff activity" rows={data.staffActivity} />
        <Horizontal title="Member status" rows={data.members.status} />
        <Horizontal title="Membership status" rows={data.memberships.status} />
      </div>
      {exporting && <ReportExport range={range} close={() => setExporting(false)} />}
    </Page>
  );
}
function ReportExport({ range, close }: any) {
  const [format, setFormat] = useState("pdf"), [scope, setScope] = useState("summary"), [busy, setBusy] = useState(false);
  return <Modal title="Export report" onClose={close}><p className="modalCopy">Export {range.from} through {range.to}. CSV preserves detailed rows; PDF creates a presentation-ready summary.</p><form onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { const path = await api("reports:export", { from: range.from, to: range.to, format, scope }); if (path) { notifySuccess("Report exported."); close(); } } catch { /* Global error remains visible. */ } finally { setBusy(false); } }}><div className="exportChoices"><label><input type="radio" name="format" checked={format === "pdf"} onChange={() => { setFormat("pdf"); setScope("summary"); }} /><span><b>PDF summary</b><small>KPIs and ranked visual summaries</small></span></label><label><input type="radio" name="format" checked={format === "csv"} onChange={() => setFormat("csv")} /><span><b>CSV data</b><small>Detailed rows for spreadsheets</small></span></label></div>{format === "csv" && <SelectField label="Data to export" value={scope} onChange={(e: any) => setScope(e.target.value)}><option value="summary">Summary metrics</option><option value="attendance">Attendance records</option><option value="payments">Payment records</option><option value="memberships">Membership records</option></SelectField>}<footer><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Exporting…" : `Export ${format.toUpperCase()}`}</button></footer></form></Modal>;
}
function AppSettings({ settings, refresh, user, preferences, setPreferences }: any) {
  const [theme, setTheme] = useState<ThemeName>(preferences.theme);
  const [dark, setDark] = useState(preferences.darkMode);
  const [saved, setSaved] = useState("");
  const [section, setSection] = useState<"appearance"|"business"|"documents">("appearance");
  const { register, handleSubmit, setValue, watch } = useForm({ defaultValues: settings });
  const choose = async (name: ThemeName) => {
    const saved = await api("preferences:update", { theme: name, darkMode: dark });
    setTheme(name);
    setPreferences(saved);
    applyAppearance(saved.theme, saved.darkMode);
  };
  const toggleDark = async () => {
    const saved = await api("preferences:update", { theme, darkMode: !dark });
    setDark(saved.darkMode);
    setPreferences(saved);
    applyAppearance(saved.theme, saved.darkMode);
  };
  return (
    <Page title="Settings">
      <nav className="settingsNav" aria-label="Settings sections"><button className={section === "appearance" ? "active" : ""} onClick={() => setSection("appearance")}>Appearance</button>{user.role === "Owner" && <><button className={section === "business" ? "active" : ""} onClick={() => setSection("business")}>Gym & receipts</button><button className={section === "documents" ? "active" : ""} onClick={() => setSection("documents")}>Member documents</button></>}</nav>
      <div className="settingsLayout">
        {section === "appearance" && <section className="settingsCard settingsFeature">
          <h2>Appearance</h2>
          <p>Choose a color personality and comfortable contrast.</p>
          <button className="modeToggle" onClick={toggleDark}>
            <Moon /> {dark ? "Use light mode" : "Use dark mode"}
          </button>
          <div className="themeGrid">
            {(Object.keys(themes) as ThemeName[]).map((name) => (
              <button
                key={name}
                className={theme === name ? "chosen" : ""}
                onClick={() => void choose(name)}
              >
                <span className="themePreview"><i style={{ background: themes[name].lightTint }} /><i style={{ background: themes[name].darkTint }} /><i style={{ background: themes[name].accent }} /></span>
                {name}
              </button>
            ))}
          </div>
        </section>}
        {user.role === "Owner" && section === "business" && (
          <section className="settingsCard">
            <h2>Gym identity and receipts</h2>
            <p>Your logo and business details appear in the app and on new receipt snapshots.</p>
            <form
              onSubmit={handleSubmit(async (values) => {
                const authorizationPin = await confirmWithPin({ title: "Save critical gym settings?", message: "These changes affect gym identity, receipts, and regional formatting. Enter your current Owner PIN.", confirmLabel: "Save changes", tone: "danger" });
                if (!authorizationPin) return;
                try { await api("settings:update", { ...values, authorizationPin }); } catch { return; }
                await refresh();
                setSaved("Settings saved.");
                notifySuccess("Gym settings saved.");
              })}
            >
              <div className="logoPicker">
                <div className="logoPreview">
                  <img src={settings.logoDataUrl || appLogo} alt="Current gym logo" />
                </div>
                <div>
                  <b>Gym logo</b>
                  <small>PNG or JPG with a transparent or white background works best.</small>
                  <div className="logoActions">
                    <button type="button" onClick={async () => { const path = await api("settings:chooseLogo"); if (path) { setValue("logoPath", path); notifySuccess("Logo selected. Save changes to apply it."); } }}>Choose logo</button>
                    {watch("logoPath") && <button type="button" onClick={() => setValue("logoPath", null)}>Remove</button>}
                  </div>
                </div>
              </div>
              <Field label="Gym name" {...register("gymName")} />
              <Field label="Address" {...register("address")} />
              <div className="grid2">
                <Field label="Phone" {...register("phone")} />
                <Field label="Email" type="email" {...register("email")} />
                <Field label="Tax or registration ID" {...register("taxId")} />
                <SelectField label="Language and formatting" {...register("locale")}>
                  {setupOptions.locales.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </SelectField>
                <SelectField label="Currency" {...register("currency")}>
                  {setupOptions.currencies.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </SelectField>
              </div>
              <SelectField label="Timezone" {...register("timezone")}>
                {setupOptions.timezones.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </SelectField>
              <div className="receiptOptions">
                <label><span>Receipt paper</span><select {...register("receiptPaper")}><option value="A4">A4</option><option value="LETTER">US Letter</option></select></label>
                <label><span>Receipt accent</span><input type="color" {...register("receiptColor")} /></label>
              </div>
              <label><span>Receipt footer</span><textarea maxLength={300} {...register("receiptFooter")} /></label>
              <label className="checkRow">
                <input type="checkbox" {...register("faceRecognitionEnabled")} />
                <span><b>Enable face recognition in kiosk</b><small>Off by default. Only enable this after consent, camera, and a local recognition provider are configured.</small></span>
              </label>
              <div className="kioskSettings">
                <h3>Kiosk presentation</h3>
                <p>Set the public display timing and the PIN required to leave locked fullscreen mode.</p>
                <div className="grid2">
                  <Field label="Welcome message timeout (seconds)" type="number" min={3} max={60} {...register("kioskWelcomeTimeoutSeconds", { valueAsNumber: true })} />
                  <Field label="Gym closing time" type="time" {...register("gymClosingTime")} />
                  <Field label={settings.kioskExitPinConfigured ? "New kiosk exit PIN (leave blank to keep current)" : "Kiosk exit PIN"} type="password" inputMode="numeric" maxLength={6} placeholder="6 digits" {...register("kioskExitPin")} />
                </div>
              </div>
              <footer>
                <button className="primary">Save changes</button>
              </footer>
              {saved && <p className="success">{saved}</p>}
            </form>
          </section>
        )}
        {user.role === "Owner" && section === "documents" && <DocumentRequirements />}
      </div>
    </Page>
  );
}
function DocumentRequirements() {
  const [requirements, setRequirements] = useState<any[]>([]);
  const [name, setName] = useState("");
  const load = () => api("documents:requirements").then(setRequirements);
  useEffect(() => { load(); }, []);
  return <section className="settingsCard documentSettings"><h2>Member onboarding documents</h2><p>New members must provide every document listed here. Files are stored inside the local OpenGym database rather than linked to removable originals.</p><form onSubmit={async (event) => { event.preventDefault(); if (name.trim().length < 2) return; await api("documents:addRequirement", { name }); setName(""); await load(); notifySuccess("Document requirement added."); }}><div className="inlineAdd"><Field label="Document name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Medical fitness certificate" /><button className="primary" disabled={name.trim().length < 2}>Add requirement</button></div></form><div className="requirementList">{requirements.map((requirement) => <div key={requirement.id}><FileText /><span>{requirement.name}</span><button onClick={async () => { if (!(await confirmAction({ title: "Remove this requirement?", message: "New members will no longer need to present this document. Existing stored files remain preserved.", confirmLabel: "Remove requirement", tone: "danger" }))) return; await api("documents:archiveRequirement", { id: requirement.id }); await load(); }}>Remove</button></div>)}{!requirements.length && <p>No documents are required yet.</p>}</div></section>;
}
function CommandPalette({ items, onChoose, onClose }: any) {
  const [query, setQuery] = useState("");
  const visible = items.filter(([name]: any) =>
    name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="commandShade" onMouseDown={onClose}>
      <section
        className="commandPalette"
        role="dialog"
        aria-label="Quick navigation"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="commandSearch">
          <Search />
          <input
            autoFocus
            aria-label="Search commands"
            placeholder="Go to a page…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && visible[0]) onChoose(visible[0][0]);
              if (event.key === "Escape") onClose();
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="commandList">
          {visible.map(([name, Icon]: any) => (
            <button key={name} onClick={() => onChoose(name)}>
              <Icon />
              <span>{name}</span>
            </button>
          ))}
          {!visible.length && <p>No matching page.</p>}
        </div>
      </section>
    </div>
  );
}
function Shell({ logout }: any) {
  const [screen, setScreen] = useState<Screen>("Dashboard"),
    [user, setUser] = useState<any>(),
    [settings, setSettings] = useState<any>(),
    [preferences, setPreferences] = useState<any>(),
    [permissions, setPermissions] = useState<any[]>([]),
    [menuOpen, setMenuOpen] = useState(false),
    [commandOpen, setCommandOpen] = useState(false),
    [kioskPresentation, setKioskPresentation] = useState(false);
  const refreshSettings = () => api("settings:get").then(setSettings);
  const refreshPreferences = () => api("preferences:get").then((value: any) => {
    setPreferences(value);
    applyAppearance(value.theme, value.darkMode);
  });
  useEffect(() => {
    applyAppearance("Pulse", true);
    Promise.all([
      api("session:current").then(setUser),
      api("session:permissions").then(setPermissions),
      refreshSettings(),
      refreshPreferences(),
    ]);
    const shortcuts = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, []);
  if (!user || !settings || !preferences)
    return (
      <main className="splash">
        <img className="brandMark" src={appLogo} alt="" /> Opening the front desk…
      </main>
    );
  const canView = (module: string) =>
    user.role === "Owner" ||
    permissions.some((row) => row.module === module && row.canView);
  const can = (module: string, action: string) => {
    if (user.role === "Owner") return true;
    const row = permissions.find((item) => item.module === module);
    const key = `can${action[0].toUpperCase()}${action.slice(1)}`;
    return !!row?.[key];
  };
  const nav: any[] = [
    ["Dashboard", Activity],
    ...(canView("Members") ? [["Members", Users]] : []),
    ...(canView("Memberships") ? [["Plans", Dumbbell]] : []),
    ...(canView("Memberships") ? [["Memberships", CalendarClock]] : []),
    ...(canView("Attendance") ? [["Attendance", RefreshCw]] : []),
    ...(canView("Attendance") ? [["Kiosk", ScanLine]] : []),
    ...(canView("Payments") ? [["Payments", CreditCard]] : []),
    ...(canView("Staff") ? [["Staff", ShieldCheck]] : []),
    ...(canView("Reports") ? [["Reports", Activity]] : []),
    ...(user.role === "Owner" ? [["Audit Log", ScrollText]] : []),
    ["Settings", Settings],
    ...(user.role === "Owner" ? [["Backup", Archive]] : []),
  ];
  if (kioskPresentation) return <div className="kioskPresentation"><Kiosk settings={settings} presentation onExitPresentation={async (pin: string) => { await api("kiosk:exitPresentation", { pin }); setKioskPresentation(false); }} /><ConfirmationHost /><ToastHost /></div>;
  return (
    <div className="shell">
      <button
        className="mobileMenu"
        aria-label="Open navigation"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <Menu />
      </button>
      {menuOpen && <button className="navScrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside className={menuOpen ? "open" : ""}>
        <button className="navClose" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)}><X /></button>
        <div className="brand inverse">
          <img className="shellLogo" src={settings.logoDataUrl || appLogo} alt="" />
          <b>{settings.gymName}</b>
        </div>
        <nav>
          {nav.map(([n, I]) => (
            <button
              className={screen === n ? "active" : ""}
              onClick={() => {
                setScreen(n);
                setMenuOpen(false);
              }}
            >
              <I />
              {n}
            </button>
          ))}
        </nav>
        <button
          className="commandButton"
          aria-keyshortcuts="Control+K"
          onClick={() => setCommandOpen(true)}
        >
          <Search /> Quick access <kbd>Ctrl K</kbd>
        </button>
        <div className="identity">
          <span>{user.name}</span>
          <small>{user.role}</small>
          <button
            onClick={async () => {
              await api("session:signOut");
              logout();
            }}
          >
            <LogOut />
            Sign out
          </button>
        </div>
      </aside>
      {screen === "Dashboard" ? (
        <Dashboard settings={settings} />
      ) : screen === "Members" ? (
        <Members settings={settings} user={user} can={can} />
      ) : screen === "Plans" ? (
        <Plans settings={settings} can={can} />
      ) : screen === "Memberships" ? (
        <Memberships settings={settings} can={can} />
      ) : screen === "Attendance" ? (
        <Attendance can={can} />
      ) : screen === "Kiosk" ? (
        <Kiosk settings={settings} onEnterPresentation={async () => { try { await api("kiosk:enterPresentation"); setKioskPresentation(true); } catch { /* global error */ } }} />
      ) : screen === "Payments" ? (
        <Payments settings={settings} user={user} can={can} />
      ) : screen === "Staff" ? (
        <Staff user={user} />
      ) : screen === "Reports" ? (
        <Reports settings={settings} />
      ) : screen === "Audit Log" ? (
        <AuditLog />
      ) : screen === "Settings" ? (
        <AppSettings
          settings={settings}
          refresh={refreshSettings}
          user={user}
          preferences={preferences}
          setPreferences={setPreferences}
        />
      ) : (
        <Backup />
      )}
      {commandOpen && (
        <CommandPalette
          items={nav}
          onClose={() => setCommandOpen(false)}
          onChoose={(name: Screen) => {
            setScreen(name);
            setCommandOpen(false);
          }}
        />
      )}
      <ConfirmationHost />
      <ToastHost />
    </div>
  );
}
function App() {
  const [stage, setStage] = useState<"load" | "setup" | "login" | "app">(
    "load",
  );
  const [branding, setBranding] = useState<any>({ gymName: "OpenGym", logoDataUrl: null });
  useEffect(() => {
    applyAppearance("Pulse", true);
    api("setup:status")
      .then(async (x: any) => {
        if (x.complete) setBranding(await api("setup:branding"));
        setStage(x.complete ? "login" : "setup");
      })
      .catch(() => setStage("setup"));
  }, []);
  return stage === "load" ? (
    <main className="splash">
      <img className="brandMark" src={appLogo} alt="" /> Opening OpenGym…
    </main>
  ) : stage === "setup" ? (
    <Setup done={async () => { setBranding(await api("setup:branding")); setStage("login"); }} />
  ) : stage === "login" ? (
    <Login branding={branding} done={() => setStage("app")} />
  ) : (
    <Shell logout={() => { applyAppearance("Pulse", true); setStage("login"); }} />
  );
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
