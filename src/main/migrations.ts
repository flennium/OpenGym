import type Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";

const NO_EXPIRY_DATE = "9999-12-31";

/** Applies the ordered, backward-compatible SQLite schema migrations. */
export function migrateDatabase(db: Database.Database) {
  db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),gym_name TEXT NOT NULL,locale TEXT NOT NULL,currency TEXT NOT NULL,timezone TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS roles(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS permissions(role_id INTEGER,module TEXT,can_view INTEGER,can_create INTEGER,can_edit INTEGER,can_delete INTEGER,PRIMARY KEY(role_id,module),FOREIGN KEY(role_id) REFERENCES roles(id));
      CREATE TABLE IF NOT EXISTS staff(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,role_id INTEGER NOT NULL,pin_hash TEXT NOT NULL,archived_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(role_id) REFERENCES roles(id));
      CREATE TABLE IF NOT EXISTS members(id INTEGER PRIMARY KEY AUTOINCREMENT,first_name TEXT NOT NULL,last_name TEXT NOT NULL,phone TEXT,email TEXT,date_of_birth TEXT,gender TEXT,address TEXT,emergency_name TEXT,emergency_phone TEXT,status TEXT NOT NULL,notes TEXT,photo_path TEXT,archived_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plans(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,description TEXT,duration_months INTEGER NOT NULL,price_minor INTEGER NOT NULL,archived_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memberships(id INTEGER PRIMARY KEY AUTOINCREMENT,member_id INTEGER NOT NULL,plan_id INTEGER NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,status TEXT NOT NULL,auto_renew INTEGER NOT NULL DEFAULT 0,frozen_at TEXT,cancelled_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(member_id) REFERENCES members(id),FOREIGN KEY(plan_id) REFERENCES plans(id));
      CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY AUTOINCREMENT,member_id INTEGER NOT NULL,checked_in_at TEXT NOT NULL,checked_out_at TEXT,method TEXT NOT NULL DEFAULT 'manual',staff_id INTEGER NOT NULL,FOREIGN KEY(member_id) REFERENCES members(id),FOREIGN KEY(staff_id) REFERENCES staff(id));
      CREATE UNIQUE INDEX IF NOT EXISTS one_open_visit ON attendance(member_id) WHERE checked_out_at IS NULL;
      CREATE TABLE IF NOT EXISTS receipt_sequence(id INTEGER PRIMARY KEY CHECK(id=1),next_number INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,membership_id INTEGER NOT NULL,amount_minor INTEGER NOT NULL,method TEXT NOT NULL,status TEXT NOT NULL,receipt_number TEXT UNIQUE NOT NULL,staff_id INTEGER NOT NULL,paid_at TEXT NOT NULL,refunded_at TEXT,refund_of_id INTEGER,gym_snapshot TEXT NOT NULL,member_snapshot TEXT NOT NULL,FOREIGN KEY(membership_id) REFERENCES memberships(id),FOREIGN KEY(staff_id) REFERENCES staff(id),FOREIGN KEY(refund_of_id) REFERENCES payments(id));
      CREATE TABLE IF NOT EXISTS activity_log(id INTEGER PRIMARY KEY AUTOINCREMENT,staff_id INTEGER,entity_type TEXT NOT NULL,entity_id INTEGER,action TEXT NOT NULL,details TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL,FOREIGN KEY(staff_id) REFERENCES staff(id));
      CREATE TABLE IF NOT EXISTS internal_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT OR IGNORE INTO receipt_sequence(id,next_number) VALUES(1,1);
      INSERT OR IGNORE INTO roles(id,name) VALUES(1,'Owner'),(2,'Admin'),(3,'Front Desk'),(4,'Trainer');
      INSERT OR IGNORE INTO permissions(role_id,module,can_view,can_create,can_edit,can_delete) VALUES
        (1,'Members',1,1,1,1),(1,'Memberships',1,1,1,1),(1,'Attendance',1,1,1,1),(1,'Payments',1,1,1,1),(1,'Staff',1,1,1,1),(1,'Reports',1,1,1,1),
        (2,'Members',1,1,1,1),(2,'Memberships',1,1,1,1),(2,'Attendance',1,1,1,1),(2,'Payments',1,1,1,1),(2,'Staff',1,0,0,0),(2,'Reports',1,0,0,0),
        (3,'Members',1,1,1,0),(3,'Memberships',1,1,1,0),(3,'Attendance',1,1,1,1),(3,'Payments',1,1,0,0),(3,'Staff',0,0,0,0),(3,'Reports',0,0,0,0),
        (4,'Members',1,0,0,0),(4,'Memberships',1,0,0,0),(4,'Attendance',1,0,0,0),(4,'Payments',0,0,0,0),(4,'Staff',0,0,0,0),(4,'Reports',0,0,0,0);
      INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(1,datetime('now'));
    `);
      const memberColumns = db.pragma("table_info(members)") as any[];
      if (!memberColumns.some((column) => column.name === "member_code")) {
        db.exec("ALTER TABLE members ADD COLUMN member_code TEXT");
        db.exec(
          "CREATE UNIQUE INDEX IF NOT EXISTS member_code_unique ON members(member_code) WHERE member_code IS NOT NULL",
        );
        db
          .prepare(
            "UPDATE members SET member_code='OG-'||printf('%08d',id) WHERE member_code IS NULL",
          )
          .run();
        db
          .prepare(
            "INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(2,datetime('now'))",
          )
          .run();
      }
      const settingColumns = db.pragma("table_info(settings)") as any[];
      const receiptColumns: Array<[string, string]> = [
        ["address", "TEXT NOT NULL DEFAULT ''"],
        ["phone", "TEXT NOT NULL DEFAULT ''"],
        ["email", "TEXT NOT NULL DEFAULT ''"],
        ["tax_id", "TEXT NOT NULL DEFAULT ''"],
        [
          "receipt_footer",
          "TEXT NOT NULL DEFAULT 'Thank you for training with us.'",
        ],
        ["receipt_paper", "TEXT NOT NULL DEFAULT 'A4'"],
        ["receipt_color", "TEXT NOT NULL DEFAULT '#17202A'"],
        ["logo_path", "TEXT"],
      ];
      for (const [name, definition] of receiptColumns)
        if (!settingColumns.some((column) => column.name === name))
          db.exec(`ALTER TABLE settings ADD COLUMN ${name} ${definition}`);
      db
        .prepare(
          "INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(3,datetime('now'))",
        )
        .run();
      const refreshedMemberColumns = db.pragma(
        "table_info(members)",
      ) as any[];
      if (!refreshedMemberColumns.some((column) => column.name === "photo_blob"))
        db.exec("ALTER TABLE members ADD COLUMN photo_blob BLOB");
      if (!refreshedMemberColumns.some((column) => column.name === "photo_mime"))
        db.exec("ALTER TABLE members ADD COLUMN photo_mime TEXT");
      const legacyPhotos = db
        .prepare(
          "SELECT id,photo_path FROM members WHERE photo_path IS NOT NULL AND photo_blob IS NULL",
        )
        .all() as any[];
      const storeLegacy = db.prepare(
        "UPDATE members SET photo_blob=?,photo_mime=? WHERE id=?",
      );
      for (const member of legacyPhotos) {
        if (!existsSync(member.photo_path)) continue;
        const ext = String(member.photo_path).split(".").pop()?.toLowerCase();
        const mime =
          ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : "image/jpeg";
        storeLegacy.run(readFileSync(member.photo_path), mime, member.id);
      }
      db
        .prepare(
          "INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(4,datetime('now'))",
        )
        .run();
      db.exec(`CREATE TABLE IF NOT EXISTS staff_preferences(
        staff_id INTEGER PRIMARY KEY,
        theme TEXT NOT NULL DEFAULT 'Pulse',
        dark_mode INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(staff_id) REFERENCES staff(id) ON DELETE CASCADE
      )`);
      db
        .prepare(
          "INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(5,datetime('now'))",
        )
        .run();
      const planColumns = db.pragma("table_info(plans)") as any[];
      if (!planColumns.some((column) => column.name === "training_minutes_limit"))
        db.exec(
          "ALTER TABLE plans ADD COLUMN training_minutes_limit INTEGER",
        );
      const membershipColumns = db.pragma(
        "table_info(memberships)",
      ) as any[];
      if (
        !membershipColumns.some(
          (column) => column.name === "training_minutes_limit",
        )
      )
        db.exec(
          "ALTER TABLE memberships ADD COLUMN training_minutes_limit INTEGER",
        );
      if (!membershipColumns.some((column) => column.name === "used_minutes"))
        db.exec(
          "ALTER TABLE memberships ADD COLUMN used_minutes INTEGER NOT NULL DEFAULT 0",
        );
      const attendanceColumns = db.pragma("table_info(attendance)") as any[];
      if (!attendanceColumns.some((column) => column.name === "membership_id"))
        db.exec(
          "ALTER TABLE attendance ADD COLUMN membership_id INTEGER REFERENCES memberships(id)",
        );
      db
        .prepare(
          "INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(6,datetime('now'))",
        )
        .run();
      db.exec(`
        CREATE TABLE IF NOT EXISTS document_requirements(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,archived_at TEXT,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS member_documents(id INTEGER PRIMARY KEY AUTOINCREMENT,member_id INTEGER NOT NULL,requirement_id INTEGER NOT NULL,file_name TEXT NOT NULL,mime_type TEXT NOT NULL,file_blob BLOB NOT NULL,uploaded_by INTEGER NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(member_id) REFERENCES members(id),FOREIGN KEY(requirement_id) REFERENCES document_requirements(id),FOREIGN KEY(uploaded_by) REFERENCES staff(id));
        CREATE UNIQUE INDEX IF NOT EXISTS member_document_requirement ON member_documents(member_id,requirement_id);
      `);
      db
        .prepare(
          "INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(7,datetime('now'))",
        )
        .run();
      const latestSettingColumns = db.pragma(
        "table_info(settings)",
      ) as any[];
      if (
        !latestSettingColumns.some(
          (column) => column.name === "face_recognition_enabled",
        )
      )
        db.exec(
          "ALTER TABLE settings ADD COLUMN face_recognition_enabled INTEGER NOT NULL DEFAULT 0",
        );
      db
        .prepare(
          "UPDATE members SET member_code=printf('%010d',id) WHERE member_code IS NULL OR member_code NOT GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'",
        )
        .run();
      db
        .prepare(
          "INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(8,datetime('now'))",
        )
        .run();
      const v9Settings = db.pragma("table_info(settings)") as any[];
      if (
        !v9Settings.some(
          (column) => column.name === "kiosk_welcome_timeout_seconds",
        )
      )
        db.exec(
          "ALTER TABLE settings ADD COLUMN kiosk_welcome_timeout_seconds INTEGER NOT NULL DEFAULT 8",
        );
      if (!v9Settings.some((column) => column.name === "gym_closing_time"))
        db.exec(
          "ALTER TABLE settings ADD COLUMN gym_closing_time TEXT NOT NULL DEFAULT '22:00'",
        );
      if (!v9Settings.some((column) => column.name === "kiosk_exit_pin_hash"))
        db.exec("ALTER TABLE settings ADD COLUMN kiosk_exit_pin_hash TEXT");
      const v9Memberships = db.pragma("table_info(memberships)") as any[];
      if (!v9Memberships.some((column) => column.name === "expires_at")) {
        db.exec("ALTER TABLE memberships ADD COLUMN expires_at TEXT");
        db
          .prepare(
            "UPDATE memberships SET expires_at=CASE WHEN end_date=? THEN NULL ELSE end_date||'T23:59:59.999Z' END",
          )
          .run(NO_EXPIRY_DATE);
      }
      db.exec(`CREATE TABLE IF NOT EXISTS membership_freeze_periods(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        membership_id INTEGER NOT NULL,
        frozen_at TEXT NOT NULL,
        resumed_at TEXT,
        duration_ms INTEGER,
        frozen_by INTEGER NOT NULL,
        resumed_by INTEGER,
        FOREIGN KEY(membership_id) REFERENCES memberships(id),
        FOREIGN KEY(frozen_by) REFERENCES staff(id),
        FOREIGN KEY(resumed_by) REFERENCES staff(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_open_freeze ON membership_freeze_periods(membership_id) WHERE resumed_at IS NULL;`);
      db
        .prepare(
          "INSERT OR IGNORE INTO membership_freeze_periods(membership_id,frozen_at,frozen_by) SELECT id,frozen_at,1 FROM memberships WHERE status='frozen' AND frozen_at IS NOT NULL",
        )
        .run();
      db
        .prepare(
          "INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(9,datetime('now'))",
        )
        .run();
      db.exec(`CREATE TABLE IF NOT EXISTS member_face_templates(
        member_id INTEGER PRIMARY KEY,
        embedding BLOB NOT NULL,
        dimensions INTEGER NOT NULL,
        model_id TEXT NOT NULL,
        model_version TEXT NOT NULL,
        quality_score REAL NOT NULL,
        consented_at TEXT NOT NULL,
        enrolled_by INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(member_id) REFERENCES members(id),
        FOREIGN KEY(enrolled_by) REFERENCES staff(id)
      )`);
      db
        .prepare(
          "INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(10,datetime('now'))",
        )
        .run();
}
