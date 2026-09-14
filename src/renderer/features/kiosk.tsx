// @ts-nocheck -- renderer records are validated at the IPC boundary.
// Renderer data is validated by shared IPC contracts before it reaches these views.
import React, { useEffect, useRef, useState } from "react";
import { Camera, ScanLine, ShieldCheck } from "lucide-react";
import { Field, Modal, Page } from "../components/ui";
import { api, notifySuccess } from "../app/runtime";
import { FaceCapture } from "./members";
export function playKioskSound(kind: "welcome" | "denied") {
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    const context = new AudioContextClass();
    const notes =
      kind === "welcome"
        ? [
            { frequency: 523.25, start: 0, duration: 0.2 },
            { frequency: 659.25, start: 0.09, duration: 0.24 },
            { frequency: 783.99, start: 0.18, duration: 0.34 },
          ]
        : [
            { frequency: 392, start: 0, duration: 0.22 },
            { frequency: 293.66, start: 0.18, duration: 0.32 },
          ];
    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === "welcome" ? "sine" : "triangle";
      oscillator.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + note.start);
      gain.gain.exponentialRampToValueAtTime(
        kind === "welcome" ? 0.055 : 0.045,
        context.currentTime + note.start + 0.025,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + note.start + note.duration,
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + note.start);
      oscillator.stop(context.currentTime + note.start + note.duration);
    }
    window.setTimeout(() => void context.close(), 800);
  } catch {
    // Visual feedback remains available if this kiosk has no audio output.
  }
}
export function Kiosk({
  settings,
  presentation,
  onEnterPresentation,
  onExitPresentation,
}: any) {
  const scannerBuffer = useRef("");
  const lastKeyAt = useRef(0);
  const [result, setResult] = useState<any>(null);
  const [denied, setDenied] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showExit, setShowExit] = useState(false);
  const [exitPin, setExitPin] = useState("");
  const [mode, setMode] = useState<"chip" | "face">("chip");
  const [showCamera, setShowCamera] = useState(false);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    if (!result && !denied) return;
    const timer = window.setTimeout(
      () => {
        setResult(null);
        setDenied("");
      },
      (settings.kioskWelcomeTimeoutSeconds || 8) * 1000,
    );
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
    } finally {
      setBusy(false);
      setCooldown(3);
    }
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        mode !== "chip" ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
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
        else {
          setResult(null);
          setDenied("The scanner did not send a valid 10-digit chip ID.");
          playKioskSound("denied");
        }
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, cooldown, mode]);
  const recognizeFace = async (imageDataUrl: string) => {
    setShowCamera(false);
    if (busy || cooldown) return;
    setBusy(true);
    try {
      const data = await api("kiosk:recognizeFace", { imageDataUrl });
      setResult(data);
      setDenied("");
      playKioskSound("welcome");
    } catch (error: any) {
      setResult(null);
      setDenied(error.message || "Face not recognized");
      playKioskSound("denied");
    } finally {
      setBusy(false);
      setCooldown(3);
    }
  };
  const daysLeft =
    result?.membership?.end_date && result.membership.end_date !== "9999-12-31"
      ? Math.ceil(
          (new Date(`${result.membership.end_date}T23:59:59`).getTime() -
            Date.now()) /
            86400000,
        )
      : null;
  return (
    <Page
      title={presentation ? settings.gymName : "Member kiosk"}
      action={
        !presentation && (
          <button className="primary" onClick={onEnterPresentation}>
            <ShieldCheck /> Start presentation mode
          </button>
        )
      }
    >
      <section className="kioskPanel">
        <header className="kioskHeader">
          <div>
            <small>Today’s closing time</small>
            <strong>{settings.gymClosingTime || "22:00"}</strong>
          </div>
          {presentation && (
            <button className="kioskExit" onClick={() => setShowExit(true)}>
              Exit kiosk
            </button>
          )}
        </header>
        <div className="kioskModes">
          <button
            className={mode === "chip" ? "active" : ""}
            onClick={() => setMode("chip")}
          >
            <ScanLine /> Scan member key
          </button>
          {settings.faceRecognitionEnabled && (
            <button
              className={mode === "face" ? "active" : ""}
              onClick={() => {
                setMode("face");
                setShowCamera(true);
              }}
            >
              <Camera /> Recognize face
            </button>
          )}
        </div>
        <div className="kioskScanner">
          {mode === "chip" ? <ScanLine size={42} /> : <Camera size={42} />}
          <h2>
            {mode === "chip"
              ? "Scan your OpenGym key"
              : "Identify with your face"}
          </h2>
          <p>
            {mode === "chip"
              ? "Ready for a USB, RFID, NFC, or barcode scanner operating in keyboard/HID mode. Scan the member chip—no typing is required."
              : "The camera runs only while identifying you. Center your face, then capture when ready."}
          </p>
          {mode === "face" && (
            <button
              className="primary kioskCameraAction"
              disabled={busy || !!cooldown}
              onClick={() => setShowCamera(true)}
            >
              <Camera /> Open camera
            </button>
          )}
          <div
            className={`scannerState ${busy || cooldown ? "waiting" : "ready"}`}
          >
            <span />
            {busy
              ? "Checking membership…"
              : cooldown
                ? `Please wait ${cooldown}s`
                : "Scanner ready"}
          </div>
          {cooldown > 0 && (
            <small className="kioskCooldown" role="status">
              Ready for the next scan in {cooldown} second
              {cooldown === 1 ? "" : "s"}.
            </small>
          )}
        </div>
        {denied && (
          <article className="kioskDenied" role="alert">
            <ShieldCheck />
            <div>
              <strong>Access denied</strong>
              <span>{denied}</span>
            </div>
          </article>
        )}
        {result && (
          <article className="kioskResult" role="status">
            <div className="liveDot" />
            <div>
              <small>CHECKED IN</small>
              <h2>{result.memberName}</h2>
              <p>{new Date(result.checkedInAt).toLocaleTimeString()}</p>
            </div>
            <div className="kioskMembership">
              <small>MEMBERSHIP</small>
              <strong>{result.membership?.plan_name || "No membership"}</strong>
              {result.membership?.end_date === "9999-12-31" ? (
                <span>No calendar expiry</span>
              ) : daysLeft === null ? (
                <span>Ask reception for membership details</span>
              ) : daysLeft >= 0 ? (
                <span>
                  {daysLeft} day{daysLeft === 1 ? "" : "s"} left · ends{" "}
                  {result.membership.end_date}
                </span>
              ) : (
                <span className="critical">
                  Expired {result.membership.end_date}
                </span>
              )}
              {result.membership?.remaining_minutes != null && (
                <span>
                  {(result.membership.remaining_minutes / 60).toFixed(1)}{" "}
                  training hours remaining
                </span>
              )}
            </div>
          </article>
        )}
      </section>
      {showCamera && (
        <FaceCapture
          title="Kiosk face recognition"
          onCapture={recognizeFace}
          onClose={() => {
            setShowCamera(false);
            if (!presentation) setMode("chip");
          }}
        />
      )}
      {showExit && (
        <Modal
          title="Exit presentation mode"
          onClose={() => {
            setShowExit(false);
            setExitPin("");
          }}
        >
          <p className="modalCopy">
            Enter the six-digit kiosk exit PIN configured by the Owner.
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await onExitPresentation(exitPin);
                setShowExit(false);
                setExitPin("");
              } catch {
                /* global error */
              }
            }}
          >
            <Field
              label="Kiosk exit PIN"
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={exitPin}
              onChange={(event) =>
                setExitPin(event.target.value.replace(/\D/g, ""))
              }
            />
            <footer>
              <button type="button" onClick={() => setShowExit(false)}>
                Cancel
              </button>
              <button className="primary" disabled={exitPin.length !== 6}>
                Unlock and exit
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </Page>
  );
}