// @ts-nocheck -- renderer records are validated at the IPC boundary.
// Renderer data is validated by shared IPC contracts before it reaches these views.
import React, { useEffect, useState } from "react";
import { Activity, Search } from "lucide-react";
import { Badge, DataToolbar, Modal, Page, SelectField, Table } from "../components/ui";
import { api, notifySuccess } from "../app/runtime";
export function Attendance({ can }: any) {
  const [rows, setRows] = useState<any[]>([]),
    [members, setMembers] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [methodFilter, setMethodFilter] = useState("");
  const load = () =>
    Promise.all([
      api("attendance:list").then(setRows),
      api("members:list").then(setMembers),
    ]);
  useEffect(() => {
    load();
  }, []);
  const visibleRows = rows.filter(
    (row) =>
      (!statusFilter ||
        (row.checked_out_at ? "complete" : "in-gym") === statusFilter) &&
      (!methodFilter || row.method === methodFilter) &&
      [
        row.member_name,
        row.method,
        row.checked_in_at,
        row.checked_out_at,
        row.checked_out_at ? "complete" : "in gym",
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
  );
  return (
    <Page
      title="Attendance"
      action={
        <div className="headActions">
          <button onClick={() => api("export:csv", { module: "attendance" })}>
            Export CSV
          </button>
          {can("Attendance", "create") && (
            <QuickCheck members={members} refresh={load} />
          )}
        </div>
      }
    >
      <DataToolbar
        label="Search attendance"
        value={query}
        onChange={setQuery}
        placeholder="Member, status, method, or date"
        shown={visibleRows.length}
        total={rows.length}
        filters={[
          {
            label: "Visit status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "in-gym", label: "In gym" },
              { value: "complete", label: "Checked out" },
            ],
          },
          {
            label: "Check-in method",
            value: methodFilter,
            onChange: setMethodFilter,
            options: [
              { value: "manual", label: "Front desk" },
              { value: "code", label: "Kiosk scanner" },
            ],
          },
        ]}
      />
      <Table
        heads={["Member", "Checked in", "Checked out", "Status"]}
        rows={visibleRows.map((x) => [
          <b>{x.member_name}</b>,
          new Date(x.checked_in_at).toLocaleString(),
          x.checked_out_at || !can("Attendance", "edit") ? (
            x.checked_out_at ? (
              new Date(x.checked_out_at).toLocaleString()
            ) : (
              "In gym"
            )
          ) : (
            <button
              onClick={async () => {
                await api("attendance:checkOut", { id: x.id });
                load();
                notifySuccess("Member checked out.");
              }}
            >
              Check out
            </button>
          ),
          <Badge text={x.checked_out_at ? "complete" : "in gym"} />,
        ])}
        emptyText={
          query
            ? "No attendance records match this search."
            : "No attendance recorded yet."
        }
      />
    </Page>
  );
}
export function QuickCheck({ members, refresh }: any) {
  const [open, setOpen] = useState(false),
    [id, setId] = useState(0);
  return (
    <>
      {
        <button className="primary" onClick={() => setOpen(true)}>
          <Activity />
          Check in
        </button>
      }
      {open && (
        <Modal title="Quick check-in" onClose={() => setOpen(false)}>
          <form
            className="compactForm"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await api("attendance:checkIn", { memberId: id });
                refresh();
                setOpen(false);
                notifySuccess("Member checked in.");
              } catch {
                // The global toast keeps the dialog open and explains the conflict.
              }
            }}
          >
            <SelectField
              label="Member"
              value={id || ""}
              onChange={(e) => setId(+e.target.value)}
            >
              <option value="">Choose member</option>
              {members.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.first_name} {m.last_name}
                </option>
              ))}
            </SelectField>
            <footer className="modalFooter">
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="primary" disabled={!id}>
                Check in now
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}