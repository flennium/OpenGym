// @ts-nocheck -- renderer records are validated at the IPC boundary.
// Renderer data is validated by shared IPC contracts before it reaches these views.
import React, { useEffect, useState } from "react";
import { Activity, Download } from "lucide-react";
import { Modal, Page, SelectField } from "../components/ui";
import { api, notifySuccess, money } from "../app/runtime";
export function Reports({ settings }: any) {
  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days + 1);
    return date.toISOString().slice(0, 10);
  };
  const [range, setRange] = useState({
    from: daysAgo(30),
    to: today,
    preset: "30",
  });
  const [data, setData] = useState<any>();
  const [exporting, setExporting] = useState(false);
  const load = (next = range) =>
    api("reports:get", { from: next.from, to: next.to }).then(setData);
  useEffect(() => {
    load();
  }, []);
  const choosePreset = (preset: string) => {
    const from =
      preset === "7"
        ? daysAgo(7)
        : preset === "90"
          ? daysAgo(90)
          : preset === "year"
            ? `${new Date().getFullYear()}-01-01`
            : daysAgo(30);
    const next = { from, to: today, preset };
    setRange(next);
    load(next);
  };
  if (!data) return <Page title="Reports">Loading report…</Page>;
  const busiest = data.attendance.peakHours[0]?.hour;
  const trend = Array.from(
    new Set([
      ...data.attendance.trend.map((x: any) => x.day),
      ...data.revenue.monthly.map((x: any) => x.day),
    ]),
  )
    .sort()
    .map((day: any) => ({
      day,
      visits: Number(
        data.attendance.trend.find((x: any) => x.day === day)?.value || 0,
      ),
      revenue: Number(
        data.revenue.monthly.find((x: any) => x.day === day)?.value || 0,
      ),
    }));
  const maxVisits = Math.max(1, ...trend.map((x: any) => x.visits));
  const maxRevenue = Math.max(1, ...trend.map((x: any) => x.revenue));
  const Horizontal = ({
    title,
    rows,
    format = (value: number) => String(value),
  }: any) => {
    const max = Math.max(1, ...rows.map((x: any) => Number(x.value)));
    return (
      <section className="reportPanel">
        <header>
          <h2>{title}</h2>
        </header>
        {rows.length ? (
          <div className="horizontalBars">
            {rows.slice(0, 8).map((row: any) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <i>
                  <b
                    style={{
                      width: `${Math.max(3, (Number(row.value) / max) * 100)}%`,
                    }}
                  />
                </i>
                <strong>{format(Number(row.value))}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="reportEmpty">No data in this period.</div>
        )}
      </section>
    );
  };
  return (
    <Page
      title="Reports"
      action={
        <button className="primary" onClick={() => setExporting(true)}>
          <Download /> Export report
        </button>
      }
    >
      <div className="reportToolbar">
        <div className="rangePresets">
          {[
            ["7", "7 days"],
            ["30", "30 days"],
            ["90", "90 days"],
            ["year", "This year"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={range.preset === value ? "selected" : ""}
              onClick={() => choosePreset(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="customRange">
          <input
            aria-label="Report start date"
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) =>
              setRange({ ...range, from: e.target.value, preset: "custom" })
            }
          />
          <span>to</span>
          <input
            aria-label="Report end date"
            type="date"
            value={range.to}
            min={range.from}
            max={today}
            onChange={(e) =>
              setRange({ ...range, to: e.target.value, preset: "custom" })
            }
          />
          <button onClick={() => load()}>Apply</button>
        </div>
      </div>
      <div className="reportKpis">
        <article>
          <span>Revenue</span>
          <strong>{money(data.revenue.total, settings)}</strong>
          <small>{data.revenue.transactions} paid transactions</small>
        </article>
        <article>
          <span>Visits</span>
          <strong>{data.attendance.total}</strong>
          <small>{data.attendance.uniqueMembers} unique members</small>
        </article>
        <article>
          <span>Members joined</span>
          <strong>{data.members.joined}</strong>
          <small>{data.members.total} members now</small>
        </article>
        <article>
          <span>Busiest hour</span>
          <strong>{busiest ? `${busiest}:00` : "—"}</strong>
          <small>{data.revenue.refunds} refunds in period</small>
        </article>
      </div>
      <section className="reportPanel reportTrend">
        <header>
          <div>
            <h2>Daily activity</h2>
            <p>
              Visits and revenue share the timeline with independent scales.
            </p>
          </div>
          <div className="chartLegend">
            <span>
              <i className="visitKey" />
              Visits
            </span>
            <span>
              <i className="revenueKey" />
              Revenue
            </span>
          </div>
        </header>
        {trend.length ? (
          <div className="dualBars" aria-label="Daily visits and revenue chart">
            {trend.map((point: any, index: number) => (
              <div
                key={point.day}
                title={`${point.day}: ${point.visits} visits, ${money(point.revenue, settings)}`}
              >
                <div>
                  <i
                    className="visitBar"
                    style={{ height: `${(point.visits / maxVisits) * 100}%` }}
                  />
                  <i
                    className="revenueBar"
                    style={{ height: `${(point.revenue / maxRevenue) * 100}%` }}
                  />
                </div>
                <small>
                  {index % Math.max(1, Math.ceil(trend.length / 8)) === 0
                    ? point.day.slice(5)
                    : ""}
                </small>
              </div>
            ))}
          </div>
        ) : (
          <div className="reportEmpty">
            Activity will appear after visits and payments are recorded.
          </div>
        )}
      </section>
      <div className="reportGrid">
        <Horizontal
          title="Revenue by plan"
          rows={data.revenue.byPlan}
          format={(value: number) => money(value, settings)}
        />
        <Horizontal
          title="Peak attendance hours"
          rows={data.attendance.peakHours.map((x: any) => ({
            label: `${x.hour}:00`,
            value: x.value,
          }))}
        />
        <Horizontal title="Payment methods" rows={data.revenue.methods} />
        <Horizontal title="Staff activity" rows={data.staffActivity} />
        <Horizontal title="Member status" rows={data.members.status} />
        <Horizontal title="Membership status" rows={data.memberships.status} />
      </div>
      {exporting && (
        <ReportExport range={range} close={() => setExporting(false)} />
      )}
    </Page>
  );
}
export function ReportExport({ range, close }: any) {
  const [format, setFormat] = useState("pdf"),
    [scope, setScope] = useState("summary"),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Export report" onClose={close}>
      <p className="modalCopy">
        Export {range.from} through {range.to}. CSV preserves detailed rows; PDF
        creates a presentation-ready summary.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            const path = await api("reports:export", {
              from: range.from,
              to: range.to,
              format,
              scope,
            });
            if (path) {
              notifySuccess("Report exported.");
              close();
            }
          } catch {
            /* Global error remains visible. */
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="exportChoices">
          <label>
            <input
              type="radio"
              name="format"
              checked={format === "pdf"}
              onChange={() => {
                setFormat("pdf");
                setScope("summary");
              }}
            />
            <span>
              <b>PDF summary</b>
              <small>KPIs and ranked visual summaries</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="format"
              checked={format === "csv"}
              onChange={() => setFormat("csv")}
            />
            <span>
              <b>CSV data</b>
              <small>Detailed rows for spreadsheets</small>
            </span>
          </label>
        </div>
        {format === "csv" && (
          <SelectField
            label="Data to export"
            value={scope}
            onChange={(e: any) => setScope(e.target.value)}
          >
            <option value="summary">Summary metrics</option>
            <option value="attendance">Attendance records</option>
            <option value="payments">Payment records</option>
            <option value="memberships">Membership records</option>
          </SelectField>
        )}
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Exporting…" : `Export ${format.toUpperCase()}`}
          </button>
        </footer>
      </form>
    </Modal>
  );
}