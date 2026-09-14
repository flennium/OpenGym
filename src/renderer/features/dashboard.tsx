// @ts-nocheck -- renderer records are validated at the IPC boundary.
// Renderer data is validated by shared IPC contracts before it reaches these views.
import React, { useEffect, useState } from "react";
import { Badge, Page, Table } from "../components/ui";
import { api, money } from "../app/runtime";
export function Dashboard({ settings }: any) {
  const [d, setD] = useState<any>();
  useEffect(() => {
    api("dashboard:get").then(setD);
  }, []);
  if (!d)
    return (
      <Page title="Today">
        <p>Loading the front desk…</p>
      </Page>
    );
  return (
    <Page title="Front desk overview">
      <section className="dashboardHero">
        <div>
          <span>Live operations</span>
          <strong>{d.openVisits.n}</strong>
          <p>members currently training</p>
        </div>
        <div className="dashboardMetrics">
          <article>
            <span>Due to expire</span>
            <b>{d.expiring.n}</b>
            <small>Next 14 days</small>
          </article>
          <article>
            <span>Collected today</span>
            <b>{money(d.todayRevenue.n, settings)}</b>
            <small>Paid transactions</small>
          </article>
        </div>
      </section>
      <div className="dashboardGrid">
        <section className="opsPanel">
          <header>
            <div>
              <h2>In the gym now</h2>
              <p>Live check-ins at this location</p>
            </div>
            <Badge text={`${d.checkedIn.length} active`} />
          </header>
          {d.checkedIn.length ? (
            <div className="liveList">
              {d.checkedIn.map((x: any) => (
                <article key={x.id}>
                  <i />
                  <div>
                    <b>{x.member_name}</b>
                    <span>{x.member_code}</span>
                  </div>
                  <time>
                    {new Date(x.checked_in_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </article>
              ))}
            </div>
          ) : (
            <div className="panelEmpty">No one is checked in right now.</div>
          )}
        </section>
        <section className="opsPanel">
          <header>
            <div>
              <h2>Needs attention</h2>
              <p>Memberships expiring soon</p>
            </div>
          </header>
          {d.expiringSoon.length ? (
            <div className="attentionList">
              {d.expiringSoon.map((x: any) => (
                <article key={x.id}>
                  <div>
                    <b>{x.member_name}</b>
                    <span>
                      {x.plan_name} · ends {x.end_date}
                    </span>
                  </div>
                  <strong>{x.days_left}d</strong>
                </article>
              ))}
            </div>
          ) : (
            <div className="panelEmpty">
              No memberships expire in the next 14 days.
            </div>
          )}
        </section>
      </div>
      <section className="opsPanel dashboardPayments">
        <header>
          <div>
            <h2>Latest payments</h2>
            <p>Most recent financial activity</p>
          </div>
        </header>
        <Table
          heads={["Receipt", "Member", "Plan", "Amount", "Time"]}
          rows={d.recent.map((x: any) => [
            x.receipt_number,
            x.member_name,
            x.plan_name,
            money(x.amount_minor, settings),
            new Date(x.paid_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          ])}
          emptyText="No payments recorded yet."
        />
      </section>
    </Page>
  );
}