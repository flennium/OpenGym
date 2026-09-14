// @ts-nocheck -- renderer records are validated at the IPC boundary.
// Renderer data is validated by shared IPC contracts before it reaches these views.
import React, { lazy, Suspense, useEffect, useState } from "react";
import { Activity, Archive, CalendarClock, CreditCard, Dumbbell, LogOut, Menu, RefreshCw, Search, ScanLine, ScrollText, Settings, ShieldCheck, Users, X } from "lucide-react";
import { api, Screen, applyAppearance, ToastHost, ConfirmationHost, appLogo } from "../app/runtime";
import { Kiosk } from "./kiosk";

const Dashboard = lazy(() => import("./dashboard").then((module) => ({ default: module.Dashboard })));
const Members = lazy(() => import("./members").then((module) => ({ default: module.Members })));
const Plans = lazy(() => import("./memberships").then((module) => ({ default: module.Plans })));
const Memberships = lazy(() => import("./memberships").then((module) => ({ default: module.Memberships })));
const Attendance = lazy(() => import("./attendance").then((module) => ({ default: module.Attendance })));
const Payments = lazy(() => import("./payments").then((module) => ({ default: module.Payments })));
const Staff = lazy(() => import("./staff").then((module) => ({ default: module.Staff })));
const Reports = lazy(() => import("./reports").then((module) => ({ default: module.Reports })));
const AuditLog = lazy(() => import("./audit").then((module) => ({ default: module.AuditLog })));
const AppSettings = lazy(() => import("./settings").then((module) => ({ default: module.AppSettings })));
const Backup = lazy(() => import("./backup").then((module) => ({ default: module.Backup })));
export function CommandPalette({ items, onChoose, onClose }: any) {
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
export function Shell({ logout }: any) {
  const [screen, setScreen] = useState<Screen>("Dashboard"),
    [user, setUser] = useState<any>(),
    [settings, setSettings] = useState<any>(),
    [preferences, setPreferences] = useState<any>(),
    [permissions, setPermissions] = useState<any[]>([]),
    [menuOpen, setMenuOpen] = useState(false),
    [commandOpen, setCommandOpen] = useState(false),
    [kioskPresentation, setKioskPresentation] = useState(false);
  const refreshSettings = () => api("settings:get").then(setSettings);
  const refreshPreferences = () =>
    api("preferences:get").then((value: any) => {
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
        <img className="brandMark" src={appLogo} alt="" /> Opening the front
        desk…
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
  if (kioskPresentation)
    return (
      <div className="kioskPresentation">
        <Kiosk
          settings={settings}
          presentation
          onExitPresentation={async (pin: string) => {
            await api("kiosk:exitPresentation", { pin });
            setKioskPresentation(false);
          }}
        />
        <ConfirmationHost />
        <ToastHost />
      </div>
    );
  return (
    <div className="shell">
      <button
        className="mobileMenu"
        aria-label="Open navigation"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <Menu />
      </button>
      {menuOpen && (
        <button
          className="navScrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={menuOpen ? "open" : ""}>
        <button
          className="navClose"
          aria-label="Close navigation menu"
          onClick={() => setMenuOpen(false)}
        >
          <X />
        </button>
        <div className="brand inverse">
          <img
            className="shellLogo"
            src={settings.logoDataUrl || appLogo}
            alt=""
          />
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
      <Suspense fallback={<main className="page"><p className="muted">Loading workspace…</p></main>}>
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
        <Kiosk
          settings={settings}
          onEnterPresentation={async () => {
            try {
              await api("kiosk:enterPresentation");
              setKioskPresentation(true);
            } catch {
              /* global error */
            }
          }}
        />
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
      </Suspense>
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
