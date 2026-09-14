// @ts-nocheck -- renderer records are validated at the IPC boundary.
import React, { useEffect, useState } from "react";
import appLogoAsset from "../../../logo.png";
import { Field } from "../components/ui";

export const appLogo = appLogoAsset;
export const api = async (channel: string, payload?: unknown) => {
  const r = await window.openGym.invoke(channel, payload);
  if (!r.ok) {
    window.dispatchEvent(
      new CustomEvent("opengym:error", { detail: r.error.message }),
    );
    throw new Error(r.error.message);
  }
  return r.data;
};
export const notifySuccess = (message: string) =>
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
export const confirmAction = (
  request: Omit<ConfirmationRequest, "resolve">,
): Promise<boolean> =>
  new Promise((resolve) =>
    window.dispatchEvent(
      new CustomEvent("opengym:confirm", {
        detail: { ...request, resolve } satisfies ConfirmationRequest,
      }),
    ),
  );
export const confirmWithPin = (
  request: Omit<ConfirmationRequest, "resolve" | "requiresPin">,
): Promise<string | null> =>
  new Promise((resolve) =>
    window.dispatchEvent(
      new CustomEvent("opengym:confirm", {
        detail: {
          ...request,
          requiresPin: true,
          resolve: (confirmed: boolean, pin?: string) =>
            resolve(confirmed ? pin || null : null),
        } satisfies ConfirmationRequest,
      }),
    ),
  );
export type Screen =
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
export const themes = {
  Pulse: {
    accent: "#a3cf24",
    accentInk: "#17202a",
    lightTint: "#eff7d7",
    darkTint: "#29351b",
    sidebar: "#17202a",
    sidebarHover: "#26343f",
  },
  Ocean: {
    accent: "#087f8c",
    accentInk: "#ffffff",
    lightTint: "#dceff1",
    darkTint: "#17363b",
    sidebar: "#102a31",
    sidebarHover: "#1a4149",
  },
  Ember: {
    accent: "#c45124",
    accentInk: "#ffffff",
    lightTint: "#f7e5de",
    darkTint: "#43271e",
    sidebar: "#2b1c18",
    sidebarHover: "#4a2d23",
  },
  Violet: {
    accent: "#7051bd",
    accentInk: "#ffffff",
    lightTint: "#ebe6f6",
    darkTint: "#302744",
    sidebar: "#211b31",
    sidebarHover: "#392e51",
  },
  Rose: {
    accent: "#b83e65",
    accentInk: "#ffffff",
    lightTint: "#f6e2e9",
    darkTint: "#40242f",
    sidebar: "#2c1b23",
    sidebarHover: "#482a37",
  },
  Gold: {
    accent: "#d2a117",
    accentInk: "#17202a",
    lightTint: "#f7efd5",
    darkTint: "#3c3219",
    sidebar: "#292419",
    sidebarHover: "#433a24",
  },
  Mint: {
    accent: "#147d5d",
    accentInk: "#ffffff",
    lightTint: "#def0e9",
    darkTint: "#18382f",
    sidebar: "#142a24",
    sidebarHover: "#20463b",
  },
  Sky: {
    accent: "#276db2",
    accentInk: "#ffffff",
    lightTint: "#e0ebf6",
    darkTint: "#1c3248",
    sidebar: "#172534",
    sidebarHover: "#243c53",
  },
  Coral: {
    accent: "#b84942",
    accentInk: "#ffffff",
    lightTint: "#f7e4e2",
    darkTint: "#412724",
    sidebar: "#2d1e1c",
    sidebarHover: "#4a302d",
  },
  Mono: {
    accent: "#59666e",
    accentInk: "#ffffff",
    lightTint: "#e7ebed",
    darkTint: "#2b3439",
    sidebar: "#1d252a",
    sidebarHover: "#303d44",
  },
} as const;
export type ThemeName = keyof typeof themes;
export function applyAppearance(theme: ThemeName, dark: boolean) {
  const token = themes[theme] || themes.Pulse;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.mode = dark ? "dark" : "light";
  root.style.setProperty("--accent", token.accent);
  root.style.setProperty("--accent-ink", token.accentInk);
  root.style.setProperty(
    "--accent-tint",
    dark ? token.darkTint : token.lightTint,
  );
  root.style.setProperty("--sidebar", token.sidebar);
  root.style.setProperty("--sidebar-hover", token.sidebarHover);
  const neutrals = dark
    ? {
        ink: "#F1F5F6",
        muted: "#A9B6BD",
        canvas: "#0D151B",
        surface: "#162129",
        raised: "#1E2B34",
        line: "#34444F",
      }
    : {
        ink: "#17222B",
        muted: "#65737C",
        canvas: "#F3F6F5",
        surface: "#FFFFFF",
        raised: "#EDF2F1",
        line: "#D7DFDD",
      };
  root.style.setProperty("--ink", neutrals.ink);
  root.style.setProperty("--muted", neutrals.muted);
  root.style.setProperty("--canvas", neutrals.canvas);
  root.style.setProperty("--surface", neutrals.surface);
  root.style.setProperty("--surface-raised", neutrals.raised);
  root.style.setProperty("--line", neutrals.line);
}
export const money = (n: number, s: any) =>
  new Intl.NumberFormat(s?.locale || "en-US", {
    style: "currency",
    currency: s?.currency || "USD",
  }).format(n / 100);
export const setupOptions = {
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

export function ToastHost() {
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
export function ConfirmationHost() {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const [credential, setCredential] = useState("");
  useEffect(() => {
    const show = (event: Event) => {
      setCredential("");
      setRequest((event as CustomEvent<ConfirmationRequest>).detail);
    };
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
        {request.requiresPin && (
          <Field
            autoFocus
            label="Current PIN"
            aria-label="Current PIN"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={credential}
            onChange={(event: any) =>
              setCredential(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
          />
        )}
        {request.phrase && (
          <Field
            autoFocus
            label={`Type ${request.phrase} to continue`}
            value={credential}
            onChange={(event: any) => setCredential(event.target.value)}
          />
        )}
        <footer>
          <button
            autoFocus={!request.requiresPin && !request.phrase}
            onClick={() => finish(false)}
          >
            Keep current
          </button>
          <button
            className={request.tone === "danger" ? "dangerAction" : "primary"}
            disabled={
              request.requiresPin
                ? !/^\d{6}$/.test(credential)
                : request.phrase
                  ? credential !== request.phrase
                  : false
            }
            onClick={() => finish(true)}
          >
            {request.confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
export class ErrorBoundary extends React.Component<
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
