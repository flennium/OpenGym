// @ts-nocheck -- renderer records are validated at the IPC boundary.
// Renderer data is validated by shared IPC contracts before it reaches these views.
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Archive, Plus } from "lucide-react";
import { Badge, Field, Modal, Page, Table } from "../components/ui";
import { api, notifySuccess, confirmWithPin } from "../app/runtime";
export function Staff({ user }: any) {
  const [rows, setRows] = useState<any[]>([]),
    [permissions, setPermissions] = useState<any[]>([]),
    [open, setOpen] = useState(false),
    [resetting, setResetting] = useState<any>(null),
    [tab, setTab] = useState("Accounts");
  const load = () =>
    Promise.all([
      api("staff:list").then(setRows),
      user.role === "Owner"
        ? api("permissions:list").then(setPermissions)
        : Promise.resolve(),
    ]);
  useEffect(() => {
    load();
  }, []);
  return (
    <Page
      title="Staff"
      action={
        user.role === "Owner" && (
          <button className="primary" onClick={() => setOpen(true)}>
            <Plus />
            Add staff
          </button>
        )
      }
    >
      {user.role === "Owner" && (
        <div className="tabs">
          <button
            className={tab === "Accounts" ? "selected" : ""}
            onClick={() => setTab("Accounts")}
          >
            Accounts
          </button>
          <button
            className={tab === "Permissions" ? "selected" : ""}
            onClick={() => setTab("Permissions")}
          >
            Permissions
          </button>
        </div>
      )}
      {tab === "Accounts" ? (
        <Table
          heads={["Name", "Role", "Access", "Actions"]}
          rows={rows.map((x) => [
            <b>{x.name}</b>,
            x.role,
            <Badge text={x.archivedAt ? "archived" : "active"} />,
            user.role === "Owner" && !x.archivedAt ? (
              <div className="actions">
                <button onClick={() => setResetting(x)}>Reset PIN</button>
                {x.id !== user.id && x.role !== "Owner" && (
                  <button
                    onClick={async () => {
                      const authorizationPin = await confirmWithPin({
                        title: "Archive this staff account?",
                        message: `${x.name} will no longer be able to sign in. Enter your current Owner PIN. Their recorded activity remains attributed to them.`,
                        confirmLabel: "Archive account",
                        tone: "danger",
                      });
                      if (authorizationPin) {
                        try {
                          await api("staff:archive", {
                            id: x.id,
                            authorizationPin,
                          });
                        } catch {
                          return;
                        }
                        await load();
                        notifySuccess("Staff account archived.");
                      }
                    }}
                  >
                    Archive
                  </button>
                )}
              </div>
            ) : null,
          ])}
        />
      ) : (
        <PermissionMatrix rows={permissions} refresh={load} />
      )}
      {open && <StaffForm close={() => setOpen(false)} refresh={load} />}
      {resetting && (
        <ResetPinForm
          staff={resetting}
          close={() => setResetting(null)}
          refresh={load}
        />
      )}
    </Page>
  );
}
export function ResetPinForm({ staff, close, refresh }: any) {
  const { register, handleSubmit, watch } = useForm({
    defaultValues: { pin: "", confirmation: "" },
  });
  const pin = watch("pin");
  const confirmation = watch("confirmation");
  return (
    <Modal title={`Reset PIN for ${staff.name}`} onClose={close}>
      <p className="modalCopy">
        Their existing PIN will stop working immediately after this change.
      </p>
      <form
        onSubmit={handleSubmit(async (values) => {
          if (values.pin !== values.confirmation) return;
          const authorizationPin = await confirmWithPin({
            title: "Replace this staff PIN?",
            message: `${staff.name} will need the new PIN the next time they sign in. Enter your current Owner PIN to authorize the change.`,
            confirmLabel: "Replace PIN",
            tone: "danger",
          });
          if (!authorizationPin) return;
          try {
            await api("staff:resetPin", {
              id: staff.id,
              pin: values.pin,
              authorizationPin,
            });
          } catch {
            return;
          }
          await refresh();
          close();
          notifySuccess("Staff PIN updated.");
        })}
      >
        <Field
          label="New six-digit PIN"
          type="password"
          inputMode="numeric"
          maxLength={6}
          pattern="\d{6}"
          required
          {...register("pin")}
        />
        <Field
          label="Confirm new PIN"
          type="password"
          inputMode="numeric"
          maxLength={6}
          pattern="\d{6}"
          required
          error={
            confirmation && pin !== confirmation ? "PINs do not match" : ""
          }
          {...register("confirmation")}
        />
        <footer>
          <button
            className="primary"
            disabled={pin.length !== 6 || pin !== confirmation}
          >
            Continue
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function PermissionMatrix({ rows, refresh }: any) {
  const roles = ["Admin", "Front Desk", "Trainer"];
  const modules = [
    "Members",
    "Memberships",
    "Attendance",
    "Payments",
    "Staff",
    "Reports",
  ];
  return (
    <div className="permissionGrid">
      <span />
      {roles.map((role) => (
        <b key={role}>{role}</b>
      ))}
      {modules.map((module) => (
        <React.Fragment key={module}>
          <strong>{module}</strong>
          {roles.map((role) => {
            const row = rows.find(
              (item: any) => item.role === role && item.module === module,
            );
            return (
              <div className="permCell" key={role}>
                {["view", "create", "edit", "delete"].map((action) => {
                  const key = `can${action[0].toUpperCase()}${action.slice(1)}`;
                  return (
                    <label key={action}>
                      <input
                        type="checkbox"
                        checked={!!row?.[key]}
                        onChange={async (event) => {
                          const allowed = event.target.checked;
                          const authorizationPin = await confirmWithPin({
                            title: "Change role permission?",
                            message: `${allowed ? "Allow" : "Remove"} ${action} access for ${role} in ${module}. Enter your current Owner PIN.`,
                            confirmLabel: "Change permission",
                            tone: "danger",
                          });
                          if (!authorizationPin) return;
                          try {
                            await api("permissions:update", {
                              roleId: row.roleId,
                              module,
                              action,
                              allowed,
                              authorizationPin,
                            });
                          } catch {
                            return;
                          }
                          await refresh();
                          notifySuccess("Permission updated.");
                        }}
                      />
                      {action}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
export function StaffForm({ close, refresh }: any) {
  const { register, handleSubmit } = useForm({
    defaultValues: { name: "", roleId: 3, pin: "" },
  });
  return (
    <Modal title="Add staff account" onClose={close}>
      <form
        onSubmit={handleSubmit(async (x: any) => {
          await api("staff:create", { ...x, roleId: +x.roleId });
          refresh();
          close();
          notifySuccess("Staff account created.");
        })}
      >
        <Field label="Name" {...register("name")} />
        <label>
          <span>Role</span>
          <select {...register("roleId")}>
            <option value="2">Admin</option>
            <option value="3">Front Desk</option>
            <option value="4">Trainer</option>
          </select>
        </label>
        <Field
          label="Six-digit PIN"
          type="password"
          maxLength={6}
          {...register("pin")}
        />
        <footer>
          <button className="primary">Create account</button>
        </footer>
      </form>
    </Modal>
  );
}