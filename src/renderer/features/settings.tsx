// @ts-nocheck -- renderer records are validated at the IPC boundary.
// Renderer data is validated by shared IPC contracts before it reaches these views.
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FileText, Moon, Settings } from "lucide-react";
import { Field, Page, SelectField } from "../components/ui";
import { api, notifySuccess, confirmAction, confirmWithPin, themes, ThemeName, applyAppearance, setupOptions, appLogo } from "../app/runtime";
export function AppSettings({
  settings,
  refresh,
  user,
  preferences,
  setPreferences,
}: any) {
  const [theme, setTheme] = useState<ThemeName>(preferences.theme);
  const [dark, setDark] = useState(preferences.darkMode);
  const [saved, setSaved] = useState("");
  const [section, setSection] = useState<
    "appearance" | "business" | "documents"
  >("appearance");
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: settings,
  });
  const choose = async (name: ThemeName) => {
    const saved = await api("preferences:update", {
      theme: name,
      darkMode: dark,
    });
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
      <nav className="settingsNav" aria-label="Settings sections">
        <button
          className={section === "appearance" ? "active" : ""}
          onClick={() => setSection("appearance")}
        >
          Appearance
        </button>
        {user.role === "Owner" && (
          <>
            <button
              className={section === "business" ? "active" : ""}
              onClick={() => setSection("business")}
            >
              Gym & receipts
            </button>
            <button
              className={section === "documents" ? "active" : ""}
              onClick={() => setSection("documents")}
            >
              Member documents
            </button>
          </>
        )}
      </nav>
      <div className="settingsLayout">
        {section === "appearance" && (
          <section className="settingsCard settingsFeature">
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
                  <span className="themePreview">
                    <i style={{ background: themes[name].lightTint }} />
                    <i style={{ background: themes[name].darkTint }} />
                    <i style={{ background: themes[name].accent }} />
                  </span>
                  {name}
                </button>
              ))}
            </div>
          </section>
        )}
        {user.role === "Owner" && section === "business" && (
          <section className="settingsCard">
            <h2>Gym identity and receipts</h2>
            <p>
              Your logo and business details appear in the app and on new
              receipt snapshots.
            </p>
            <form
              onSubmit={handleSubmit(async (values) => {
                const authorizationPin = await confirmWithPin({
                  title: "Save critical gym settings?",
                  message:
                    "These changes affect gym identity, receipts, and regional formatting. Enter your current Owner PIN.",
                  confirmLabel: "Save changes",
                  tone: "danger",
                });
                if (!authorizationPin) return;
                try {
                  await api("settings:update", { ...values, authorizationPin });
                } catch {
                  return;
                }
                await refresh();
                setSaved("Settings saved.");
                notifySuccess("Gym settings saved.");
              })}
            >
              <div className="logoPicker">
                <div className="logoPreview">
                  <img
                    src={settings.logoDataUrl || appLogo}
                    alt="Current gym logo"
                  />
                </div>
                <div>
                  <b>Gym logo</b>
                  <small>
                    PNG or JPG with a transparent or white background works
                    best.
                  </small>
                  <div className="logoActions">
                    <button
                      type="button"
                      onClick={async () => {
                        const path = await api("settings:chooseLogo");
                        if (path) {
                          setValue("logoPath", path);
                          notifySuccess(
                            "Logo selected. Save changes to apply it.",
                          );
                        }
                      }}
                    >
                      Choose logo
                    </button>
                    {watch("logoPath") && (
                      <button
                        type="button"
                        onClick={() => setValue("logoPath", null)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <Field label="Gym name" {...register("gymName")} />
              <Field label="Address" {...register("address")} />
              <div className="grid2">
                <Field label="Phone" {...register("phone")} />
                <Field label="Email" type="email" {...register("email")} />
                <Field label="Tax or registration ID" {...register("taxId")} />
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
                <SelectField label="Currency" {...register("currency")}>
                  {setupOptions.currencies.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </div>
              <SelectField label="Timezone" {...register("timezone")}>
                {setupOptions.timezones.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <div className="receiptOptions">
                <label>
                  <span>Receipt paper</span>
                  <select {...register("receiptPaper")}>
                    <option value="A4">A4</option>
                    <option value="LETTER">US Letter</option>
                  </select>
                </label>
                <label>
                  <span>Receipt accent</span>
                  <input type="color" {...register("receiptColor")} />
                </label>
              </div>
              <label>
                <span>Receipt footer</span>
                <textarea maxLength={300} {...register("receiptFooter")} />
              </label>
              <label className="checkRow">
                <input
                  type="checkbox"
                  {...register("faceRecognitionEnabled")}
                />
                <span>
                  <b>Enable face recognition in kiosk</b>
                  <small>
                    Off by default. Only enable this after consent, camera, and
                    a local recognition provider are configured.
                  </small>
                </span>
              </label>
              <div className="kioskSettings">
                <h3>Kiosk presentation</h3>
                <p>
                  Set the public display timing and the PIN required to leave
                  locked fullscreen mode.
                </p>
                <div className="grid2">
                  <Field
                    label="Welcome message timeout (seconds)"
                    type="number"
                    min={3}
                    max={60}
                    {...register("kioskWelcomeTimeoutSeconds", {
                      valueAsNumber: true,
                    })}
                  />
                  <Field
                    label="Gym closing time"
                    type="time"
                    {...register("gymClosingTime")}
                  />
                  <Field
                    label={
                      settings.kioskExitPinConfigured
                        ? "New kiosk exit PIN (leave blank to keep current)"
                        : "Kiosk exit PIN"
                    }
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6 digits"
                    {...register("kioskExitPin")}
                  />
                </div>
              </div>
              <footer>
                <button className="primary">Save changes</button>
              </footer>
              {saved && <p className="success">{saved}</p>}
            </form>
          </section>
        )}
        {user.role === "Owner" && section === "documents" && (
          <DocumentRequirements />
        )}
      </div>
    </Page>
  );
}
export function DocumentRequirements() {
  const [requirements, setRequirements] = useState<any[]>([]);
  const [name, setName] = useState("");
  const load = () => api("documents:requirements").then(setRequirements);
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="settingsCard documentSettings">
      <h2>Member onboarding documents</h2>
      <p>
        New members must provide every document listed here. Files are stored
        inside the local OpenGym database rather than linked to removable
        originals.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (name.trim().length < 2) return;
          await api("documents:addRequirement", { name });
          setName("");
          await load();
          notifySuccess("Document requirement added.");
        }}
      >
        <div className="inlineAdd">
          <Field
            label="Document name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Medical fitness certificate"
          />
          <button className="primary" disabled={name.trim().length < 2}>
            Add requirement
          </button>
        </div>
      </form>
      <div className="requirementList">
        {requirements.map((requirement) => (
          <div key={requirement.id}>
            <FileText />
            <span>{requirement.name}</span>
            <button
              onClick={async () => {
                if (
                  !(await confirmAction({
                    title: "Remove this requirement?",
                    message:
                      "New members will no longer need to present this document. Existing stored files remain preserved.",
                    confirmLabel: "Remove requirement",
                    tone: "danger",
                  }))
                )
                  return;
                await api("documents:archiveRequirement", {
                  id: requirement.id,
                });
                await load();
              }}
            >
              Remove
            </button>
          </div>
        ))}
        {!requirements.length && <p>No documents are required yet.</p>}
      </div>
    </section>
  );
}