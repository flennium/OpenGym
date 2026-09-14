import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
} from "electron";
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
import { FaceRecognitionService } from "./face-recognition.js";
import { registerMemberHandlers } from "./ipc/member.js";
import { registerOperationsHandlers } from "./ipc/operations.js";
import { registerAdministrationHandlers } from "./ipc/administration.js";
import { registerReceiptHandlers } from "./ipc/receipt.js";
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
let faces: FaceRecognitionService;
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
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin))
    throw new Error("Current PIN required");
  const row = store.db
    .prepare("SELECT pin_hash FROM staff WHERE id=? AND archived_at IS NULL")
    .get(s.id) as any;
  if (!row || !verifyPin(pin, row.pin_hash))
    throw new Error("Current PIN is incorrect");
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
  const configuredLogo = store?.isSetup()
    ? (store.settings() as any).logoPath
    : null;
  const logoPath =
    configuredLogo && existsSync(configuredLogo)
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
  void dialog
    .showMessageBox(win, {
      type: "warning",
      title: "OpenGym is already running",
      message: "OpenGym is already open",
      detail:
        "The existing window has been brought to the front. OpenGym allows one running instance so your local database stays safe.",
      buttons: ["Return to OpenGym"],
      defaultId: 0,
      noLink: true,
    })
    .finally(() => {
      duplicatePromptOpen = false;
    });
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

  const handlerContext = {
    register, store, auth, owner, authorizeCurrent, publicBranding,
    applyWindowLogo, faces, win, setSession: (next: any) => { session = next; },
  };
  registerMemberHandlers(handlerContext);
  registerOperationsHandlers(handlerContext);
  registerAdministrationHandlers(handlerContext);
  registerReceiptHandlers(handlerContext);
}
async function create() {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  store = new GymDatabase(join(dir, "opengym.db"));
  const modelDirectory = app.isPackaged
    ? join(process.resourcesPath, "app.asar.unpacked", "models", "buffalo_sc")
    : join(app.getAppPath(), "models", "buffalo_sc");
  faces = new FaceRecognitionService(modelDirectory);
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
  handlers();
  win.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const page = webContents.getURL();
      const trustedPage =
        page.startsWith("file://") || page.startsWith("http://localhost:5173");
      callback(permission === "media" && trustedPage);
    },
  );
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
else
  app.on("second-instance", () => {
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
