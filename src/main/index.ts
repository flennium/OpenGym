import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell } from "electron";
import {
  mkdirSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { GymDatabase, hashPin, verifyPin } from "./database.js";
import { removeManagedData } from "./factory-reset.js";
import { stageDatabaseReplacement } from "./recovery.js";
import {
  auditQuerySchema,
  reportExportSchema,
  reportRangeSchema,
  memberSchema,
  paymentSchema,
  planSchema,
  settingsSchema,
  preferencesSchema,
  documentRequirementSchema,
  setupSchema,
  signInSchema,
  staffSchema,
} from "../shared/contracts.js";
let win: BrowserWindow;
let store: GymDatabase;
let session: any = null;
let duplicateLaunchPending = false;
let duplicatePromptOpen = false;
const attempts = new Map<number, { n: number; until: number }>();
const ok = (data: any = null) => ({ ok: true, data });
const fail = (e: any) => ({
  ok: false,
  error: {
    code:
      e?.code === "SQLITE_CONSTRAINT_UNIQUE" ? "CONFLICT" : "INVALID_OPERATION",
    message: e instanceof Error ? e.message : "Operation failed",
  },
});
const owner = () => {
  if (!session) throw new Error("Sign in required");
  if (session.role !== "Owner") throw new Error("Owner access required");
  return session;
};
const auth = () => {
  if (!session) throw new Error("Sign in required");
  return session;
};
const authorizeCurrent = (pin: unknown) => {
  const s = auth();
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) throw new Error("Current PIN required");
  const row = store.db.prepare("SELECT pin_hash FROM staff WHERE id=? AND archived_at IS NULL").get(s.id) as any;
  if (!row || !verifyPin(pin, row.pin_hash)) throw new Error("Current PIN is incorrect");
  return s;
};
const permissionFor = (
  channel: string,
  p: any,
): [string, "view" | "create" | "edit" | "delete"] | null => {
  const [group, action] = channel.split(":");
  if (group === "export") {
    const module = {
      members: "Members",
      attendance: "Attendance",
      payments: "Payments",
    }[p?.module as string];
    return module ? [module, "view"] : null;
  }
  const module = {
    members: "Members",
    plans: "Memberships",
    memberships: "Memberships",
    attendance: "Attendance",
    payments: "Payments",
    staff: "Staff",
    permissions: "Staff",
    reports: "Reports",
  }[group];
  if (!module) return null;
  const kind =
    action === "list" || action === "get" || action === "history"
      ? "view"
      : action === "archive"
        ? "delete"
        : action === "save"
          ? p?.id
            ? "edit"
            : "create"
          : action === "refund" ||
              action === "action" ||
              action === "checkOut" ||
              action === "resetPin" ||
              action === "update"
            ? "edit"
            : "create";
  return [module, kind];
};
const register = (channel: string, fn: (p: any) => any) =>
  ipcMain.handle(channel, async (_e, p) => {
    try {
      const rule = permissionFor(channel, p);
      if (rule) {
        const s = auth();
        if (!store.hasPermission(s.roleId, rule[0], rule[1]))
          throw new Error(
            `Your role cannot ${rule[1]} ${rule[0].toLowerCase()}`,
          );
      }
      return ok(await fn(p));
    } catch (e) {
      return fail(e);
    }
  });
