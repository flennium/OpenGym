import { app, dialog, shell } from "electron";
import { mkdirSync, copyFileSync, createWriteStream, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import PDFDocument from "pdfkit";
import {
  auditQuerySchema, reportExportSchema, reportRangeSchema, memberSchema,
  paymentSchema, planSchema, settingsSchema, preferencesSchema,
  documentRequirementSchema, staffSchema,
} from "../../shared/contracts.js";

export function registerMemberHandlers(ctx: any) {
  const register: (channel: string, fn: (payload: any) => any) => void = ctx.register;
  const { store, auth, owner, authorizeCurrent, publicBranding, applyWindowLogo, faces, win } = ctx;
  register("members:list", (p) => {
    auth();
    return store.listMembers(p?.search ?? "");
  });
  register("members:get", (p) => {
    auth();
    const result = store.member(p.id) as any;
    const photo = store.memberPhoto(p.id);
    result.member.photoDataUrl =
      photo?.data && photo.mime
        ? `data:${photo.mime};base64,${photo.data.toString("base64")}`
        : null;
    result.member.documents = result.documents;
    return result;
  });
  register("members:save", (p) => {
    const s = auth();
    return store.saveMember(memberSchema.parse(p.data), p.id, s.id);
  });
  register("members:archive", (p) => {
    const s = auth();
    authorizeCurrent(p.authorizationPin);
    store.archiveMember(p.id, s.id);
    return true;
  });
  register("members:history", (p) => {
    auth();
    return store.history("member", p.id);
  });
  register("faces:status", () => {
    auth();
    return {
      ...faces.status(),
      enabled: !!(store.settings() as any).faceRecognitionEnabled,
    };
  });
  register("faces:memberStatus", (p) => {
    auth();
    return store.faceStatus(Number(p?.memberId));
  });
  register("faces:enroll", async (p) => {
    const s = auth();
    if (p?.consent !== true)
      throw new Error("Member consent is required before face enrollment");
    const result = await faces.embedding(String(p?.imageDataUrl || ""));
    const duplicate = faces.match(
      result.embedding,
      store
        .faceTemplates()
        .filter((template: any) => template.memberId !== p.memberId),
    );
    if (duplicate && duplicate.score >= 0.62)
      throw new Error("This face is already enrolled for another member");
    store.saveFaceTemplate(
      Number(p.memberId),
      result.embedding,
      result.quality,
      s.id,
    );
    return store.faceStatus(Number(p.memberId));
  });
  register("faces:remove", (p) => {
    const s = owner();
    authorizeCurrent(p?.authorizationPin);
    store.removeFaceTemplate(Number(p?.memberId), s.id);
    return true;
  });
  register("members:choosePhoto", async () => {
    auth();
    const r = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (r.canceled) return null;
    const sourceSize = (await import("node:fs/promises")).stat(r.filePaths[0]);
    if ((await sourceSize).size > 8 * 1024 * 1024)
      throw new Error("Member photo must be 8 MB or smaller");
    const dir = join(app.getPath("userData"), "member-photos");
    mkdirSync(dir, { recursive: true });
    const ext = r.filePaths[0].split(".").pop()?.toLowerCase() || "jpg";
    const target = join(dir, `${Date.now()}-${randomUUID()}.${ext}`);
    copyFileSync(r.filePaths[0], target);
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";
    return {
      path: target,
      dataUrl: `data:${mime};base64,${readFileSync(target).toString("base64")}`,
    };
  });
  register("documents:requirements", () => {
    auth();
    return store.documentRequirements();
  });
  register("documents:addRequirement", (p) => {
    const s = owner();
    return store.addDocumentRequirement(
      documentRequirementSchema.parse(p).name,
      s.id,
    );
  });
  register("documents:archiveRequirement", (p) => {
    const s = owner();
    store.archiveDocumentRequirement(p.id, s.id);
    return true;
  });
  register("members:chooseDocument", async () => {
    auth();
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [
        { name: "Member document", extensions: ["pdf", "png", "jpg", "jpeg"] },
      ],
    });
    if (result.canceled) return null;
    if (statSync(result.filePaths[0]).size > 12 * 1024 * 1024)
      throw new Error("Member document must be 12 MB or smaller");
    return {
      path: result.filePaths[0],
      name: result.filePaths[0].split(/[\\/]/).pop(),
    };
  });
  register("members:openDocument", async (p) => {
    auth();
    const document = store.memberDocument(p.id, p.memberId);
    if (!document) throw new Error("Member document not found");
    const dir = join(app.getPath("userData"), "document-previews");
    mkdirSync(dir, { recursive: true });
    const safeName = document.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const target = join(dir, `${p.id}-${safeName}`);
    writeFileSync(target, document.data);
    await shell.openPath(target);
    return true;
  });
}
