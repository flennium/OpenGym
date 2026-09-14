// @ts-nocheck -- renderer records are validated at the IPC boundary.
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ShieldCheck } from "lucide-react";
import { Field, SelectField } from "../components/ui";
import { api, appLogo, setupOptions } from "../app/runtime";
const setupZ = z.object({
  gymName: z.string().min(2),
  ownerName: z.string().min(2),
  pin: z.string().regex(/^\d{6}$/),
  locale: z.string(),
  currency: z.string().length(3),
  timezone: z.string(),
});
export function Setup({ done }: any) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(setupZ),
    defaultValues: {
      locale: ["en-DZ", "ar-DZ", "fr-DZ", "en-US", "en-GB", "fr-FR"].includes(
        navigator.language,
      )
        ? navigator.language
        : "en-DZ",
      currency: "DZD",
      timezone: setupOptions.timezones.some(
        ([value]) => value === Intl.DateTimeFormat().resolvedOptions().timeZone,
      )
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "Africa/Algiers",
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
            <SelectField
              label="Currency"
              {...register("currency")}
              error={errors.currency?.message}
            >
              {setupOptions.currencies.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Language and formatting"
              {...register("locale")}
            >
              {setupOptions.locales.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <SelectField label="Timezone" {...register("timezone")}>
              {setupOptions.timezones.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
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
export function BrandMark({ branding, className = "" }: any) {
  return branding?.logoDataUrl ? (
    <img
      className={`brandMark ${className}`}
      src={branding.logoDataUrl}
      alt={`${branding.gymName} logo`}
    />
  ) : (
    <img
      className={`brandMark ${className}`}
      src={appLogo}
      alt="OpenGym logo"
    />
  );
}
export function Login({ done, branding }: any) {
  const [staff, setStaff] = useState<any[]>([]),
    [id, setId] = useState(0),
    [pin, setPin] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    api("session:staff")
      .then((x: any) => {
        setStaff(x);
        setId(x[0]?.id || 0);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id) return setError("Choose a staff account.");
    if (!/^\d{6}$/.test(pin))
      return setError("Enter your six-digit numeric PIN.");
    setSubmitting(true);
    setError("");
    try {
      await api("session:signIn", { staffId: id, pin });
      done();
    } catch (e: any) {
      setError(e.message);
      setPin("");
    } finally {
      setSubmitting(false);
    }
  };
  const selected = staff.find((person) => person.id === id);
  return (
    <main className="loginGate">
      <section className="loginIdentity">
        <div className="loginBrand">
          <BrandMark branding={branding} />
          <span>{branding?.gymName || "OpenGym"}</span>
        </div>
        <div className="loginMessage">
          <span className="deskStatus">
            <i /> Front desk ready
          </span>
          <h1>Your members are waiting.</h1>
          <p>
            Sign in securely to manage today’s visits, memberships, and
            payments.
          </p>
        </div>
        <small>Local workspace · Your data stays on this computer</small>
      </section>
      <section className="loginWorkspace">
        <form className="loginPanel" onSubmit={signIn} noValidate>
          <div className="loginShield">
            <ShieldCheck />
          </div>
          <div>
            <h2>Staff sign in</h2>
            <p>Choose your account and enter your PIN.</p>
          </div>
          {loading ? (
            <div className="loginLoading">Loading staff accounts…</div>
          ) : staff.length ? (
            <>
              <label>
                <span>Staff account</span>
                <select
                  aria-label="Staff account"
                  value={id}
                  onChange={(e) => {
                    setId(+e.target.value);
                    setError("");
                  }}
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.role}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <div className="selectedStaff">
                  <span>{selected.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <b>{selected.name}</b>
                    <small>{selected.role}</small>
                  </div>
                </div>
              )}
              <Field
                label="Six-digit PIN"
                aria-label="PIN"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={6}
                value={pin}
                onChange={(e: any) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
              />
              {error && (
                <div className="loginError" role="alert">
                  {error}
                </div>
              )}
              <button className="primary loginSubmit" disabled={submitting}>
                {submitting ? "Checking PIN…" : "Open front desk"}
              </button>
            </>
          ) : (
            <div className="loginError" role="alert">
              {error ||
                "No active staff accounts are available. Restore a backup or contact the gym owner."}
            </div>
          )}
          <small className="loginHelp">
            Five incorrect attempts temporarily lock this account for 30
            seconds.
          </small>
        </form>
      </section>
    </main>
  );
}