const publicBranding = () => {
  const settings = store.settings() as any;
  let logoDataUrl: string | null = null;
  if (settings.logoPath && existsSync(settings.logoPath)) {
    const ext = settings.logoPath.split(".").pop()?.toLowerCase();
    const mime = ext === "png" ? "image/png" : "image/jpeg";
    logoDataUrl = `data:${mime};base64,${readFileSync(settings.logoPath).toString("base64")}`;
  }
  return { gymName: settings.gymName, logoDataUrl };
};
const applyWindowLogo = () => {
  const configuredLogo = store?.isSetup() ? (store.settings() as any).logoPath : null;
  const logoPath = configuredLogo && existsSync(configuredLogo)
    ? configuredLogo
    : join(app.getAppPath(), "logo.png");
  if (!existsSync(logoPath)) return;
  const icon = nativeImage.createFromPath(logoPath);
  if (icon.isEmpty()) return;
  win?.setIcon(icon);
  if (process.platform === "darwin") app.dock?.setIcon(icon);
};
const showAlreadyRunning = () => {
  if (!win || win.isDestroyed()) {
    duplicateLaunchPending = true;
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (duplicatePromptOpen) return;
  duplicatePromptOpen = true;
  void dialog.showMessageBox(win, {
    type: "warning",
    title: "OpenGym is already running",
    message: "OpenGym is already open",
    detail: "The existing window has been brought to the front. OpenGym allows one running instance so your local database stays safe.",
    buttons: ["Return to OpenGym"],
    defaultId: 0,
    noLink: true,
  }).finally(() => { duplicatePromptOpen = false; });
};
function handlers() {
  register("setup:status", () => ({ complete: store.isSetup() }));
  register("setup:branding", () => {
    if (!store.isSetup()) return { gymName: "OpenGym", logoDataUrl: null };
    return publicBranding();
  });
  register("setup:create", (p) => {
    store.setup(setupSchema.parse(p));
    return true;
  });
  register("session:staff", () =>
    store.staff().filter((x: any) => !x.archivedAt),
  );
  register("session:current", () => session);
  register("session:permissions", () => {
    const s = auth();
    return store.permissions().filter((row: any) => row.roleId === s.roleId);
  });
  register("session:signOut", () => {
    const s = auth();
    store.log(s.id, "session", s.id, "signed_out");
    session = null;
    return true;
  });
  register("session:signIn", (p) => {
    const x = signInSchema.parse(p);
    const a = attempts.get(x.staffId);
    if (a && a.until > Date.now())
      throw new Error("Too many attempts. Try again shortly.");
    const s = store.signIn(x.staffId, x.pin);
    if (!s) {
      const n = (a?.n ?? 0) + 1;
      attempts.set(x.staffId, { n, until: n >= 5 ? Date.now() + 30000 : 0 });
      throw new Error("Incorrect PIN");
    }
    attempts.delete(x.staffId);
    session = s;
    store.log(s.id, "session", s.id, "signed_in");
    return s;
  });
  register("staff:list", () => {
    auth();
    return store.staff();
  });
  register("staff:create", (p) => {
    const s = owner(),
      x = staffSchema.parse(p),
      t = new Date().toISOString();
    const id = Number(
      store.db
        .prepare(
          "INSERT INTO staff(name,role_id,pin_hash,created_at,updated_at) VALUES(?,?,?,?,?)",
        )
        .run(x.name, x.roleId, hashPin(x.pin), t, t).lastInsertRowid,
    );
    store.log(s.id, "staff", id, "created");
    return id;
  });
  register("staff:archive", (p) => {
    const s = owner();
    authorizeCurrent(p.authorizationPin);
    if (p.id === s.id)
      throw new Error("You cannot archive your current account");
    store.db.transaction(() => {
      store.db
        .prepare(
          "UPDATE staff SET archived_at=?,updated_at=? WHERE id=? AND role_id<>1",
        )
        .run(new Date().toISOString(), new Date().toISOString(), p.id);
      store.log(s.id, "staff", p.id, "archived");
    })();
    return true;
  });
  register("staff:resetPin", (p) => {
    const s = owner();
    authorizeCurrent(p.authorizationPin);
    const value = staffSchema.shape.pin.parse(p.pin);
    store.db.transaction(() => {
      store.db
        .prepare("UPDATE staff SET pin_hash=?,updated_at=? WHERE id=?")
        .run(hashPin(value), new Date().toISOString(), p.id);
      store.log(s.id, "staff", p.id, "pin_reset");
    })();
    return true;
  });
  register("permissions:list", () => {
    owner();
    return store.permissions();
  });
  register("permissions:update", (p) => {
    const s = owner();
    authorizeCurrent(p.authorizationPin);
    store.setPermission(p.roleId, p.module, p.action, !!p.allowed, s.id);
    return true;
  });
  register("members:list", (p) => {
    auth();
    return store.listMembers(p?.search ?? "");
  });
  register("members:get", (p) => {
    auth();
    const result = store.member(p.id) as any;
    const photo = store.memberPhoto(p.id);
    result.member.photoDataUrl = photo?.data && photo.mime ? `data:${photo.mime};base64,${photo.data.toString("base64")}` : null;
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
  register("members:choosePhoto", async () => {
    auth();
    const r = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (r.canceled) return null;
    const sourceSize = (await import("node:fs/promises")).stat(r.filePaths[0]);
    if ((await sourceSize).size > 8 * 1024 * 1024) throw new Error("Member photo must be 8 MB or smaller");
    const dir = join(app.getPath("userData"), "member-photos");
    mkdirSync(dir, { recursive: true });
    const ext = r.filePaths[0].split(".").pop()?.toLowerCase() || "jpg";
    const target = join(dir, `${Date.now()}-${randomUUID()}.${ext}`);
    copyFileSync(r.filePaths[0], target);
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { path: target, dataUrl: `data:${mime};base64,${readFileSync(target).toString("base64")}` };
  });
  register("documents:requirements", () => { auth(); return store.documentRequirements(); });
  register("documents:addRequirement", (p) => { const s = owner(); return store.addDocumentRequirement(documentRequirementSchema.parse(p).name, s.id); });
  register("documents:archiveRequirement", (p) => { const s = owner(); store.archiveDocumentRequirement(p.id, s.id); return true; });
  register("members:chooseDocument", async () => {
    auth();
    const result = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "Member document", extensions: ["pdf", "png", "jpg", "jpeg"] }] });
    if (result.canceled) return null;
    if (statSync(result.filePaths[0]).size > 12 * 1024 * 1024) throw new Error("Member document must be 12 MB or smaller");
    return { path: result.filePaths[0], name: result.filePaths[0].split(/[\\/]/).pop() };
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
  register("kiosk:enterPresentation", () => {
    owner();
    const settings = store.settings() as any;
    if (!settings.kioskExitPinConfigured) throw new Error("Set a kiosk exit PIN in Settings before starting presentation mode");
    win.setFullScreen(true);
    win.setAlwaysOnTop(true, "screen-saver");
    return true;
  });
  register("kiosk:exitPresentation", (p) => {
    owner();
    const value = String(p?.pin || "");
    if (!/^\d{6}$/.test(value) || !store.verifyKioskExitPin(value)) throw new Error("Kiosk exit PIN is incorrect");
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
  register("dashboard:get", () => {
    auth();
    return store.dashboard();
  });
  register("settings:get", () => {
    auth();
    const settings = store.settings() as any;
    settings.logoDataUrl = publicBranding().logoDataUrl;
    return settings;
  });
  register("preferences:get", () => store.staffPreferences(auth().id));
  register("preferences:update", (p) => {
    const s = auth();
    return store.updateStaffPreferences(s.id, preferencesSchema.parse(p));
  });
  register("settings:update", (p) => {
    const s = owner(),
      x = settingsSchema.parse(p);
    authorizeCurrent(p.authorizationPin);
    store.updateSettings(x, s.id);
    applyWindowLogo();
    return true;
  });
  register("settings:chooseLogo", async () => {
    owner();
    const r = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "Gym logo", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (r.canceled) return null;
    const logoDir = join(app.getPath("userData"), "branding");
    mkdirSync(logoDir, { recursive: true });
    const ext = r.filePaths[0].split(".").pop()?.toLowerCase() || "png";
    const target = join(logoDir, `gym-logo-${randomUUID()}.${ext}`);
    copyFileSync(r.filePaths[0], target);
    return target;
  });
  register("reports:get", (p) => {
    auth();
    const range = reportRangeSchema.parse(p);
    return store.reports(range.from, range.to);
  });
  register("reports:export", async (p) => {
    const s = auth();
    const x = reportExportSchema.parse(p);
    const report = store.reports(x.from, x.to) as any;
    const settings = store.settings() as any;
    const save = await dialog.showSaveDialog(win, {
      defaultPath: `opengym-${x.scope}-${x.from}-to-${x.to}.${x.format}`,
      filters: [{ name: x.format === "pdf" ? "PDF report" : "CSV data", extensions: [x.format] }],
    });
    if (save.canceled || !save.filePath) return null;
    if (x.format === "csv") {
      const queries: Record<string, string> = {
        attendance: `SELECT m.first_name||' '||m.last_name member,a.checked_in_at,a.checked_out_at,a.method,s.name staff FROM attendance a JOIN members m ON m.id=a.member_id LEFT JOIN staff s ON s.id=a.staff_id WHERE date(a.checked_in_at) BETWEEN date(?) AND date(?) ORDER BY a.checked_in_at`,
        payments: `SELECT y.receipt_number,m.first_name||' '||m.last_name member,y.amount_minor,y.method,y.status,y.paid_at,y.refunded_at,s.name staff FROM payments y JOIN memberships x ON x.id=y.membership_id JOIN members m ON m.id=x.member_id LEFT JOIN staff s ON s.id=y.staff_id WHERE date(y.paid_at) BETWEEN date(?) AND date(?) ORDER BY y.paid_at`,
        memberships: `SELECT m.first_name||' '||m.last_name member,p.name plan,x.start_date,x.end_date,x.status,x.auto_renew FROM memberships x JOIN members m ON m.id=x.member_id JOIN plans p ON p.id=x.plan_id WHERE date(x.created_at) BETWEEN date(?) AND date(?) ORDER BY x.created_at`,
      };
      const rows = x.scope === "summary" ? [
        { metric: "Members joined", value: report.members.joined },
        { metric: "Visits", value: report.attendance.total },
        { metric: "Unique visitors", value: report.attendance.uniqueMembers },
        { metric: "Revenue (minor units)", value: report.revenue.total },
        { metric: "Paid transactions", value: report.revenue.transactions },
        { metric: "Refunds", value: report.revenue.refunds },
      ] : store.db.prepare(queries[x.scope]).all(x.from, x.to) as any[];
      const headers = rows.length ? Object.keys(rows[0]) : ["No records"];
      const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
      const csv = [headers.map(cell).join(","), ...rows.map((row: any) => headers.map((header) => cell(row[header])).join(","))].join("\r\n");
      (await import("node:fs/promises")).writeFile(save.filePath, "\ufeff" + csv, "utf8");
    } else {
      await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `${settings.gymName} report` } });
        const stream = createWriteStream(save.filePath!);
        doc.pipe(stream);
        const accent = settings.receiptColor || "#17202A", left = 48, width = doc.page.width - 96;
        doc.fillColor(accent).font("Helvetica-Bold").fontSize(23).text(settings.gymName);
        doc.fillColor("#17202A").font("Helvetica-Bold").fontSize(12).text("Performance report", left, 77);
        doc.fillColor("#66727A").font("Helvetica").fontSize(9).text(`${x.from} to ${x.to}  |  Generated ${new Date().toLocaleString(settings.locale)}`, left, 92);
        doc.moveTo(left, 112).lineTo(left + width, 112).lineWidth(2).strokeColor(accent).stroke();
        const metrics = [["Members joined", report.members.joined], ["Visits", report.attendance.total], ["Unique visitors", report.attendance.uniqueMembers], ["Revenue", new Intl.NumberFormat(settings.locale, { style: "currency", currency: settings.currency }).format(report.revenue.total / 100)], ["Transactions", report.revenue.transactions], ["Refunds", report.revenue.refunds]];
        metrics.forEach(([label, value], i) => {
          const col = i % 3, row = Math.floor(i / 3), xPos = left + col * (width / 3), yPos = 137 + row * 72;
          doc.fillColor("#718089").font("Helvetica").fontSize(8.5).text(String(label), xPos, yPos);
          doc.fillColor("#17202A").font("Helvetica-Bold").fontSize(18).text(String(value), xPos, yPos + 17, { width: width / 3 - 18 });
        });
        const drawBars = (title: string, items: any[], top: number, valueFormat = (value: number) => String(value)) => {
          doc.fillColor("#17202A").font("Helvetica-Bold").fontSize(13).text(title, left, top);
          const max = Math.max(1, ...items.map((item) => Number(item.value)));
          items.slice(0, 7).forEach((item, i) => {
            const y = top + 30 + i * 29;
            doc.fillColor("#58666F").font("Helvetica").fontSize(8.5).text(String(item.label), left, y, { width: 120 });
            doc.roundedRect(left + 125, y, width - 210, 10, 3).fill("#E6EAEC");
            doc.roundedRect(left + 125, y, Math.max(3, (width - 210) * Number(item.value) / max), 10, 3).fill(accent);
            doc.fillColor("#17202A").text(valueFormat(Number(item.value)), left + width - 78, y - 1, { width: 78, align: "right" });
          });
        };
        drawBars("Revenue by plan", report.revenue.byPlan, 300, (value) => new Intl.NumberFormat(settings.locale, { style: "currency", currency: settings.currency, maximumFractionDigits: 0 }).format(value / 100));
        drawBars("Staff activity", report.staffActivity, 545);
        doc.fillColor("#77838A").font("Helvetica").fontSize(8).text("Generated by OpenGym from locally stored records.", left, doc.page.height - 58, { width, align: "center" });
        doc.end();
        stream.on("finish", resolve); stream.on("error", reject);
      });
    }
    store.log(s.id, "report", null, `${x.format}_exported`, { scope: x.scope, from: x.from, to: x.to });
    return save.filePath;
  });
  register("audit:list", (p) => {
    owner();
    return store.auditLog(auditQuerySchema.parse(p || {}));
  });
  register("export:csv", async (p) => {
    const s = auth();
    const queries: any = {
      members: `SELECT first_name,last_name,phone,email,status,created_at FROM members WHERE archived_at IS NULL ORDER BY last_name`,
      attendance: `SELECT m.first_name||' '||m.last_name member,a.checked_in_at,a.checked_out_at,a.method FROM attendance a JOIN members m ON m.id=a.member_id ORDER BY a.checked_in_at DESC`,
      payments: `SELECT y.receipt_number,m.first_name||' '||m.last_name member,y.amount_minor,y.method,y.status,y.paid_at FROM payments y JOIN memberships x ON x.id=y.membership_id JOIN members m ON m.id=x.member_id ORDER BY y.paid_at DESC`,
    };
    const sql = queries[p.module];
    if (!sql) throw new Error("Unsupported CSV export");
    const rows = store.db.prepare(sql).all() as any[];
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const cell = (v: any) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = [
      headers.map(cell).join(","),
      ...rows.map((row) => headers.map((h) => cell(row[h])).join(",")),
    ].join("\r\n");
    const r = await dialog.showSaveDialog(win, {
      defaultPath: `opengym-${p.module}-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (r.canceled || !r.filePath) return null;
    (await import("node:fs/promises")).writeFile(
      r.filePath,
      "\ufeff" + csv,
      "utf8",
    );
    store.log(s.id, "export", null, "csv_exported", { module: p.module });
    return r.filePath;
  });
  register("backup:status", () => {
    auth();
    const v = store.db
      .prepare(`SELECT value FROM internal_settings WHERE key='last_backup'`)
      .get() as any;
    return {
      lastBackup: v?.value ?? null,
      overdue: !v || Date.now() - Date.parse(v.value) > 604800000,
    };
  });
  register("backup:export", async () => {
    const s = owner();
    const r = await dialog.showSaveDialog(win, {
      defaultPath: `opengym-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: "OpenGym database", extensions: ["db"] }],
    });
    if (r.canceled || !r.filePath) return null;
    await store.db.backup(r.filePath);
    const t = new Date().toISOString();
    store.db
      .prepare(
        `INSERT INTO internal_settings(key,value) VALUES('last_backup',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      )
      .run(t);
    store.log(s.id, "backup", null, "exported", { completedAt: t });
    return r.filePath;
  });
  register("backup:import", async (p) => {
    owner();
    authorizeCurrent(p.authorizationPin);
    const r = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "OpenGym database", extensions: ["db"] }],
    });
    if (r.canceled) return null;
    const source = r.filePaths[0];
    const dest = store.path;
    store.close();
    const safety = stageDatabaseReplacement(source, dest);
    app.relaunch();
    app.exit();
    return safety;
  });
  register("backup:factoryReset", async () => {
    owner();
    const dataDir = app.getPath("userData");
    store.close();
    await win.webContents.session.clearStorageData();
    await win.webContents.session.clearCache();
    removeManagedData(dataDir);
    session = null;
    app.relaunch();
    app.exit();
    return true;
  });
  register("payments:receipt", async (p) => {
    const s = auth();
    const y = store.db
      .prepare(`SELECT * FROM payments WHERE id=?`)
      .get(p.id) as any;
    if (!y) throw new Error("Payment not found");
    const dir = join(app.getPath("userData"), "receipts");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `receipt-${y.receipt_number}.pdf`);
    if (!existsSync(path)) {
      await new Promise<void>((resolve, reject) => {
        const gym = JSON.parse(y.gym_snapshot),
          member = JSON.parse(y.member_snapshot);
        const paper = gym.receiptPaper === "LETTER" ? "LETTER" : "A4";
        const accent = /^#[0-9a-f]{6}$/i.test(gym.receiptColor || "") ? gym.receiptColor : "#17202A";
        const channels = accent.slice(1).match(/../g)!.map((value: string) => parseInt(value, 16) / 255).map((value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
        const amountInk = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] > 0.42 ? "#17202A" : "#FFFFFF";
        const doc = new PDFDocument({ size: paper, margin: 54, info: { Title: `Receipt ${y.receipt_number}`, Author: gym.name } });
        const stream = createWriteStream(path);
        doc.pipe(stream);
        const left = doc.page.margins.left;
        const right = doc.page.width - doc.page.margins.right;
        const contentWidth = right - left;
        const receiptLogo = gym.logoPath && existsSync(gym.logoPath) ? gym.logoPath : join(app.getAppPath(), "logo.png");
        if (existsSync(receiptLogo)) {
          try { doc.image(receiptLogo, left, 48, { fit: [92, 62], valign: "center" }); } catch { /* Keep the receipt usable if a logo file is damaged. */ }
        }
        const identityLeft = existsSync(receiptLogo) ? left + 112 : left;
        doc.fillColor(accent).font("Helvetica-Bold").fontSize(22).text(gym.name, identityLeft, 50, { width: right - identityLeft });
        const contact = [gym.address, gym.phone, gym.email, gym.taxId ? `Tax ID: ${gym.taxId}` : ""].filter(Boolean).join("  |  ");
        doc.fillColor("#5E6870").font("Helvetica").fontSize(8.5).text(contact, identityLeft, 80, { width: right - identityLeft, lineGap: 2 });
        doc.moveTo(left, 126).lineTo(right, 126).lineWidth(2).strokeColor(accent).stroke();
        doc.fillColor("#17202A").font("Helvetica-Bold").fontSize(19).text("Receipt", left, 154);
        doc.fillColor(accent).font("Helvetica-Bold").fontSize(10).text(`#${y.receipt_number}`, right - 180, 158, { width: 180, align: "right" });
        const row = (label: string, value: string, top: number) => {
          doc.fillColor("#64717A").font("Helvetica").fontSize(9).text(label, left, top);
          doc.fillColor("#17202A").font("Helvetica-Bold").fontSize(10.5).text(value, left + 145, top, { width: contentWidth - 145, align: "right" });
          doc.moveTo(left, top + 22).lineTo(right, top + 22).lineWidth(0.5).strokeColor("#DDE2E4").stroke();
        };
        doc.roundedRect(left, 196, contentWidth, 66, 7).fill("#F2F5F4");
        doc.fillColor("#64717A").font("Helvetica").fontSize(8.5).text("Membership purchased", left + 16, 211);
        doc.fillColor("#17202A").font("Helvetica-Bold").fontSize(14).text(member.planName || "Membership payment", left + 16, 228, { width: contentWidth - 32 });
        row("Member", member.name, 286);
        row("Access period", member.membershipStart && member.membershipEnd ? (member.membershipEnd === "9999-12-31" ? `From ${member.membershipStart} - no calendar expiry` : `${member.membershipStart} to ${member.membershipEnd}`) : "See membership record", 326);
        row("Payment date", new Date(y.paid_at).toLocaleString(gym.locale), 366);
        row("Payment method", String(y.method).replace(/^./, (c: string) => c.toUpperCase()), 406);
        row("Status", String(y.status).replace(/^./, (c: string) => c.toUpperCase()), 446);
        const amount = new Intl.NumberFormat(gym.locale, { style: "currency", currency: gym.currency }).format(y.amount_minor / 100);
        doc.roundedRect(left, 506, contentWidth, 92, 8).fill(accent);
        doc.fillColor(amountInk).font("Helvetica-Bold").fontSize(10).text("Paid in full", left + 20, 528);
        doc.font("Helvetica-Bold").fontSize(25).text(amount, left + 20, 548, { width: contentWidth - 40, align: "right" });
        doc.fillColor("#64717A").font("Helvetica").fontSize(9).text(gym.receiptFooter || "Thank you for training with us.", left, doc.page.height - 100, { width: contentWidth, align: "center", lineGap: 3 });
        doc.fontSize(7.5).text("Generated by OpenGym - Keep this receipt for your records.", left, doc.page.height - 64, { width: contentWidth, align: "center" });
        doc.end();
        stream.on("finish", resolve);
        stream.on("error", reject);
      });
    }
    await shell.openPath(path);
    store.log(s.id, "receipt", y.id, "opened", { receiptNumber: y.receipt_number });
    return path;
  });
}
async function create() {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  store = new GymDatabase(join(dir, "opengym.db"));
  handlers();
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: "#F3F5F4",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(
        dirname(fileURLToPath(import.meta.url)),
        "../preload/index.cjs",
      ),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once("ready-to-show", () => {
    win.center();
    win.show();
    win.focus();
    if (duplicateLaunchPending) {
      duplicateLaunchPending = false;
      showAlreadyRunning();
    }
  });
  win.webContents.on("did-fail-load", (_event, code, description) => {
    dialog.showErrorBox("OpenGym could not load", `${description} (${code})`);
  });
  win.setMenuBarVisibility(false);
  applyWindowLogo();
  if (process.env.VITE_DEV_SERVER_URL)
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else await win.loadFile(join(app.getAppPath(), "dist/renderer/index.html"));
}
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else app.on("second-instance", () => {
  showAlreadyRunning();
});
app
  .whenReady()
  .then(create)
  .catch((error) => {
    console.error("OpenGym failed to start:", error);
    dialog.showErrorBox(
      "OpenGym could not start",
      error instanceof Error ? error.message : "Unknown startup error",
    );
    app.quit();
  });
app.on("window-all-closed", () => {
  store?.close();
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0)
    void create().catch(console.error);
});
