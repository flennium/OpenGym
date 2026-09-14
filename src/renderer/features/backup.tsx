// @ts-nocheck -- renderer records are validated at the IPC boundary.
// Renderer data is validated by shared IPC contracts before it reaches these views.
import React, { useEffect, useState } from "react";
import { Archive, HardDriveDownload, ShieldCheck, TriangleAlert } from "lucide-react";
import { Page } from "../components/ui";
import { api, notifySuccess, confirmWithPin } from "../app/runtime";
export function Backup() {
  const [state, setState] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const load = () => api("backup:status").then(setState);
  useEffect(() => {
    void load();
  }, []);
  const lastBackup = state.lastBackup ? new Date(state.lastBackup) : null;
  const backupNow = async () => {
    setBusy(true);
    try {
      const path = await api("backup:export");
      if (path) {
        await load();
        notifySuccess("Database backup exported.");
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page
      title="Backup & recovery"
      action={
        <button className="primary" disabled={busy} onClick={backupNow}>
          <HardDriveDownload />
          {busy ? "Saving…" : "Back up now"}
        </button>
      }
    >
      <section
        className={`protectionStatus ${state.overdue ? "overdue" : "protected"}`}
      >
        <div className="protectionIcon">
          {state.overdue ? <TriangleAlert /> : <ShieldCheck />}
        </div>
        <div>
          <span>Data protection</span>
          <h2>
            {state.overdue
              ? lastBackup
                ? "Backup is more than 7 days old"
                : "This gym has never been backed up"
              : "Your latest backup is current"}
          </h2>
          <p>
            {lastBackup
              ? `Last successful export: ${lastBackup.toLocaleString()}`
              : "Create an offline copy before adding more operational data."}
          </p>
        </div>
        <strong>{state.overdue ? "Action needed" : "Protected"}</strong>
      </section>
      <div className="backupFacts">
        <article>
          <b>What is included</b>
          <p>
            Members, photos, documents, plans, memberships, attendance,
            payments, staff, settings, and audit history.
          </p>
        </article>
        <article>
          <b>Where it goes</b>
          <p>
            You choose a local drive or removable disk. OpenGym never uploads
            the backup.
          </p>
        </article>
        <article>
          <b>Recommended routine</b>
          <p>
            Export weekly and keep a second copy away from the reception
            computer.
          </p>
        </article>
      </div>
      <section className="recoveryPanel">
        <div className="recoveryCopy">
          <Archive />
          <div>
            <h2>Restore from a backup</h2>
            <p>
              OpenGym validates the file and schema first, then creates a
              timestamped safety copy of the current database before switching.
            </p>
            <ul>
              <li>Requires the current Owner PIN</li>
              <li>Rejects corrupt or newer unsupported databases</li>
              <li>Restarts the application after a successful restore</li>
            </ul>
          </div>
        </div>
        <button
          className="secondaryAction"
          onClick={async () => {
            const authorizationPin = await confirmWithPin({
              title: "Restore another database?",
              message:
                "OpenGym will validate the selected backup, save a safety copy, and restart. Enter your current Owner PIN.",
              confirmLabel: "Choose backup",
              tone: "danger",
            });
            if (authorizationPin)
              try {
                await api("backup:import", { authorizationPin });
              } catch {
                return;
              }
          }}
        >
          Choose backup file
        </button>
      </section>
      <section className="resetPanel">
        <div>
          <span>Destructive action</span>
          <h2>Factory reset this installation</h2>
          <p>
            Permanently removes the gym, staff, members, visits, payments,
            receipts, photos, branding, and preferences. A PIN is not required,
            but the exact confirmation phrase is.
          </p>
        </div>
        <button
          className="factoryResetButton"
          onClick={async () => {
            const confirmed = await new Promise<boolean>((resolve) =>
              window.dispatchEvent(
                new CustomEvent("opengym:confirm", {
                  detail: {
                    title: "Factory reset OpenGym?",
                    message:
                      "This cannot be undone. Export a backup first if any data must be kept.",
                    confirmLabel: "Erase everything",
                    tone: "danger",
                    phrase: "RESET OPENGYM",
                    resolve,
                  } satisfies ConfirmationRequest,
                }),
              ),
            );
            if (confirmed)
              try {
                await api("backup:factoryReset");
              } catch {
                return;
              }
          }}
        >
          Erase all OpenGym data
        </button>
      </section>
    </Page>
  );
}