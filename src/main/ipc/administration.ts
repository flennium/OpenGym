import { app, dialog } from "electron";
import { mkdirSync, copyFileSync, createWriteStream, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import PDFDocument from "pdfkit";
import { removeManagedData } from "../factory-reset.js";
import { stageDatabaseReplacement } from "../recovery.js";
import {
  auditQuerySchema, reportExportSchema, reportRangeSchema, memberSchema,
  paymentSchema, planSchema, settingsSchema, preferencesSchema,
  documentRequirementSchema, staffSchema,
} from "../../shared/contracts.js";

export function registerAdministrationHandlers(ctx: any) {
  const register: (channel: string, fn: (payload: any) => any) => void = ctx.register;
  const { store, auth, owner, authorizeCurrent, publicBranding, applyWindowLogo, faces, win } = ctx;
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
      filters: [
        {
          name: x.format === "pdf" ? "PDF report" : "CSV data",
          extensions: [x.format],
        },
      ],
    });
    if (save.canceled || !save.filePath) return null;
    if (x.format === "csv") {
      const queries: Record<string, string> = {
        attendance: `SELECT m.first_name||' '||m.last_name member,a.checked_in_at,a.checked_out_at,a.method,s.name staff FROM attendance a JOIN members m ON m.id=a.member_id LEFT JOIN staff s ON s.id=a.staff_id WHERE date(a.checked_in_at) BETWEEN date(?) AND date(?) ORDER BY a.checked_in_at`,
        payments: `SELECT y.receipt_number,m.first_name||' '||m.last_name member,y.amount_minor,y.method,y.status,y.paid_at,y.refunded_at,s.name staff FROM payments y JOIN memberships x ON x.id=y.membership_id JOIN members m ON m.id=x.member_id LEFT JOIN staff s ON s.id=y.staff_id WHERE date(y.paid_at) BETWEEN date(?) AND date(?) ORDER BY y.paid_at`,
        memberships: `SELECT m.first_name||' '||m.last_name member,p.name plan,x.start_date,x.end_date,x.status,x.auto_renew FROM memberships x JOIN members m ON m.id=x.member_id JOIN plans p ON p.id=x.plan_id WHERE date(x.created_at) BETWEEN date(?) AND date(?) ORDER BY x.created_at`,
      };
      const rows =
        x.scope === "summary"
          ? [
              { metric: "Members joined", value: report.members.joined },
              { metric: "Visits", value: report.attendance.total },
              {
                metric: "Unique visitors",
                value: report.attendance.uniqueMembers,
              },
              { metric: "Revenue (minor units)", value: report.revenue.total },
              {
                metric: "Paid transactions",
                value: report.revenue.transactions,
              },
              { metric: "Refunds", value: report.revenue.refunds },
            ]
          : (store.db.prepare(queries[x.scope]).all(x.from, x.to) as any[]);
      const headers = rows.length ? Object.keys(rows[0]) : ["No records"];
      const cell = (value: unknown) =>
        `"${String(value ?? "").replaceAll('"', '""')}"`;
      const csv = [
        headers.map(cell).join(","),
        ...rows.map((row: any) =>
          headers.map((header) => cell(row[header])).join(","),
        ),
      ].join("\r\n");
      (await import("node:fs/promises")).writeFile(
        save.filePath,
        "\ufeff" + csv,
        "utf8",
      );
    } else {
      await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({
          size: "A4",
          margin: 48,
          info: { Title: `${settings.gymName} report` },
        });
        const stream = createWriteStream(save.filePath!);
        doc.pipe(stream);
        const accent = settings.receiptColor || "#17202A",
          left = 48,
          width = doc.page.width - 96;
        doc
          .fillColor(accent)
          .font("Helvetica-Bold")
          .fontSize(23)
          .text(settings.gymName);
        doc
          .fillColor("#17202A")
          .font("Helvetica-Bold")
          .fontSize(12)
          .text("Performance report", left, 77);
        doc
          .fillColor("#66727A")
          .font("Helvetica")
          .fontSize(9)
          .text(
            `${x.from} to ${x.to}  |  Generated ${new Date().toLocaleString(settings.locale)}`,
            left,
            92,
          );
        doc
          .moveTo(left, 112)
          .lineTo(left + width, 112)
          .lineWidth(2)
          .strokeColor(accent)
          .stroke();
        const metrics = [
          ["Members joined", report.members.joined],
          ["Visits", report.attendance.total],
          ["Unique visitors", report.attendance.uniqueMembers],
          [
            "Revenue",
            new Intl.NumberFormat(settings.locale, {
              style: "currency",
              currency: settings.currency,
            }).format(report.revenue.total / 100),
          ],
          ["Transactions", report.revenue.transactions],
          ["Refunds", report.revenue.refunds],
        ];
        metrics.forEach(([label, value], i) => {
          const col = i % 3,
            row = Math.floor(i / 3),
            xPos = left + col * (width / 3),
            yPos = 137 + row * 72;
          doc
            .fillColor("#718089")
            .font("Helvetica")
            .fontSize(8.5)
            .text(String(label), xPos, yPos);
          doc
            .fillColor("#17202A")
            .font("Helvetica-Bold")
            .fontSize(18)
            .text(String(value), xPos, yPos + 17, { width: width / 3 - 18 });
        });
        const drawBars = (
          title: string,
          items: any[],
          top: number,
          valueFormat = (value: number) => String(value),
        ) => {
          doc
            .fillColor("#17202A")
            .font("Helvetica-Bold")
            .fontSize(13)
            .text(title, left, top);
          const max = Math.max(1, ...items.map((item) => Number(item.value)));
          items.slice(0, 7).forEach((item, i) => {
            const y = top + 30 + i * 29;
            doc
              .fillColor("#58666F")
              .font("Helvetica")
              .fontSize(8.5)
              .text(String(item.label), left, y, { width: 120 });
            doc.roundedRect(left + 125, y, width - 210, 10, 3).fill("#E6EAEC");
            doc
              .roundedRect(
                left + 125,
                y,
                Math.max(3, ((width - 210) * Number(item.value)) / max),
                10,
                3,
              )
              .fill(accent);
            doc
              .fillColor("#17202A")
              .text(valueFormat(Number(item.value)), left + width - 78, y - 1, {
                width: 78,
                align: "right",
              });
          });
        };
        drawBars("Revenue by plan", report.revenue.byPlan, 300, (value) =>
          new Intl.NumberFormat(settings.locale, {
            style: "currency",
            currency: settings.currency,
            maximumFractionDigits: 0,
          }).format(value / 100),
        );
        drawBars("Staff activity", report.staffActivity, 545);
        doc
          .fillColor("#77838A")
          .font("Helvetica")
          .fontSize(8)
          .text(
            "Generated by OpenGym from locally stored records.",
            left,
            doc.page.height - 58,
            { width, align: "center" },
          );
        doc.end();
        stream.on("finish", resolve);
        stream.on("error", reject);
      });
    }
    store.log(s.id, "report", null, `${x.format}_exported`, {
      scope: x.scope,
      from: x.from,
      to: x.to,
    });
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
    ctx.setSession(null);
    app.relaunch();
    app.exit();
    return true;
  });
}
