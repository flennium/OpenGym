import Database from "better-sqlite3";
import {
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { addMonths, addDays, format, isAfter } from "date-fns";
import { migrateDatabase } from "./migrations.js";
import type {
  MemberInput,
  PlanInput,
  SettingsInput,
  SetupInput,
} from "../shared/contracts.js";

const now = () => new Date().toISOString();
export const hashPin = (pin: string) => {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
};
export const verifyPin = (pin: string, stored: string) => {
  const [s, h] = stored.split(":");
  if (!s || !h) return false;
  return timingSafeEqual(
    scryptSync(pin, Buffer.from(s, "hex"), 32),
    Buffer.from(h, "hex"),
  );
};
export const membershipEnd = (start: string, months: number) =>
  format(
    addDays(addMonths(new Date(`${start}T12:00:00`), months), -1),
    "yyyy-MM-dd",
  );
const NO_EXPIRY_DATE = "9999-12-31";
const planEnd = (start: string, months: number) =>
  months > 0 ? membershipEnd(start, months) : NO_EXPIRY_DATE;

export class GymDatabase {
  db: Database.Database;
  constructor(public path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }
  close() {
    this.db.close();
  }
  migrate() {
    migrateDatabase(this.db);
  }
  isSetup() {
    return !!this.db.prepare("SELECT 1 FROM settings WHERE id=1").get();
  }
  setup(x: SetupInput) {
    if (this.isSetup()) throw new Error("Setup is already complete");
    const t = now();
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO settings(id,gym_name,locale,currency,timezone,created_at,updated_at) VALUES(1,?,?,?,?,?,?)",
        )
        .run(x.gymName, x.locale, x.currency.toUpperCase(), x.timezone, t, t);
      const info = this.db
        .prepare(
          "INSERT INTO staff(name,role_id,pin_hash,created_at,updated_at) VALUES(?,1,?,?,?)",
        )
        .run(x.ownerName, hashPin(x.pin), t, t);
      this.log(
        Number(info.lastInsertRowid),
        "staff",
        Number(info.lastInsertRowid),
        "setup",
        { gym: x.gymName },
      );
    })();
  }
  log(
    staffId: number | null,
    type: string,
    id: number | null,
    action: string,
    details: unknown = {},
  ) {
    this.db
      .prepare(
        "INSERT INTO activity_log(staff_id,entity_type,entity_id,action,details,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(staffId, type, id, action, JSON.stringify(details), now());
  }
  staff() {
    return this.db
      .prepare(
        "SELECT s.id,s.name,s.role_id roleId,r.name role,s.archived_at archivedAt FROM staff s JOIN roles r ON r.id=s.role_id ORDER BY s.archived_at,s.name",
      )
      .all();
  }
  staffPreferences(staffId: number) {
    const row = this.db
      .prepare(
        "SELECT theme,dark_mode darkMode FROM staff_preferences WHERE staff_id=?",
      )
      .get(staffId) as any;
    return row
      ? { theme: row.theme, darkMode: !!row.darkMode }
      : { theme: "Pulse", darkMode: true };
  }
  updateStaffPreferences(
    staffId: number,
    preferences: { theme: string; darkMode: boolean },
  ) {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO staff_preferences(staff_id,theme,dark_mode,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(staff_id) DO UPDATE SET theme=excluded.theme,dark_mode=excluded.dark_mode,updated_at=excluded.updated_at`,
        )
        .run(staffId, preferences.theme, preferences.darkMode ? 1 : 0, now());
      this.log(staffId, "staff_preferences", staffId, "updated", preferences);
    })();
    return this.staffPreferences(staffId);
  }
  permissions() {
    return this.db
      .prepare(
        `SELECT p.role_id roleId,r.name role,p.module,p.can_view canView,p.can_create canCreate,p.can_edit canEdit,p.can_delete canDelete FROM permissions p JOIN roles r ON r.id=p.role_id ORDER BY p.role_id,p.module`,
      )
      .all();
  }
  hasPermission(
    roleId: number,
    module: string,
    action: "view" | "create" | "edit" | "delete",
  ) {
    if (roleId === 1) return true;
    const column = {
      view: "can_view",
      create: "can_create",
      edit: "can_edit",
      delete: "can_delete",
    }[action];
    return !!(
      this.db
        .prepare(
          `SELECT ${column} allowed FROM permissions WHERE role_id=? AND module=?`,
        )
        .get(roleId, module) as any
    )?.allowed;
  }
  setPermission(
    roleId: number,
    module: string,
    action: "view" | "create" | "edit" | "delete",
    allowed: boolean,
    staffId: number,
  ) {
    if (roleId === 1) throw new Error("Owner permissions cannot be changed");
    const column = {
      view: "can_view",
      create: "can_create",
      edit: "can_edit",
      delete: "can_delete",
    }[action];
    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE permissions SET ${column}=? WHERE role_id=? AND module=?`,
        )
        .run(allowed ? 1 : 0, roleId, module);
      this.log(staffId, "permission", roleId, "updated", {
        module,
        action,
        allowed,
      });
    })();
  }
  signIn(id: number, pin: string) {
    const s = this.db
      .prepare(
        "SELECT s.*,r.name role FROM staff s JOIN roles r ON r.id=s.role_id WHERE s.id=? AND s.archived_at IS NULL",
      )
      .get(id) as any;
    if (!s || !verifyPin(pin, s.pin_hash)) return null;
    return { id: s.id, name: s.name, role: s.role, roleId: s.role_id };
  }
  requireMember(id: number) {
    const m = this.db
      .prepare("SELECT * FROM members WHERE id=? AND archived_at IS NULL")
      .get(id) as any;
    if (!m) throw new Error("Member not found");
    if (m.status === "banned")
      throw new Error("Banned members cannot use this service");
    return m;
  }
  listMembers(search = "") {
    return this.db
      .prepare(
        `SELECT m.id,m.first_name,m.last_name,m.phone,m.email,m.date_of_birth,m.gender,m.address,m.emergency_name,m.emergency_phone,m.status,m.notes,m.photo_path,m.member_code,m.archived_at,m.created_at,m.updated_at,photo_blob IS NOT NULL has_photo, (SELECT end_date FROM memberships x WHERE x.member_id=m.id AND x.status='active' ORDER BY end_date DESC LIMIT 1) membership_end FROM members m WHERE m.archived_at IS NULL AND (first_name||' '||last_name LIKE ? OR phone LIKE ? OR member_code LIKE ?) ORDER BY last_name,first_name`,
      )
      .all(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  saveMember(x: MemberInput, id: number | undefined, staffId: number) {
    let photoBlob: Buffer | null = null;
    let photoMime: string | null = null;
    if (x.photoPath && existsSync(x.photoPath)) {
      if (statSync(x.photoPath).size > 8 * 1024 * 1024)
        throw new Error("Member photo must be 8 MB or smaller");
      photoBlob = readFileSync(x.photoPath);
      const ext = x.photoPath.split(".").pop()?.toLowerCase();
      photoMime =
        ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : "image/jpeg";
    }
    const documents = (x.documents || []).map((document) => {
      if (
        !existsSync(document.path) ||
        statSync(document.path).size > 12 * 1024 * 1024
      )
        throw new Error("Each member document must be 12 MB or smaller");
      const ext = document.path.split(".").pop()?.toLowerCase();
      return {
        ...document,
        name: document.path.split(/[\\/]/).pop() || "document",
        mime:
          ext === "pdf"
            ? "application/pdf"
            : ext === "png"
              ? "image/png"
              : "image/jpeg",
        data: readFileSync(document.path),
      };
    });
    if (!id) {
      const supplied = new Set(
        documents.map((document) => document.requirementId),
      );
      const missing = (this.documentRequirements() as any[]).filter(
        (requirement) => !supplied.has(requirement.id),
      );
      if (missing.length)
        throw new Error(
          `Attach required documents: ${missing.map((item) => item.name).join(", ")}`,
        );
    }
    return this.db.transaction(() => {
      const t = now();
      let entity = id;
      if (id) {
        this.db
          .prepare(
            `UPDATE members SET first_name=?,last_name=?,phone=?,email=?,date_of_birth=?,gender=?,address=?,emergency_name=?,emergency_phone=?,status=?,notes=?,photo_path=?,photo_blob=COALESCE(?,photo_blob),photo_mime=COALESCE(?,photo_mime),updated_at=? WHERE id=? AND archived_at IS NULL`,
          )
          .run(
            x.firstName,
            x.lastName,
            x.phone,
            x.email,
            x.dateOfBirth,
            x.gender,
            x.address,
            x.emergencyName,
            x.emergencyPhone,
            x.status,
            x.notes,
            x.photoPath,
            photoBlob,
            photoMime,
            t,
            id,
          );
      } else {
        let memberCode = "";
        do memberCode = String(randomInt(1_000_000_000, 10_000_000_000));
        while (
          this.db
            .prepare("SELECT 1 FROM members WHERE member_code=?")
            .get(memberCode)
        );
        entity = Number(
          this.db
            .prepare(
              `INSERT INTO members(first_name,last_name,phone,email,date_of_birth,gender,address,emergency_name,emergency_phone,status,notes,photo_path,created_at,updated_at,member_code,photo_blob,photo_mime) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .run(
              x.firstName,
              x.lastName,
              x.phone,
              x.email,
              x.dateOfBirth,
              x.gender,
              x.address,
              x.emergencyName,
              x.emergencyPhone,
              x.status,
              x.notes,
              x.photoPath,
              t,
              t,
              memberCode,
              photoBlob,
              photoMime,
            ).lastInsertRowid,
        );
      }
      const saveDocument = this.db.prepare(
        `INSERT INTO member_documents(member_id,requirement_id,file_name,mime_type,file_blob,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(member_id,requirement_id) DO UPDATE SET file_name=excluded.file_name,mime_type=excluded.mime_type,file_blob=excluded.file_blob,uploaded_by=excluded.uploaded_by,created_at=excluded.created_at`,
      );
      for (const document of documents)
        saveDocument.run(
          entity,
          document.requirementId,
          document.name,
          document.mime,
          document.data,
          staffId,
          t,
        );
      this.log(staffId, "member", entity!, id ? "updated" : "created", {
        documents: documents.map((document) => document.name),
      });
      return entity;
    })();
  }
  documentRequirements() {
    return this.db
      .prepare(
        "SELECT id,name,created_at createdAt FROM document_requirements WHERE archived_at IS NULL ORDER BY name",
      )
      .all();
  }
  addDocumentRequirement(name: string, staffId: number) {
    return this.db.transaction(() => {
      const id = Number(
        this.db
          .prepare(
            "INSERT INTO document_requirements(name,created_at) VALUES(?,?)",
          )
          .run(name, now()).lastInsertRowid,
      );
      this.log(staffId, "document_requirement", id, "created", { name });
      return id;
    })();
  }
  archiveDocumentRequirement(id: number, staffId: number) {
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE document_requirements SET archived_at=? WHERE id=?")
        .run(now(), id);
      this.log(staffId, "document_requirement", id, "archived");
    })();
  }
  archiveMember(id: number, staffId: number) {
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE members SET archived_at=?,updated_at=? WHERE id=?")
        .run(now(), now(), id);
      this.log(staffId, "member", id, "archived");
    })();
  }
  member(id: number) {
    const rawMember = this.db
      .prepare("SELECT * FROM members WHERE id=?")
      .get(id) as any;
    if (!rawMember) throw new Error("Member not found");
    const {
      photo_blob: _photoBlob,
      photo_mime: _photoMime,
      ...member
    } = rawMember || {};
    return {
      member,
      memberships: this.db
        .prepare(
          `SELECT x.*,p.name plan_name FROM memberships x JOIN plans p ON p.id=x.plan_id WHERE x.member_id=? ORDER BY x.created_at DESC`,
        )
        .all(id),
      attendance: this.db
        .prepare(
          "SELECT * FROM attendance WHERE member_id=? ORDER BY checked_in_at DESC LIMIT 50",
        )
        .all(id),
      payments: this.db
        .prepare(
          `SELECT y.* FROM payments y JOIN memberships x ON x.id=y.membership_id WHERE x.member_id=? ORDER BY y.paid_at DESC`,
        )
        .all(id),
      documents: this.db
        .prepare(
          `SELECT d.id,d.requirement_id requirementId,d.file_name fileName,d.mime_type mimeType,d.created_at createdAt,r.name requirementName FROM member_documents d JOIN document_requirements r ON r.id=d.requirement_id WHERE d.member_id=? ORDER BY r.name`,
        )
        .all(id),
      history: this.history("member", id),
    };
  }
  memberPhoto(id: number) {
    return this.db
      .prepare("SELECT photo_blob data,photo_mime mime FROM members WHERE id=?")
      .get(id) as { data: Buffer | null; mime: string | null } | undefined;
  }
  faceStatus(memberId: number) {
    return (
      this.db
        .prepare(
          "SELECT model_id modelId,model_version modelVersion,quality_score qualityScore,consented_at consentedAt,updated_at updatedAt FROM member_face_templates WHERE member_id=?",
        )
        .get(memberId) || null
    );
  }
  faceTemplates() {
    const rows = this.db
      .prepare(
        "SELECT member_id memberId,embedding,dimensions FROM member_face_templates JOIN members ON members.id=member_id WHERE members.archived_at IS NULL AND members.status<>'banned'",
      )
      .all() as any[];
    return rows.map((row) => ({
      memberId: row.memberId,
      embedding: Array.from(
        new Float32Array(
          row.embedding.buffer,
          row.embedding.byteOffset,
          row.dimensions,
        ),
      ),
    }));
  }
  saveFaceTemplate(
    memberId: number,
    embedding: number[],
    quality: number,
    staffId: number,
  ) {
    this.requireMember(memberId);
    const timestamp = now();
    const data = Buffer.from(new Float32Array(embedding).buffer);
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO member_face_templates(member_id,embedding,dimensions,model_id,model_version,quality_score,consented_at,enrolled_by,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET embedding=excluded.embedding,dimensions=excluded.dimensions,model_id=excluded.model_id,model_version=excluded.model_version,quality_score=excluded.quality_score,consented_at=excluded.consented_at,enrolled_by=excluded.enrolled_by,updated_at=excluded.updated_at`,
        )
        .run(
          memberId,
          data,
          embedding.length,
          "insightface-buffalo_sc",
          "0.7",
          quality,
          timestamp,
          staffId,
          timestamp,
        );
      this.log(staffId, "member_face", memberId, "enrolled", {
        model: "insightface-buffalo_sc",
        quality,
      });
    })();
  }
  removeFaceTemplate(memberId: number, staffId: number) {
    this.db.transaction(() => {
      const result = this.db
        .prepare("DELETE FROM member_face_templates WHERE member_id=?")
        .run(memberId);
      if (!result.changes)
        throw new Error("This member does not have an enrolled face");
      this.log(staffId, "member_face", memberId, "removed");
    })();
  }
  memberDocument(id: number, memberId: number) {
    return this.db
      .prepare(
        "SELECT file_name fileName,file_blob data FROM member_documents WHERE id=? AND member_id=?",
      )
      .get(id, memberId) as { fileName: string; data: Buffer } | undefined;
  }
  plans() {
    return this.db
      .prepare("SELECT * FROM plans WHERE archived_at IS NULL ORDER BY name")
      .all();
  }
  savePlan(x: PlanInput, id: number | undefined, staffId: number) {
    return this.db.transaction(() => {
      const t = now();
      let eid = id;
      if (id)
        this.db
          .prepare(
            "UPDATE plans SET name=?,description=?,duration_months=?,training_minutes_limit=?,price_minor=?,updated_at=? WHERE id=? AND archived_at IS NULL",
          )
          .run(
            x.name,
            x.description,
            x.durationMonths,
            x.trainingHours == null ? null : Math.round(x.trainingHours * 60),
            x.priceMinor,
            t,
            id,
          );
      else
        eid = Number(
          this.db
            .prepare(
              "INSERT INTO plans(name,description,duration_months,training_minutes_limit,price_minor,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            )
            .run(
              x.name,
              x.description,
              x.durationMonths,
              x.trainingHours == null ? null : Math.round(x.trainingHours * 60),
              x.priceMinor,
              t,
              t,
            ).lastInsertRowid,
        );
      this.log(staffId, "plan", eid!, id ? "updated" : "created");
      return eid;
    })();
  }
  archivePlan(id: number, staffId: number) {
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE plans SET archived_at=?,updated_at=? WHERE id=?")
        .run(now(), now(), id);
      this.log(staffId, "plan", id, "archived");
    })();
  }
  memberships() {
    return this.db
      .prepare(
        `SELECT x.*,m.first_name||' '||m.last_name member_name,p.name plan_name,p.price_minor,
          (SELECT COUNT(*) FROM membership_freeze_periods f WHERE f.membership_id=x.id) freeze_count,
          (SELECT COALESCE(SUM(COALESCE(f.duration_ms,(julianday('now')-julianday(f.frozen_at))*86400000)),0) FROM membership_freeze_periods f WHERE f.membership_id=x.id) frozen_duration_ms,
          CASE WHEN x.status='active' AND x.expires_at IS NOT NULL AND datetime(x.expires_at)<datetime('now') THEN 'expired'
               WHEN x.status='active' AND x.training_minutes_limit IS NOT NULL AND x.used_minutes>=x.training_minutes_limit THEN 'exhausted'
               ELSE x.status END effective_status
         FROM memberships x JOIN members m ON m.id=x.member_id JOIN plans p ON p.id=x.plan_id ORDER BY x.end_date DESC`,
      )
      .all();
  }
  assign(
    memberId: number,
    planId: number,
    startDate: string,
    autoRenew: boolean,
    staffId: number,
  ) {
    this.requireMember(memberId);
    const p = this.db
      .prepare("SELECT * FROM plans WHERE id=? AND archived_at IS NULL")
      .get(planId) as any;
    if (!p) throw new Error("Plan not found");
    return this.db.transaction(() => {
      const t = now();
      const id = Number(
        this.db
          .prepare(
            `INSERT INTO memberships(member_id,plan_id,start_date,end_date,expires_at,status,auto_renew,training_minutes_limit,used_minutes,created_at,updated_at) VALUES(?,?,?,?,?, 'active',?,?,0,?,?)`,
          )
          .run(
            memberId,
            planId,
            startDate,
            planEnd(startDate, p.duration_months),
            p.duration_months > 0
              ? `${planEnd(startDate, p.duration_months)}T23:59:59.999Z`
              : null,
            autoRenew ? 1 : 0,
            p.training_minutes_limit,
            t,
            t,
          ).lastInsertRowid,
      );
      this.log(staffId, "membership", id, "assigned");
      return id;
    })();
  }
  membershipAction(id: number, action: string, staffId: number) {
    return this.db.transaction(() => {
      const x = this.db
        .prepare(
          "SELECT x.*,p.duration_months FROM memberships x JOIN plans p ON p.id=x.plan_id WHERE x.id=?",
        )
        .get(id) as any;
      if (!x) throw new Error("Membership not found");
      const t = now();
      if (action === "renew") {
        const today = format(new Date(), "yyyy-MM-dd");
        const start =
          x.duration_months > 0 &&
          isAfter(new Date(x.end_date), new Date(today))
            ? format(
                addDays(new Date(`${x.end_date}T12:00:00`), 1),
                "yyyy-MM-dd",
              )
            : today;
        this.db
          .prepare(
            `UPDATE memberships SET start_date=?,end_date=?,expires_at=?,status='active',used_minutes=0,cancelled_at=NULL,frozen_at=NULL,updated_at=? WHERE id=?`,
          )
          .run(
            start,
            planEnd(start, x.duration_months),
            x.duration_months > 0
              ? `${planEnd(start, x.duration_months)}T23:59:59.999Z`
              : null,
            t,
            id,
          );
        this.db
          .prepare(
            "UPDATE membership_freeze_periods SET resumed_at=?,duration_ms=?,resumed_by=? WHERE membership_id=? AND resumed_at IS NULL",
          )
          .run(
            t,
            x.frozen_at
              ? Math.max(
                  0,
                  new Date(t).getTime() - new Date(x.frozen_at).getTime(),
                )
              : 0,
            staffId,
            id,
          );
      } else if (action === "freeze") {
        const openVisit = this.db
          .prepare(
            "SELECT 1 FROM attendance WHERE membership_id=? AND checked_out_at IS NULL",
          )
          .get(id);
        if (openVisit)
          throw new Error(
            "Check this member out before freezing the membership",
          );
        this.db
          .prepare(
            `UPDATE memberships SET status='frozen',frozen_at=?,updated_at=? WHERE id=?`,
          )
          .run(t, t, id);
        this.db
          .prepare(
            "INSERT INTO membership_freeze_periods(membership_id,frozen_at,frozen_by) VALUES(?,?,?)",
          )
          .run(id, t, staffId);
      } else if (action === "resume") {
        if (!x.frozen_at) throw new Error("Membership is not frozen");
        const durationMs = Math.max(
          0,
          new Date(t).getTime() - new Date(x.frozen_at).getTime(),
        );
        const expiresAt = x.expires_at
          ? new Date(
              new Date(x.expires_at).getTime() + durationMs,
            ).toISOString()
          : null;
        const endDate = expiresAt ? expiresAt.slice(0, 10) : NO_EXPIRY_DATE;
        this.db
          .prepare(
            `UPDATE memberships SET status='active',end_date=?,expires_at=?,frozen_at=NULL,updated_at=? WHERE id=?`,
          )
          .run(endDate, expiresAt, t, id);
        this.db
          .prepare(
            "UPDATE membership_freeze_periods SET resumed_at=?,duration_ms=?,resumed_by=? WHERE membership_id=? AND resumed_at IS NULL",
          )
          .run(t, durationMs, staffId, id);
      } else if (action === "cancel") {
        this.db
          .prepare(
            `UPDATE memberships SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=?`,
          )
          .run(t, t, id);
        this.db
          .prepare(
            "UPDATE membership_freeze_periods SET resumed_at=?,duration_ms=?,resumed_by=? WHERE membership_id=? AND resumed_at IS NULL",
          )
          .run(
            t,
            x.frozen_at
              ? Math.max(
                  0,
                  new Date(t).getTime() - new Date(x.frozen_at).getTime(),
                )
              : 0,
            staffId,
            id,
          );
      } else throw new Error("Unknown membership action");
      this.log(staffId, "membership", id, action);
    })();
  }
  attendance() {
    return this.db
      .prepare(
        `SELECT a.*,m.first_name||' '||m.last_name member_name FROM attendance a JOIN members m ON m.id=a.member_id ORDER BY checked_in_at DESC LIMIT 500`,
      )
      .all();
  }
  checkIn(memberId: number, staffId: number, method = "manual") {
    this.requireMember(memberId);
    return this.db.transaction(() => {
      const open = this.db
        .prepare(
          "SELECT 1 FROM attendance WHERE member_id=? AND checked_out_at IS NULL",
        )
        .get(memberId);
      if (open) throw new Error("This member is already checked in");
      const today = format(new Date(), "yyyy-MM-dd");
      const membership = this.db
        .prepare(
          `SELECT * FROM memberships
        WHERE member_id=? AND status='active' AND start_date<=? AND (expires_at IS NULL OR datetime(expires_at)>=datetime('now'))
          AND (training_minutes_limit IS NULL OR used_minutes<training_minutes_limit)
        ORDER BY COALESCE(expires_at,'9999-12-31T23:59:59.999Z'),id LIMIT 1`,
        )
        .get(memberId, today) as any;
      if (!membership)
        throw new Error(
          "This member has no active membership with time remaining",
        );
      const id = Number(
        this.db
          .prepare(
            "INSERT INTO attendance(member_id,checked_in_at,method,staff_id,membership_id) VALUES(?,?,?,?,?)",
          )
          .run(memberId, now(), method, staffId, membership.id).lastInsertRowid,
      );
      this.log(staffId, "attendance", id, "checked_in");
      return id;
    })();
  }
  kioskCheckIn(code: string, staffId: number) {
    const normalized = code.trim().toUpperCase();
    const member = this.db
      .prepare(
        "SELECT * FROM members WHERE member_code=? AND archived_at IS NULL",
      )
      .get(normalized) as any;
    if (!member) throw new Error("Member code not recognized");
    return this.kioskCheckInMember(member.id, staffId, "code");
  }
  kioskCheckInMember(
    memberId: number,
    staffId: number,
    method: "code" | "face",
  ) {
    const member = this.requireMember(memberId);
    this.checkIn(member.id, staffId, method);
    const membership = this.db
      .prepare(
        `SELECT x.end_date,x.status,x.training_minutes_limit,x.used_minutes,p.name plan_name FROM memberships x JOIN plans p ON p.id=x.plan_id WHERE x.member_id=? ORDER BY CASE WHEN x.status='active' THEN 0 ELSE 1 END,x.end_date DESC LIMIT 1`,
      )
      .get(member.id) as any;
    if (membership?.training_minutes_limit != null)
      membership.remaining_minutes = Math.max(
        0,
        membership.training_minutes_limit - membership.used_minutes,
      );
    return {
      memberId: member.id,
      memberCode: member.member_code,
      memberName: `${member.first_name} ${member.last_name}`,
      photoPath: member.photo_path,
      membership: membership || null,
      checkedInAt: now(),
    };
  }
  membershipFreezeHistory(membershipId: number) {
    return this.db
      .prepare(
        `SELECT f.id,f.frozen_at,f.resumed_at,f.duration_ms,
      freezer.name frozen_by_name,resumer.name resumed_by_name
      FROM membership_freeze_periods f
      JOIN staff freezer ON freezer.id=f.frozen_by
      LEFT JOIN staff resumer ON resumer.id=f.resumed_by
      WHERE f.membership_id=? ORDER BY f.frozen_at DESC`,
      )
      .all(membershipId);
  }
  checkOut(id: number, staffId: number) {
    this.db.transaction(() => {
      const visit = this.db
        .prepare(
          "SELECT * FROM attendance WHERE id=? AND checked_out_at IS NULL",
        )
        .get(id) as any;
      if (!visit) throw new Error("Open visit not found");
      const checkedOutAt = now();
      const minutes = Math.max(
        1,
        Math.ceil(
          (new Date(checkedOutAt).getTime() -
            new Date(visit.checked_in_at).getTime()) /
            60000,
        ),
      );
      const r = this.db
        .prepare(
          "UPDATE attendance SET checked_out_at=? WHERE id=? AND checked_out_at IS NULL",
        )
        .run(checkedOutAt, id);
      if (!r.changes) throw new Error("Open visit not found");
      if (visit.membership_id)
        this.db
          .prepare(
            `UPDATE memberships SET used_minutes=used_minutes+?,
        status=CASE WHEN training_minutes_limit IS NOT NULL AND used_minutes+?>=training_minutes_limit THEN 'exhausted' ELSE status END,
        updated_at=? WHERE id=?`,
          )
          .run(minutes, minutes, checkedOutAt, visit.membership_id);
      this.log(staffId, "attendance", id, "checked_out", {
        minutes,
        membershipId: visit.membership_id,
      });
    })();
  }
  payments() {
    return this.db
      .prepare(
        `SELECT y.*,m.first_name||' '||m.last_name member_name,p.name plan_name FROM payments y JOIN memberships x ON x.id=y.membership_id JOIN members m ON m.id=x.member_id JOIN plans p ON p.id=x.plan_id ORDER BY y.paid_at DESC`,
      )
      .all();
  }
  pay(
    membershipId: number,
    amountMinor: number,
    method: string,
    staffId: number,
  ) {
    return this.db.transaction(() => {
      const x = this.db
        .prepare(
          `SELECT x.id,x.start_date,x.end_date,p.name plan_name,m.first_name,m.last_name,s.* FROM memberships x JOIN plans p ON p.id=x.plan_id JOIN members m ON m.id=x.member_id JOIN settings s ON s.id=1 WHERE x.id=?`,
        )
        .get(membershipId) as any;
      if (!x) throw new Error("Membership not found");
      const seq = this.db
        .prepare("SELECT next_number n FROM receipt_sequence WHERE id=1")
        .get() as any;
      this.db
        .prepare(
          "UPDATE receipt_sequence SET next_number=next_number+1 WHERE id=1",
        )
        .run();
      const receipt = `${new Date().getFullYear()}-${String(seq.n).padStart(6, "0")}`;
      const id = Number(
        this.db
          .prepare(
            `INSERT INTO payments(membership_id,amount_minor,method,status,receipt_number,staff_id,paid_at,gym_snapshot,member_snapshot) VALUES(?,?,?,'paid',?,?,?,?,?)`,
          )
          .run(
            membershipId,
            amountMinor,
            method,
            receipt,
            staffId,
            now(),
            JSON.stringify({
              name: x.gym_name,
              locale: x.locale,
              currency: x.currency,
              address: x.address,
              phone: x.phone,
              email: x.email,
              taxId: x.tax_id,
              receiptFooter: x.receipt_footer,
              receiptPaper: x.receipt_paper,
              receiptColor: x.receipt_color,
              logoPath: x.logo_path,
            }),
            JSON.stringify({
              name: `${x.first_name} ${x.last_name}`,
              planName: x.plan_name,
              membershipStart: x.start_date,
              membershipEnd: x.end_date,
            }),
          ).lastInsertRowid,
      );
      this.log(staffId, "payment", id, "recorded", { receipt });
      return id;
    })();
  }
  refund(id: number, staffId: number) {
    this.db.transaction(() => {
      const p = this.db
        .prepare(`SELECT * FROM payments WHERE id=? AND status='paid'`)
        .get(id) as any;
      if (!p) throw new Error("Paid payment not found");
      this.db
        .prepare(
          `UPDATE payments SET status='refunded',refunded_at=? WHERE id=?`,
        )
        .run(now(), id);
      this.log(staffId, "payment", id, "refunded");
    })();
  }
  dashboard() {
    return {
      openVisits: this.db
        .prepare(
          `SELECT COUNT(*) n FROM attendance WHERE checked_out_at IS NULL`,
        )
        .get(),
      expiring: this.db
        .prepare(
          `SELECT COUNT(*) n FROM memberships WHERE status='active' AND end_date BETWEEN date('now') AND date('now','+14 day')`,
        )
        .get(),
      todayRevenue: this.db
        .prepare(
          `SELECT COALESCE(SUM(amount_minor),0) n FROM payments WHERE status='paid' AND date(paid_at)=date('now')`,
        )
        .get(),
      recent: this.payments().slice(0, 5),
      checkedIn: this.db
        .prepare(
          `SELECT a.id,a.checked_in_at,m.first_name||' '||m.last_name member_name,m.member_code FROM attendance a JOIN members m ON m.id=a.member_id WHERE a.checked_out_at IS NULL ORDER BY a.checked_in_at DESC LIMIT 8`,
        )
        .all(),
      expiringSoon: this.db
        .prepare(
          `SELECT x.id,x.end_date,m.first_name||' '||m.last_name member_name,p.name plan_name,CAST(julianday(x.end_date)-julianday(date('now')) AS INTEGER) days_left FROM memberships x JOIN members m ON m.id=x.member_id JOIN plans p ON p.id=x.plan_id WHERE x.status='active' AND x.end_date BETWEEN date('now') AND date('now','+14 day') ORDER BY x.end_date LIMIT 8`,
        )
        .all(),
    };
  }
  settings() {
    const row = this.db
      .prepare(
        "SELECT gym_name gymName,locale,currency,timezone,address,phone,email,tax_id taxId,receipt_footer receiptFooter,receipt_paper receiptPaper,receipt_color receiptColor,logo_path logoPath,face_recognition_enabled faceRecognitionEnabled,kiosk_welcome_timeout_seconds kioskWelcomeTimeoutSeconds,gym_closing_time gymClosingTime,kiosk_exit_pin_hash IS NOT NULL kioskExitPinConfigured FROM settings WHERE id=1",
      )
      .get() as any;
    return row
      ? {
          ...row,
          faceRecognitionEnabled: !!row.faceRecognitionEnabled,
          kioskExitPinConfigured: !!row.kioskExitPinConfigured,
        }
      : row;
  }
  updateSettings(x: SettingsInput, staffId: number) {
    this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE settings SET gym_name=?,locale=?,currency=?,timezone=?,address=?,phone=?,email=?,tax_id=?,receipt_footer=?,receipt_paper=?,receipt_color=?,logo_path=?,face_recognition_enabled=?,kiosk_welcome_timeout_seconds=?,gym_closing_time=?,kiosk_exit_pin_hash=CASE WHEN ?='' THEN kiosk_exit_pin_hash ELSE ? END,updated_at=? WHERE id=1",
        )
        .run(
          x.gymName,
          x.locale,
          x.currency.toUpperCase(),
          x.timezone,
          x.address,
          x.phone,
          x.email,
          x.taxId,
          x.receiptFooter,
          x.receiptPaper,
          x.receiptColor,
          x.logoPath,
          x.faceRecognitionEnabled ? 1 : 0,
          x.kioskWelcomeTimeoutSeconds ?? 8,
          x.gymClosingTime || "22:00",
          x.kioskExitPin || "",
          x.kioskExitPin ? hashPin(x.kioskExitPin) : null,
          now(),
        );
      this.log(staffId, "settings", 1, "updated");
    })();
  }
  verifyKioskExitPin(pin: string) {
    const row = this.db
      .prepare("SELECT kiosk_exit_pin_hash hash FROM settings WHERE id=1")
      .get() as any;
    return !!row?.hash && verifyPin(pin, row.hash);
  }
  reports(from = "1900-01-01", to = "2999-12-31") {
    const between = [from, to];
    return {
      members: {
        total: (
          this.db
            .prepare(`SELECT COUNT(*) n FROM members WHERE archived_at IS NULL`)
            .get() as any
        ).n,
        active: (
          this.db
            .prepare(
              `SELECT COUNT(*) n FROM members WHERE archived_at IS NULL AND status='active'`,
            )
            .get() as any
        ).n,
        inactive: (
          this.db
            .prepare(
              `SELECT COUNT(*) n FROM members WHERE archived_at IS NULL AND status='inactive'`,
            )
            .get() as any
        ).n,
        joined: (
          this.db
            .prepare(
              "SELECT COUNT(*) n FROM members WHERE date(created_at) BETWEEN date(?) AND date(?)",
            )
            .get(...between) as any
        ).n,
        growth: this.db
          .prepare(
            `SELECT substr(created_at,1,10) day,COUNT(*) value FROM members WHERE date(created_at) BETWEEN date(?) AND date(?) GROUP BY day ORDER BY day`,
          )
          .all(...between),
        status: this.db
          .prepare(
            "SELECT status label,COUNT(*) value FROM members WHERE archived_at IS NULL GROUP BY status ORDER BY value DESC",
          )
          .all(),
      },
      attendance: {
        total: (
          this.db
            .prepare(
              `SELECT COUNT(*) n FROM attendance WHERE date(checked_in_at) BETWEEN date(?) AND date(?)`,
            )
            .get(...between) as any
        ).n,
        uniqueMembers: (
          this.db
            .prepare(
              "SELECT COUNT(DISTINCT member_id) n FROM attendance WHERE date(checked_in_at) BETWEEN date(?) AND date(?)",
            )
            .get(...between) as any
        ).n,
        trend: this.db
          .prepare(
            `SELECT substr(checked_in_at,1,10) day,COUNT(*) value FROM attendance WHERE date(checked_in_at) BETWEEN date(?) AND date(?) GROUP BY day ORDER BY day`,
          )
          .all(...between),
        peakHours: this.db
          .prepare(
            `SELECT strftime('%H',checked_in_at) hour,COUNT(*) value FROM attendance WHERE date(checked_in_at) BETWEEN date(?) AND date(?) GROUP BY hour ORDER BY value DESC`,
          )
          .all(...between),
      },
      revenue: {
        total: (
          this.db
            .prepare(
              `SELECT COALESCE(SUM(amount_minor),0) n FROM payments WHERE status='paid' AND date(paid_at) BETWEEN date(?) AND date(?)`,
            )
            .get(...between) as any
        ).n,
        transactions: (
          this.db
            .prepare(
              "SELECT COUNT(*) n FROM payments WHERE status='paid' AND date(paid_at) BETWEEN date(?) AND date(?)",
            )
            .get(...between) as any
        ).n,
        refunds: (
          this.db
            .prepare(
              "SELECT COUNT(*) n FROM payments WHERE status='refunded' AND date(refunded_at) BETWEEN date(?) AND date(?)",
            )
            .get(...between) as any
        ).n,
        monthly: this.db
          .prepare(
            `SELECT substr(paid_at,1,10) day,SUM(CASE WHEN status='paid' THEN amount_minor ELSE 0 END) value FROM payments WHERE date(paid_at) BETWEEN date(?) AND date(?) GROUP BY day ORDER BY day`,
          )
          .all(...between),
        byPlan: this.db
          .prepare(
            `SELECT p.name label,SUM(y.amount_minor) value FROM payments y JOIN memberships x ON x.id=y.membership_id JOIN plans p ON p.id=x.plan_id WHERE y.status='paid' AND date(y.paid_at) BETWEEN date(?) AND date(?) GROUP BY p.id ORDER BY value DESC`,
          )
          .all(...between),
        methods: this.db
          .prepare(
            "SELECT method label,COUNT(*) value FROM payments WHERE status='paid' AND date(paid_at) BETWEEN date(?) AND date(?) GROUP BY method ORDER BY value DESC",
          )
          .all(...between),
      },
      memberships: {
        status: this.db
          .prepare(
            "SELECT status label,COUNT(*) value FROM memberships GROUP BY status ORDER BY value DESC",
          )
          .all(),
      },
      staffActivity: this.db
        .prepare(
          `SELECT COALESCE(s.name,'System') label,COUNT(*) value FROM activity_log a LEFT JOIN staff s ON s.id=a.staff_id WHERE date(a.created_at) BETWEEN date(?) AND date(?) GROUP BY a.staff_id ORDER BY value DESC LIMIT 8`,
        )
        .all(...between),
    };
  }
  history(entityType: string, entityId: number) {
    return this.db
      .prepare(
        `SELECT a.*,s.name staff_name FROM activity_log a LEFT JOIN staff s ON s.id=a.staff_id WHERE entity_type=? AND entity_id=? ORDER BY created_at DESC`,
      )
      .all(entityType, entityId);
  }
  auditLog(filters: {
    staffId?: number;
    entityType?: string;
    action?: string;
    from?: string;
    to?: string;
    search: string;
  }) {
    const rows = this.db
      .prepare(
        `
      SELECT a.id,a.created_at createdAt,a.entity_type entityType,a.entity_id entityId,a.action,a.details,
             s.name staffName,r.name staffRole
      FROM activity_log a
      LEFT JOIN staff s ON s.id=a.staff_id
      LEFT JOIN roles r ON r.id=s.role_id
      WHERE (? IS NULL OR a.staff_id=?)
        AND (? IS NULL OR a.entity_type=?)
        AND (? IS NULL OR a.action=?)
        AND (? IS NULL OR date(a.created_at)>=date(?))
        AND (? IS NULL OR date(a.created_at)<=date(?))
        AND (?='' OR COALESCE(s.name,'System') LIKE ? OR a.entity_type LIKE ? OR a.action LIKE ? OR a.details LIKE ?)
      ORDER BY a.created_at DESC,a.id DESC LIMIT 1000
    `,
      )
      .all(
        filters.staffId ?? null,
        filters.staffId ?? null,
        filters.entityType ?? null,
        filters.entityType ?? null,
        filters.action ?? null,
        filters.action ?? null,
        filters.from ?? null,
        filters.from ?? null,
        filters.to ?? null,
        filters.to ?? null,
        filters.search,
        `%${filters.search}%`,
        `%${filters.search}%`,
        `%${filters.search}%`,
        `%${filters.search}%`,
      );
    return {
      rows,
      staff: this.db.prepare("SELECT id,name FROM staff ORDER BY name").all(),
      entityTypes: (
        this.db
          .prepare(
            "SELECT DISTINCT entity_type value FROM activity_log ORDER BY entity_type",
          )
          .all() as any[]
      ).map((x) => x.value),
      actions: (
        this.db
          .prepare(
            "SELECT DISTINCT action value FROM activity_log ORDER BY action",
          )
          .all() as any[]
      ).map((x) => x.value),
    };
  }
}
