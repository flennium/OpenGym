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

export function registerReceiptHandlers(ctx: any) {
  const register: (channel: string, fn: (payload: any) => any) => void = ctx.register;
  const { store, auth, owner, authorizeCurrent, publicBranding, applyWindowLogo, faces, win } = ctx;
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
        const accent = /^#[0-9a-f]{6}$/i.test(gym.receiptColor || "")
          ? gym.receiptColor
          : "#17202A";
        const channels = accent
          .slice(1)
          .match(/../g)!
          .map((value: string) => parseInt(value, 16) / 255)
          .map((value: number) =>
            value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
          );
        const amountInk =
          0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] >
          0.42
            ? "#17202A"
            : "#FFFFFF";
        const doc = new PDFDocument({
          size: paper,
          margin: 54,
          info: { Title: `Receipt ${y.receipt_number}`, Author: gym.name },
        });
        const stream = createWriteStream(path);
        doc.pipe(stream);
        const left = doc.page.margins.left;
        const right = doc.page.width - doc.page.margins.right;
        const contentWidth = right - left;
        const receiptLogo =
          gym.logoPath && existsSync(gym.logoPath)
            ? gym.logoPath
            : join(app.getAppPath(), "logo.png");
        if (existsSync(receiptLogo)) {
          try {
            doc.image(receiptLogo, left, 48, {
              fit: [92, 62],
              valign: "center",
            });
          } catch {
            /* Keep the receipt usable if a logo file is damaged. */
          }
        }
        const identityLeft = existsSync(receiptLogo) ? left + 112 : left;
        doc
          .fillColor(accent)
          .font("Helvetica-Bold")
          .fontSize(22)
          .text(gym.name, identityLeft, 50, { width: right - identityLeft });
        const contact = [
          gym.address,
          gym.phone,
          gym.email,
          gym.taxId ? `Tax ID: ${gym.taxId}` : "",
        ]
          .filter(Boolean)
          .join("  |  ");
        doc
          .fillColor("#5E6870")
          .font("Helvetica")
          .fontSize(8.5)
          .text(contact, identityLeft, 80, {
            width: right - identityLeft,
            lineGap: 2,
          });
        doc
          .moveTo(left, 126)
          .lineTo(right, 126)
          .lineWidth(2)
          .strokeColor(accent)
          .stroke();
        doc
          .fillColor("#17202A")
          .font("Helvetica-Bold")
          .fontSize(19)
          .text("Receipt", left, 154);
        doc
          .fillColor(accent)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(`#${y.receipt_number}`, right - 180, 158, {
            width: 180,
            align: "right",
          });
        const row = (label: string, value: string, top: number) => {
          doc
            .fillColor("#64717A")
            .font("Helvetica")
            .fontSize(9)
            .text(label, left, top);
          doc
            .fillColor("#17202A")
            .font("Helvetica-Bold")
            .fontSize(10.5)
            .text(value, left + 145, top, {
              width: contentWidth - 145,
              align: "right",
            });
          doc
            .moveTo(left, top + 22)
            .lineTo(right, top + 22)
            .lineWidth(0.5)
            .strokeColor("#DDE2E4")
            .stroke();
        };
        doc.roundedRect(left, 196, contentWidth, 66, 7).fill("#F2F5F4");
        doc
          .fillColor("#64717A")
          .font("Helvetica")
          .fontSize(8.5)
          .text("Membership purchased", left + 16, 211);
        doc
          .fillColor("#17202A")
          .font("Helvetica-Bold")
          .fontSize(14)
          .text(member.planName || "Membership payment", left + 16, 228, {
            width: contentWidth - 32,
          });
        row("Member", member.name, 286);
        row(
          "Access period",
          member.membershipStart && member.membershipEnd
            ? member.membershipEnd === "9999-12-31"
              ? `From ${member.membershipStart} - no calendar expiry`
              : `${member.membershipStart} to ${member.membershipEnd}`
            : "See membership record",
          326,
        );
        row(
          "Payment date",
          new Date(y.paid_at).toLocaleString(gym.locale),
          366,
        );
        row(
          "Payment method",
          String(y.method).replace(/^./, (c: string) => c.toUpperCase()),
          406,
        );
        row(
          "Status",
          String(y.status).replace(/^./, (c: string) => c.toUpperCase()),
          446,
        );
        const amount = new Intl.NumberFormat(gym.locale, {
          style: "currency",
          currency: gym.currency,
        }).format(y.amount_minor / 100);
        doc.roundedRect(left, 506, contentWidth, 92, 8).fill(accent);
        doc
          .fillColor(amountInk)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text("Paid in full", left + 20, 528);
        doc
          .font("Helvetica-Bold")
          .fontSize(25)
          .text(amount, left + 20, 548, {
            width: contentWidth - 40,
            align: "right",
          });
        doc
          .fillColor("#64717A")
          .font("Helvetica")
          .fontSize(9)
          .text(
            gym.receiptFooter || "Thank you for training with us.",
            left,
            doc.page.height - 100,
            { width: contentWidth, align: "center", lineGap: 3 },
          );
        doc
          .fontSize(7.5)
          .text(
            "Generated by OpenGym - Keep this receipt for your records.",
            left,
            doc.page.height - 64,
            { width: contentWidth, align: "center" },
          );
        doc.end();
        stream.on("finish", resolve);
        stream.on("error", reject);
      });
    }
    await shell.openPath(path);
    store.log(s.id, "receipt", y.id, "opened", {
      receiptNumber: y.receipt_number,
    });
    return path;
  });
}
