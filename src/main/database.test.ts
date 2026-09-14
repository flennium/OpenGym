import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { GymDatabase, hashPin, membershipEnd, verifyPin } from "./database.js";
import { removeManagedData } from "./factory-reset.js";
const dirs: string[] = [];
const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), "opengym-"));
  dirs.push(dir);
  return new GymDatabase(join(dir, "test.db"));
};
afterEach(() =>
  dirs.splice(0).forEach((x) => rmSync(x, { recursive: true, force: true })),
);
describe("security and dates", () => {
  it("hashes and verifies PINs without storing plaintext", () => {
    const h = hashPin("123456");
    expect(h).not.toContain("123456");
    expect(verifyPin("123456", h)).toBe(true);
    expect(verifyPin("654321", h)).toBe(false);
  });
  it("uses calendar months and inclusive end dates", () => {
    expect(membershipEnd("2026-01-01", 1)).toBe("2026-01-31");
    expect(membershipEnd("2024-02-01", 1)).toBe("2024-02-29");
  });
  it("stores appearance preferences independently for each staff account", () => {
    const db = fresh();
    db.setup({
      gymName: "Atlas Gym",
      ownerName: "Owner",
      pin: "123456",
      locale: "en-DZ",
      currency: "DZD",
      timezone: "Africa/Algiers",
    });
    const second = Number(
      db.db
        .prepare(
          "INSERT INTO staff(name,role_id,pin_hash,created_at,updated_at) VALUES(?,2,?,datetime('now'),datetime('now'))",
        )
        .run("Admin", hashPin("654321")).lastInsertRowid,
    );
    expect(db.staffPreferences(1)).toEqual({ theme: "Pulse", darkMode: true });
    expect(db.staffPreferences(second)).toEqual({
      theme: "Pulse",
      darkMode: true,
    });
    db.updateStaffPreferences(1, { theme: "Ocean", darkMode: false });
    expect(db.staffPreferences(1)).toEqual({ theme: "Ocean", darkMode: false });
    expect(db.staffPreferences(second)).toEqual({
      theme: "Pulse",
      darkMode: true,
    });
    expect(db.auditLog({ search: "", staffId: 1 }).rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "staff_preferences",
          action: "updated",
        }),
      ]),
    );
    db.close();
  });
});
describe("factory reset", () => {
  it("removes only OpenGym-managed data", () => {
    const dir = mkdtempSync(join(tmpdir(), "opengym-reset-"));
    dirs.push(dir);
    writeFileSync(join(dir, "opengym.db"), "database");
    mkdirSync(join(dir, "receipts"));
    writeFileSync(join(dir, "receipts", "receipt.pdf"), "receipt");
    writeFileSync(join(dir, "unrelated.txt"), "keep");
    removeManagedData(dir);
    expect(existsSync(join(dir, "opengym.db"))).toBe(false);
    expect(existsSync(join(dir, "receipts"))).toBe(false);
    expect(existsSync(join(dir, "unrelated.txt"))).toBe(true);
  });
});
describe("database invariants", () => {
  it("enforces owner-defined onboarding documents and stores their bytes", () => {
    const db = fresh();
    db.setup({
      gymName: "Atlas Gym",
      ownerName: "Owner",
      pin: "123456",
      locale: "en-DZ",
      currency: "DZD",
      timezone: "Africa/Algiers",
    });
    const requirementId = db.addDocumentRequirement(
      "Medical fitness certificate",
      1,
    );
    const input: any = {
      firstName: "Documented",
      lastName: "Member",
      phone: "",
      email: "",
      dateOfBirth: "",
      gender: "",
      address: "",
      emergencyName: "",
      emergencyPhone: "",
      status: "active",
      notes: "",
      photoPath: null,
    };
    expect(() => db.saveMember(input, undefined, 1)).toThrow(
      /Medical fitness certificate/,
    );
    const documentPath = join(dirname(db.path), "certificate.pdf");
    writeFileSync(documentPath, Buffer.from("%PDF-1.4 test certificate"));
    const memberId = db.saveMember(
      { ...input, documents: [{ requirementId, path: documentPath }] },
      undefined,
      1,
    );
    const stored = db.db
      .prepare(
        "SELECT file_name,mime_type,length(file_blob) size FROM member_documents WHERE member_id=?",
      )
      .get(memberId) as any;
    expect(stored).toMatchObject({
      file_name: "certificate.pdf",
      mime_type: "application/pdf",
    });
    expect(stored.size).toBeGreaterThan(0);
    db.close();
  });
  it("creates setup once and prevents duplicate open visits", () => {
    const db = fresh();
    db.setup({
      gymName: "Atlas Gym",
      ownerName: "Owner",
      pin: "123456",
      locale: "en-DZ",
      currency: "DZD",
      timezone: "Africa/Algiers",
    });
    expect(db.isSetup()).toBe(true);
    const owner = db.signIn(1, "123456")!;
    const photo = join(dirname(db.path), "member.png");
    writeFileSync(photo, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]));
    const member = db.saveMember(
      {
        firstName: "Sam",
        lastName: "Amari",
        phone: "",
        email: "",
        dateOfBirth: "",
        gender: "",
        address: "",
        emergencyName: "",
        emergencyPhone: "",
        status: "active",
        notes: "",
        photoPath: photo,
      },
      undefined,
      owner.id,
    );
    const plan = db.savePlan(
      {
        name: "Monthly",
        description: "",
        durationMonths: 1,
        trainingHours: null,
        priceMinor: 1000,
      },
      undefined,
      owner.id,
    );
    db.assign(
      member,
      plan,
      new Date().toISOString().slice(0, 10),
      false,
      owner.id,
    );
    db.checkIn(member, owner.id);
    expect(() => db.checkIn(member, owner.id)).toThrow();
    rmSync(photo);
    expect(db.memberPhoto(member)).toMatchObject({ mime: "image/png" });
    expect(db.memberPhoto(member)?.data?.length).toBe(8);
    db.close();
  });
  it("stores versioned face templates and audits their removal", () => {
    const db = fresh();
    db.setup({
      gymName: "Atlas Gym",
      ownerName: "Owner",
      pin: "123456",
      locale: "en-DZ",
      currency: "DZD",
      timezone: "Africa/Algiers",
    });
    const member = db.saveMember(
      {
        firstName: "Face",
        lastName: "Member",
        phone: "",
        email: "",
        dateOfBirth: "",
        gender: "",
        address: "",
        emergencyName: "",
        emergencyPhone: "",
        status: "active",
        notes: "",
        photoPath: null,
      },
      undefined,
      1,
    );
    const embedding = Array.from({ length: 512 }, (_, index) => index / 512);
    db.saveFaceTemplate(member, embedding, 0.91, 1);
    expect(db.faceStatus(member)).toMatchObject({
      modelId: "insightface-buffalo_sc",
      modelVersion: "0.7",
      qualityScore: 0.91,
    });
    expect(db.faceTemplates()[0]).toMatchObject({ memberId: member });
    expect(db.faceTemplates()[0].embedding).toHaveLength(512);
    db.removeFaceTemplate(member, 1);
    expect(db.faceStatus(member)).toBeNull();
    expect(db.auditLog({ search: "", entityType: "member_face" }).rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "enrolled" }),
        expect.objectContaining({ action: "removed" }),
      ]),
    );
    db.close();
  });
  it("ends a hybrid membership when either its date or training hours run out", () => {
    const db = fresh();
    db.setup({
      gymName: "Atlas Gym",
      ownerName: "Owner",
      pin: "123456",
      locale: "en-DZ",
      currency: "DZD",
      timezone: "Africa/Algiers",
    });
    const member = db.saveMember(
      {
        firstName: "Timed",
        lastName: "Member",
        phone: "",
        email: "",
        dateOfBirth: "",
        gender: "",
        address: "",
        emergencyName: "",
        emergencyPhone: "",
        status: "active",
        notes: "",
        photoPath: null,
      },
      undefined,
      1,
    );
    const plan = db.savePlan(
      {
        name: "One month / one hour",
        description: "",
        durationMonths: 1,
        trainingHours: 1,
        priceMinor: 1000,
      },
      undefined,
      1,
    );
    const membership = db.assign(
      member,
      plan,
      new Date().toISOString().slice(0, 10),
      false,
      1,
    );
    const visit = db.checkIn(member, 1);
    db.db
      .prepare("UPDATE attendance SET checked_in_at=? WHERE id=?")
      .run(new Date(Date.now() - 61 * 60000).toISOString(), visit);
    db.checkOut(visit, 1);
    const exhausted = db.db
      .prepare("SELECT status,used_minutes FROM memberships WHERE id=?")
      .get(membership) as any;
    expect(exhausted.status).toBe("exhausted");
    expect(exhausted.used_minutes).toBeGreaterThanOrEqual(61);
    expect(() => db.checkIn(member, 1)).toThrow(/no active membership/i);
    db.membershipAction(membership, "renew", 1);
    expect(
      db.db
        .prepare("SELECT status,used_minutes FROM memberships WHERE id=?")
        .get(membership),
    ).toMatchObject({ status: "active", used_minutes: 0 });
    db.close();
  });
  it("supports an hours-only membership without a calendar expiry", () => {
    const db = fresh();
    db.setup({
      gymName: "Atlas Gym",
      ownerName: "Owner",
      pin: "123456",
      locale: "en-DZ",
      currency: "DZD",
      timezone: "Africa/Algiers",
    });
    const member = db.saveMember(
      {
        firstName: "Hours",
        lastName: "Only",
        phone: "",
        email: "",
        dateOfBirth: "",
        gender: "",
        address: "",
        emergencyName: "",
        emergencyPhone: "",
        status: "active",
        notes: "",
        photoPath: null,
      },
      undefined,
      1,
    );
    const plan = db.savePlan(
      {
        name: "Ten training hours",
        description: "",
        durationMonths: 0,
        trainingHours: 10,
        priceMinor: 1000,
      },
      undefined,
      1,
    );
    const membership = db.assign(member, plan, "2026-01-01", false, 1);
    expect(
      db.db
        .prepare(
          "SELECT end_date,training_minutes_limit FROM memberships WHERE id=?",
        )
        .get(membership),
    ).toMatchObject({ end_date: "9999-12-31", training_minutes_limit: 600 });
    expect(db.checkIn(member, 1)).toBeGreaterThan(0);
    expect(
      (
        db.db
          .prepare("SELECT member_code FROM members WHERE id=?")
          .get(member) as any
      ).member_code,
    ).toMatch(/^\d{10}$/);
    db.close();
  });
  it("pauses calendar expiry for the full frozen period", () => {
    const db = fresh();
    db.setup({
      gymName: "Atlas Gym",
      ownerName: "Owner",
      pin: "123456",
      locale: "en-DZ",
      currency: "DZD",
      timezone: "Africa/Algiers",
    });
    const member = db.saveMember(
      {
        firstName: "Frozen",
        lastName: "Member",
        phone: "",
        email: "",
        dateOfBirth: "",
        gender: "",
        address: "",
        emergencyName: "",
        emergencyPhone: "",
        status: "active",
        notes: "",
        photoPath: null,
      },
      undefined,
      1,
    );
    const plan = db.savePlan(
      {
        name: "Monthly pause",
        description: "",
        durationMonths: 1,
        trainingHours: null,
        priceMinor: 1000,
      },
      undefined,
      1,
    );
    const membership = db.assign(member, plan, "2026-09-01", false, 1);
    const original = db.db
      .prepare("SELECT expires_at FROM memberships WHERE id=?")
      .get(membership) as any;
    db.membershipAction(membership, "freeze", 1);
    const frozenAt = new Date(Date.now() - 3 * 86400000).toISOString();
    db.db
      .prepare("UPDATE memberships SET frozen_at=? WHERE id=?")
      .run(frozenAt, membership);
    db.db
      .prepare(
        "UPDATE membership_freeze_periods SET frozen_at=? WHERE membership_id=? AND resumed_at IS NULL",
      )
      .run(frozenAt, membership);
    db.membershipAction(membership, "resume", 1);
    const resumed = db.db
      .prepare(
        "SELECT status,end_date,expires_at,frozen_at FROM memberships WHERE id=?",
      )
      .get(membership) as any;
    expect(resumed).toMatchObject({ status: "active", frozen_at: null });
    expect(resumed.end_date).toBe(resumed.expires_at.slice(0, 10));
    expect(
      Math.abs(
        new Date(resumed.expires_at).getTime() -
          new Date(original.expires_at).getTime() -
          3 * 86400000,
      ),
    ).toBeLessThan(2000);
    const history = db.membershipFreezeHistory(membership) as any[];
    expect(history).toHaveLength(1);
    expect(history[0].resumed_at).toBeTruthy();
    expect(Math.abs(history[0].duration_ms - 3 * 86400000)).toBeLessThan(2000);
    db.close();
  });
  it("extends the exact expiry timestamp instead of rounding freeze time to days", () => {
    const db = fresh();
    db.setup({
      gymName: "Atlas Gym",
      ownerName: "Owner",
      pin: "123456",
      locale: "en-DZ",
      currency: "DZD",
      timezone: "Africa/Algiers",
    });
    const member = db.saveMember(
      {
        firstName: "Exact",
        lastName: "Freeze",
        phone: "",
        email: "",
        dateOfBirth: "",
        gender: "",
        address: "",
        emergencyName: "",
        emergencyPhone: "",
        status: "active",
        notes: "",
        photoPath: null,
      },
      undefined,
      1,
    );
    const plan = db.savePlan(
      {
        name: "Exact month",
        description: "",
        durationMonths: 1,
        trainingHours: null,
        priceMinor: 1000,
      },
      undefined,
      1,
    );
    const membership = db.assign(member, plan, "2026-09-01", false, 1);
    db.membershipAction(membership, "freeze", 1);
    const frozenAt = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    db.db
      .prepare("UPDATE memberships SET frozen_at=? WHERE id=?")
      .run(frozenAt, membership);
    db.db
      .prepare(
        "UPDATE membership_freeze_periods SET frozen_at=? WHERE membership_id=? AND resumed_at IS NULL",
      )
      .run(frozenAt, membership);
    db.membershipAction(membership, "resume", 1);
    const row = db.db
      .prepare("SELECT expires_at FROM memberships WHERE id=?")
      .get(membership) as any;
    const expected = new Date(
      new Date("2026-09-30T23:59:59.999Z").getTime() + 36 * 60 * 60 * 1000,
    );
    expect(
      Math.abs(new Date(row.expires_at).getTime() - expected.getTime()),
    ).toBeLessThan(2000);
    const history = db.membershipFreezeHistory(membership) as any[];
    expect(Math.abs(history[0].duration_ms - 36 * 60 * 60 * 1000)).toBeLessThan(
      2000,
    );
    db.close();
  });
  it("blocks banned members and issues sequential receipts", () => {
    const db = fresh();
    db.setup({
      gymName: "Atlas Gym",
      ownerName: "Owner",
      pin: "123456",
      locale: "en-DZ",
      currency: "DZD",
      timezone: "Africa/Algiers",
    });
    const plan = db.savePlan(
      {
        name: "Monthly",
        description: "",
        durationMonths: 1,
        priceMinor: 500000,
      },
      undefined,
      1,
    );
    const active = db.saveMember(
      {
        firstName: "A",
        lastName: "Member",
        phone: "",
        email: "",
        dateOfBirth: "",
        gender: "",
        address: "",
        emergencyName: "",
        emergencyPhone: "",
        status: "active",
        notes: "",
        photoPath: null,
      },
      undefined,
      1,
    );
    const banned = db.saveMember(
      {
        firstName: "B",
        lastName: "Member",
        phone: "",
        email: "",
        dateOfBirth: "",
        gender: "",
        address: "",
        emergencyName: "",
        emergencyPhone: "",
        status: "banned",
        notes: "",
        photoPath: null,
      },
      undefined,
      1,
    );
    expect(() => db.assign(banned, plan, "2026-01-01", false, 1)).toThrow(
      /Banned/,
    );
    const membership = db.assign(active, plan, "2026-01-01", false, 1);
    db.updateSettings(
      {
        gymName: "Atlas Gym",
        locale: "en-DZ",
        currency: "DZD",
        timezone: "Africa/Algiers",
        address: "1 Atlas Way",
        phone: "0550",
        email: "hello@atlas.test",
        taxId: "TAX-1",
        receiptFooter: "Train strong.",
        receiptPaper: "A4",
        receiptColor: "#147D5D",
        logoPath: "C:/branding/logo.png",
        faceRecognitionEnabled: false,
      },
      1,
    );
    db.pay(membership, 500000, "cash", 1);
    db.pay(membership, 500000, "card", 1);
    expect(
      (db.payments() as any[]).map((x) => x.receipt_number).sort(),
    ).toEqual(["2026-000001", "2026-000002"]);
    const snapshot = JSON.parse(
      (
        db.db
          .prepare("SELECT gym_snapshot FROM payments ORDER BY id LIMIT 1")
          .get() as any
      ).gym_snapshot,
    );
    expect(snapshot).toMatchObject({
      name: "Atlas Gym",
      address: "1 Atlas Way",
      receiptFooter: "Train strong.",
      receiptColor: "#147D5D",
      logoPath: "C:/branding/logo.png",
    });
    const purchase = JSON.parse(
      (
        db.db
          .prepare("SELECT member_snapshot FROM payments ORDER BY id LIMIT 1")
          .get() as any
      ).member_snapshot,
    );
    expect(purchase).toMatchObject({
      name: "A Member",
      planName: "Monthly",
      membershipStart: "2026-01-01",
      membershipEnd: "2026-01-31",
    });
    db.close();
  });
  it("seeds editable role permissions and produces reports", () => {
    const db = fresh();
    db.setup({
      gymName: "Atlas Gym",
      ownerName: "Owner",
      pin: "123456",
      locale: "en-DZ",
      currency: "DZD",
      timezone: "Africa/Algiers",
    });
    expect(db.hasPermission(3, "Payments", "create")).toBe(true);
    expect(db.hasPermission(4, "Payments", "view")).toBe(false);
    db.setPermission(4, "Payments", "view", true, 1);
    expect(db.hasPermission(4, "Payments", "view")).toBe(true);
    expect(db.reports().members.total).toBe(0);
    const audit = db.auditLog({ search: "permission" });
    expect(audit.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          staffName: "Owner",
          entityType: "permission",
          action: "updated",
        }),
      ]),
    );
    expect(db.auditLog({ search: "", staffId: 1 }).rows.length).toBeGreaterThan(
      0,
    );
    db.close();
  });
});
