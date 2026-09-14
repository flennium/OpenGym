import { app, dialog } from "electron";
import { mkdirSync, copyFileSync, createWriteStream, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import PDFDocument from "pdfkit";
import {
  auditQuerySchema, reportExportSchema, reportRangeSchema, memberSchema,
  paymentSchema, planSchema, settingsSchema, preferencesSchema,
  documentRequirementSchema, staffSchema,
} from "../../shared/contracts.js";

export function registerOperationsHandlers(ctx: any) {
  const register: (channel: string, fn: (payload: any) => any) => void = ctx.register;
  const { store, auth, owner, authorizeCurrent, publicBranding, applyWindowLogo, faces, win } = ctx;
  register("plans:list", () => {
    auth();
    return store.plans();
  });
  register("plans:save", (p) => {
    const s = auth();
    return store.savePlan(planSchema.parse(p.data), p.id, s.id);
  });
  register("plans:archive", (p) => {
    const s = auth();
    authorizeCurrent(p.authorizationPin);
    store.archivePlan(p.id, s.id);
    return true;
  });
  register("memberships:list", () => {
    auth();
    return store.memberships();
  });
  register("memberships:assign", (p) => {
    const s = auth();
    return store.assign(p.memberId, p.planId, p.startDate, !!p.autoRenew, s.id);
  });
  register("memberships:action", (p) => {
    const s = auth();
    if (p.action === "cancel") authorizeCurrent(p.authorizationPin);
    store.membershipAction(p.id, p.action, s.id);
    return true;
  });
  register("memberships:freezeHistory", (p) => {
    auth();
    return store.membershipFreezeHistory(Number(p?.id));
  });
  register("attendance:list", () => {
    auth();
    return store.attendance();
  });
  register("attendance:checkIn", (p) => {
    const s = auth();
    return store.checkIn(p.memberId, s.id);
  });
  register("attendance:checkOut", (p) => {
    const s = auth();
    store.checkOut(p.id, s.id);
    return true;
  });
  register("kiosk:checkInByCode", (p) => {
    const s = auth();
    const code = String(p?.code || "");
    if (!/^\d{10}$/.test(code.trim()))
      throw new Error("Scan a valid 10-digit member chip ID");
    return store.kioskCheckIn(code, s.id);
  });
  register("kiosk:recognizeFace", async (p) => {
    const s = auth();
    if (!(store.settings() as any).faceRecognitionEnabled)
      throw new Error("Face recognition is disabled by the Owner");
    const probe = await faces.embedding(String(p?.imageDataUrl || ""));
    const match = faces.match(probe.embedding, store.faceTemplates());
    if (!match)
      throw new Error(
        "Face not recognized. Use your member key or ask reception.",
      );
    return store.kioskCheckInMember(match.memberId, s.id, "face");
  });
  register("kiosk:enterPresentation", () => {
    owner();
    const settings = store.settings() as any;
    if (!settings.kioskExitPinConfigured)
      throw new Error(
        "Set a kiosk exit PIN in Settings before starting presentation mode",
      );
    win.setFullScreen(true);
    win.setAlwaysOnTop(true, "screen-saver");
    return true;
  });
  register("kiosk:exitPresentation", (p) => {
    owner();
    const value = String(p?.pin || "");
    if (!/^\d{6}$/.test(value) || !store.verifyKioskExitPin(value))
      throw new Error("Kiosk exit PIN is incorrect");
    win.setAlwaysOnTop(false);
    win.setFullScreen(false);
    return true;
  });
  register("payments:list", () => {
    auth();
    return store.payments();
  });
  register("payments:record", (p) => {
    const s = auth(),
      x = paymentSchema.parse(p);
    return store.pay(x.membershipId, x.amountMinor, x.method, s.id);
  });
  register("payments:refund", (p) => {
    const s = owner();
    authorizeCurrent(p.authorizationPin);
    store.refund(p.id, s.id);
    return true;
  });
}
