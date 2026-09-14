// @ts-nocheck -- renderer records are validated at the IPC boundary.
// Renderer data is validated by shared IPC contracts before it reaches these views.
import React, { useEffect, useState } from "react";
import { Search, ScrollText } from "lucide-react";
import { Badge, Field, Page, Table } from "../components/ui";
import { api } from "../app/runtime";
export function AuditLog() {
  const [data, setData] = useState<any>({
    rows: [],
    staff: [],
    entityTypes: [],
    actions: [],
  });
  const [filters, setFilters] = useState<any>({
    staffId: "",
    entityType: "",
    action: "",
    from: "",
    to: "",
    search: "",
  });
  const [loading, setLoading] = useState(true);
  const load = async (next = filters) => {
    setLoading(true);
    try {
      setData(
        await api("audit:list", {
          ...(next.staffId ? { staffId: +next.staffId } : {}),
          ...(next.entityType ? { entityType: next.entityType } : {}),
          ...(next.action ? { action: next.action } : {}),
          ...(next.from ? { from: next.from } : {}),
          ...(next.to ? { to: next.to } : {}),
          search: next.search,
        }),
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const detailText = (value: string) => {
    try {
      const parsed = JSON.parse(value || "{}");
      return Object.keys(parsed).length
        ? Object.entries(parsed)
            .map(([key, item]) => `${key}: ${String(item)}`)
            .join(" · ")
        : "No additional details";
    } catch {
      return value || "No additional details";
    }
  };
  return (
    <Page
      title="Audit log"
      action={
        <span className="auditCount">
          {data.rows.length} event{data.rows.length === 1 ? "" : "s"}
        </span>
      }
    >
      <section className="auditIntro">
        <ScrollText />
        <div>
          <h2>Accountability across the front desk</h2>
          <p>
            Every recorded change shows who performed it and when. Audit entries
            are read-only.
          </p>
        </div>
      </section>
      <form
        className="auditFilters"
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
      >
        <label>
          <span>Staff member</span>
          <select
            value={filters.staffId}
            onChange={(e) =>
              setFilters({ ...filters, staffId: e.target.value })
            }
          >
            <option value="">All staff</option>
            {data.staff.map((x: any) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Record type</span>
          <select
            value={filters.entityType}
            onChange={(e) =>
              setFilters({ ...filters, entityType: e.target.value })
            }
          >
            <option value="">All records</option>
            {data.entityTypes.map((x: string) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Action</span>
          <select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          >
            <option value="">All actions</option>
            {data.actions.map((x: string) => (
              <option key={x}>{x.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
        <Field
          label="From"
          type="date"
          value={filters.from}
          onChange={(e: any) =>
            setFilters({ ...filters, from: e.target.value })
          }
        />
        <Field
          label="To"
          type="date"
          value={filters.to}
          onChange={(e: any) => setFilters({ ...filters, to: e.target.value })}
        />
        <Field
          label="Search details"
          value={filters.search}
          onChange={(e: any) =>
            setFilters({ ...filters, search: e.target.value })
          }
          placeholder="Staff, action, or details"
        />
        <div className="auditFilterActions">
          <button className="primary" disabled={loading}>
            {loading ? "Loading…" : "Apply filters"}
          </button>
          <button
            type="button"
            onClick={() => {
              const empty = {
                staffId: "",
                entityType: "",
                action: "",
                from: "",
                to: "",
                search: "",
              };
              setFilters(empty);
              load(empty);
            }}
          >
            Reset
          </button>
        </div>
      </form>
      {loading ? (
        <div className="empty">Loading audit history…</div>
      ) : data.rows.length ? (
        <div className="auditTable">
          <Table
            heads={["When", "Staff", "Action", "Record", "Details"]}
            rows={data.rows.map((row: any) => [
              <time>{new Date(row.createdAt).toLocaleString()}</time>,
              <div className="auditStaff">
                <b>{row.staffName || "System"}</b>
                <small>{row.staffRole || "Automated"}</small>
              </div>,
              <Badge text={row.action.replaceAll("_", " ")} />,
              <span className="auditEntity">
                {row.entityType}
                {row.entityId ? ` #${row.entityId}` : ""}
              </span>,
              <span className="auditDetails" title={detailText(row.details)}>
                {detailText(row.details)}
              </span>,
            ])}
          />
        </div>
      ) : (
        <div className="empty">No audit events match these filters.</div>
      )}
    </Page>
  );
}