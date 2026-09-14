// @ts-nocheck -- renderer records are validated at the IPC boundary.
// Renderer data is validated by shared IPC contracts before it reaches these views.
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Archive, CalendarClock, History, Play, Plus, Search, Snowflake } from "lucide-react";
import { Badge, DataToolbar, Field, Modal, Page, Table } from "../components/ui";
import { api, notifySuccess, confirmAction, confirmWithPin, money } from "../app/runtime";
export function PlanForm({ close, refresh, plan }: any) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: plan?.name || "",
      description: plan?.description || "",
      durationMonths: plan?.duration_months || "",
      trainingHours:
        plan?.training_minutes_limit == null
          ? ""
          : plan.training_minutes_limit / 60,
      price: plan ? plan.price_minor / 100 : 0,
    },
  });
  return (
    <Modal
      title={plan ? "Edit membership plan" : "New membership plan"}
      onClose={close}
    >
      <form
        onSubmit={handleSubmit(async (x: any) => {
          const durationMonths =
            x.durationMonths === "" ? 0 : +x.durationMonths;
          const trainingHours =
            x.trainingHours === "" ? null : +x.trainingHours;
          await api("plans:save", {
            id: plan?.id,
            data: {
              name: x.name,
              description: x.description,
              durationMonths,
              trainingHours,
              priceMinor: Math.round(+x.price * 100),
            },
          });
          refresh();
          close();
          notifySuccess("Membership plan saved.");
        })}
      >
        <p className="formHint">
          Set months, training hours, or both. When both are set, the membership
          ends as soon as either limit is reached.
        </p>
        <Field label="Plan name" required {...register("name")} />
        <Field label="Description" {...register("description")} />
        <div className="grid2">
          <Field
            label="Duration in months (optional)"
            type="number"
            min="1"
            placeholder="No calendar limit"
            {...register("durationMonths")}
          />
          <Field
            label="Price"
            type="number"
            step=".01"
            min="0"
            {...register("price")}
          />
          <Field
            label="Training hours (optional)"
            type="number"
            step=".25"
            min=".25"
            placeholder="Unlimited"
            {...register("trainingHours")}
          />
        </div>
        <footer>
          <button className="primary">Save plan</button>
        </footer>
      </form>
    </Modal>
  );
}
export function Memberships({ settings, can }: any) {
  const [rows, setRows] = useState<any[]>([]),
    [plans, setPlans] = useState<any[]>([]),
    [members, setMembers] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [planFilter, setPlanFilter] = useState(""),
    [modal, setModal] = useState(false),
    [freezeHistory, setFreezeHistory] = useState<{
      periods: any[];
      membership: any;
    } | null>(null);
  const load = () =>
    Promise.all([
      api("memberships:list").then(setRows),
      api("plans:list").then(setPlans),
      api("members:list").then(setMembers),
    ]);
  useEffect(() => {
    load();
  }, []);
  const visibleRows = rows.filter(
    (row) =>
      (!statusFilter ||
        (row.effective_status || row.status) === statusFilter) &&
      (!planFilter || String(row.plan_id) === planFilter) &&
      [
        row.member_name,
        row.plan_name,
        row.start_date,
        row.end_date,
        row.effective_status || row.status,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
  );
  return (
    <Page
      title="Memberships"
      action={
        can("Memberships", "create") && (
          <button className="primary" onClick={() => setModal(true)}>
            <Plus />
            Assign plan
          </button>
        )
      }
    >
      <DataToolbar
        label="Search memberships"
        value={query}
        onChange={setQuery}
        placeholder="Member, plan, status, or date"
        shown={visibleRows.length}
        total={rows.length}
        filters={[
          {
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              "active",
              "frozen",
              "expired",
              "exhausted",
              "cancelled",
            ].map((value) => ({
              value,
              label: value[0].toUpperCase() + value.slice(1),
            })),
          },
          {
            label: "Plan",
            value: planFilter,
            onChange: setPlanFilter,
            options: plans.map((plan) => ({
              value: String(plan.id),
              label: plan.name,
            })),
          },
        ]}
      />
      <Table
        heads={[
          "Member",
          "Plan",
          "Period",
          "Training time",
          "Status",
          "Amount",
          "Actions",
        ]}
        rows={visibleRows.map((x) => [
          <b>{x.member_name}</b>,
          x.plan_name,
          `${x.start_date} → ${x.end_date === "9999-12-31" ? "No expiry" : x.end_date}`,
          x.training_minutes_limit == null
            ? "Unlimited"
            : `${(x.used_minutes / 60).toFixed(1)} / ${(x.training_minutes_limit / 60).toFixed(1)} hr`,
          <div className="membershipStatus">
            <Badge text={x.effective_status || x.status} />
            {x.status === "frozen" && (
              <small>
                <Snowflake /> Paused for {formatDuration(x.frozen_duration_ms)}
              </small>
            )}
          </div>,
          money(x.price_minor, settings),
          <div className="actions membershipActions">
            {x.freeze_count > 0 && (
              <button
                className="historyAction"
                onClick={async () =>
                  setFreezeHistory({
                    periods: await api("memberships:freezeHistory", {
                      id: x.id,
                    }),
                    membership: x,
                  })
                }
              >
                <History /> History <span>{x.freeze_count}</span>
              </button>
            )}
            {can("Memberships", "edit") &&
              (x.effective_status || x.status) === "active" && (
                <>
                  <button onClick={() => act(x.id, "renew", load)}>
                    Renew
                  </button>
                  <button
                    className="freezeAction"
                    onClick={() => act(x.id, "freeze", load)}
                  >
                    <Snowflake /> Freeze
                  </button>
                  <button onClick={() => act(x.id, "cancel", load)}>
                    Cancel
                  </button>
                </>
              )}
            {can("Memberships", "edit") && x.status === "frozen" && (
              <button
                className="resumeAction"
                onClick={() => act(x.id, "resume", load)}
              >
                <Play /> Resume
              </button>
            )}
            {can("Memberships", "edit") &&
              ["expired", "exhausted", "cancelled"].includes(
                x.effective_status || x.status,
              ) && (
                <button onClick={() => act(x.id, "renew", load)}>Renew</button>
              )}
          </div>,
        ])}
        emptyText={
          query ? "No memberships match this search." : "No memberships yet."
        }
      />
      {modal && (
        <Assign
          members={members}
          plans={plans}
          close={() => setModal(false)}
          refresh={load}
        />
      )}
      {freezeHistory && (
        <Modal
          title="Membership freeze history"
          className="freezeHistoryModal"
          onClose={() => setFreezeHistory(null)}
        >
          <section className="freezeSummary">
            <div className="freezeSummaryIcon">
              <Snowflake />
            </div>
            <div>
              <span>{freezeHistory.membership.member_name}</span>
              <strong>{freezeHistory.membership.plan_name}</strong>
              <small>
                {freezeHistory.membership.start_date} →{" "}
                {freezeHistory.membership.end_date}
              </small>
            </div>
            <dl>
              <div>
                <dt>Freeze periods</dt>
                <dd>{freezeHistory.periods.length}</dd>
              </div>
              <div>
                <dt>Total paused</dt>
                <dd>
                  {formatDuration(freezeHistory.membership.frozen_duration_ms)}
                </dd>
              </div>
            </dl>
          </section>
          <div className="freezeLedger">
            {freezeHistory.periods.map((period, index) => {
              const running = !period.resumed_at;
              const duration =
                period.duration_ms ??
                Date.now() - new Date(period.frozen_at).getTime();
              return (
                <article key={period.id} className={running ? "current" : ""}>
                  <header>
                    <span className="freezeIndex">
                      {String(freezeHistory.periods.length - index).padStart(
                        2,
                        "0",
                      )}
                    </span>
                    <div>
                      <b>
                        {running
                          ? "Membership currently frozen"
                          : "Completed freeze period"}
                      </b>
                      <small>
                        {running
                          ? "Access and expiry are paused"
                          : "Expiry was extended by this duration"}
                      </small>
                    </div>
                    <strong className="freezeDuration">
                      {formatDuration(duration)}
                    </strong>
                  </header>
                  <dl className="freezeDetails">
                    <div>
                      <dt>Frozen</dt>
                      <dd>{formatDateTime(period.frozen_at)}</dd>
                    </div>
                    <div>
                      <dt>Resumed</dt>
                      <dd>
                        {period.resumed_at
                          ? formatDateTime(period.resumed_at)
                          : "Not resumed"}
                      </dd>
                    </div>
                    <div>
                      <dt>Frozen by</dt>
                      <dd>{period.frozen_by_name}</dd>
                    </div>
                    <div>
                      <dt>Resumed by</dt>
                      <dd>{period.resumed_by_name || "—"}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </Modal>
      )}
    </Page>
  );
}
const formatDuration = (milliseconds: number) => {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  const days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60),
    mins = minutes % 60;
  return [days && `${days}d`, hours && `${hours}h`, `${mins}m`]
    .filter(Boolean)
    .join(" ");
};
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export function Plans({ settings, can }: any) {
  const [plans, setPlans] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [typeFilter, setTypeFilter] = useState(""),
    [editing, setEditing] = useState<any>(null);
  const refresh = () => api("plans:list").then(setPlans);
  useEffect(() => {
    void refresh();
  }, []);
  const reload = async () => {
    await refresh();
    setEditing(null);
  };
  const visiblePlans = plans.filter((plan) => {
    const type =
      plan.duration_months > 0 && plan.training_minutes_limit != null
        ? "hybrid"
        : plan.duration_months > 0
          ? "calendar"
          : "hours";
    return (
      (!typeFilter || type === typeFilter) &&
      [plan.name, plan.description].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    );
  });
  return (
    <Page
      title="Plans"
      action={
        can("Memberships", "create") && (
          <button className="primary" onClick={() => setEditing({ new: true })}>
            <Plus />
            Create plan
          </button>
        )
      }
    >
      <section className="plansPage">
        <div className="planManagerIntro">
          <div>
            <strong>
              {plans.length} active plan{plans.length === 1 ? "" : "s"}
            </strong>
            <p>
              Create and maintain the access packages staff can assign to
              members.
            </p>
          </div>
        </div>
        <div className="planSearch">
          <DataToolbar
            label="Search plans"
            value={query}
            onChange={setQuery}
            placeholder="Plan name or description"
            shown={visiblePlans.length}
            total={plans.length}
            filters={[
              {
                label: "Plan type",
                value: typeFilter,
                onChange: setTypeFilter,
                options: [
                  { value: "calendar", label: "Calendar only" },
                  { value: "hours", label: "Hours only" },
                  { value: "hybrid", label: "Calendar + hours" },
                ],
              },
            ]}
          />
        </div>
        <div className="planCatalog">
          {visiblePlans.map((plan: any) => {
            const hasMonths = plan.duration_months > 0;
            const hasHours = plan.training_minutes_limit != null;
            const type =
              hasMonths && hasHours
                ? "Calendar + hours"
                : hasMonths
                  ? "Calendar access"
                  : "Training hours";
            return (
              <article className="planCard" key={plan.id}>
                <header>
                  <div>
                    <span className="planType">{type}</span>
                    <h3>{plan.name}</h3>
                  </div>
                  <strong className="planPrice">
                    {money(plan.price_minor, settings)}
                  </strong>
                </header>
                <p className="planDescription">
                  {plan.description || "No description added."}
                </p>
                <dl className="planLimits">
                  <div>
                    <dt>Calendar</dt>
                    <dd>
                      {hasMonths
                        ? `${plan.duration_months} month${plan.duration_months === 1 ? "" : "s"}`
                        : "No expiry"}
                    </dd>
                  </div>
                  <div>
                    <dt>Training</dt>
                    <dd>
                      {hasHours
                        ? `${plan.training_minutes_limit / 60} hours`
                        : "Unlimited"}
                    </dd>
                  </div>
                </dl>
                <footer>
                  {can("Memberships", "edit") && (
                    <button
                      className="planEdit"
                      onClick={() => setEditing(plan)}
                    >
                      Edit plan
                    </button>
                  )}
                  {can("Memberships", "delete") && (
                    <button
                      className="planArchive"
                      onClick={async () => {
                        const authorizationPin = await confirmWithPin({
                          title: "Archive this plan?",
                          message: `${plan.name} will no longer be available for new memberships. Existing membership records are preserved. Enter your current PIN to continue.`,
                          confirmLabel: "Archive plan",
                          tone: "danger",
                        });
                        if (!authorizationPin) return;
                        try {
                          await api("plans:archive", {
                            id: plan.id,
                            authorizationPin,
                          });
                        } catch {
                          return;
                        }
                        await refresh();
                        notifySuccess("Membership plan archived.");
                      }}
                    >
                      Archive
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
          {!visiblePlans.length && (
            <div className="planEmpty">
              <CalendarClock />
              <h3>{plans.length ? "No plans match" : "No plans yet"}</h3>
              <p>
                {plans.length
                  ? "Change the search or reset the active filter."
                  : "Create the first plan to start assigning memberships."}
              </p>
              {!plans.length && can("Memberships", "create") && (
                <button
                  className="primary"
                  onClick={() => setEditing({ new: true })}
                >
                  Create plan
                </button>
              )}
            </div>
          )}
        </div>
      </section>
      {editing && (
        <PlanForm
          plan={editing.new ? null : editing}
          close={() => setEditing(null)}
          refresh={reload}
        />
      )}
    </Page>
  );
}
const act = async (id: number, action: string, load: any) => {
  const copy: Record<
    string,
    { title: string; message: string; label: string }
  > = {
    renew: {
      title: "Renew this membership?",
      message:
        "The membership dates will be recalculated and the membership will become active.",
      label: "Renew membership",
    },
    freeze: {
      title: "Freeze this membership?",
      message:
        "Check-in access stops immediately. The calendar expiry and remaining training hours stay paused until this membership is resumed. This freeze will be recorded in history.",
      label: "Freeze membership",
    },
    resume: {
      title: "Resume this membership?",
      message:
        "Check-in access returns immediately. The membership expiry will be extended by the exact time it was frozen, and this period will remain in history.",
      label: "Resume membership",
    },
    cancel: {
      title: "Cancel this membership?",
      message:
        "This changes the membership to cancelled. Payment and attendance history will remain preserved.",
      label: "Cancel membership",
    },
  };
  const detail = copy[action];
  const authorizationPin =
    action === "cancel" && detail
      ? await confirmWithPin({
          title: detail.title,
          message: `${detail.message} Enter your current PIN to authorize cancellation.`,
          confirmLabel: detail.label,
          tone: "danger",
        })
      : null;
  if (action === "cancel" && !authorizationPin) return;
  if (
    action !== "cancel" &&
    detail &&
    !(await confirmAction({
      title: detail.title,
      message: detail.message,
      confirmLabel: detail.label,
      tone: action === "cancel" ? "danger" : "default",
    }))
  )
    return;
  try {
    await api("memberships:action", { id, action, authorizationPin });
  } catch {
    return;
  }
  await load();
  notifySuccess(
    `Membership ${{ renew: "renewed", freeze: "frozen", resume: "resumed", cancel: "cancelled" }[action]}.`,
  );
};
export function Assign({ members, plans, close, refresh }: any) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      memberId: members[0]?.id,
      planId: plans[0]?.id,
      startDate: new Date().toISOString().slice(0, 10),
      autoRenew: false,
    },
  });
  return (
    <Modal title="Assign membership" onClose={close}>
      <form
        onSubmit={handleSubmit(async (x: any) => {
          await api("memberships:assign", {
            ...x,
            memberId: +x.memberId,
            planId: +x.planId,
          });
          refresh();
          close();
          notifySuccess("Membership assigned.");
        })}
      >
        <label>
          <span>Member</span>
          <select {...register("memberId")}>
            {members.map((x: any) => (
              <option value={x.id}>
                {x.first_name} {x.last_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Plan</span>
          <select {...register("planId")}>
            {plans.map((x: any) => (
              <option value={x.id}>{x.name}</option>
            ))}
          </select>
        </label>
        <Field label="Start date" type="date" {...register("startDate")} />
        <label className="check">
          <input type="checkbox" {...register("autoRenew")} />
          Auto-renew
        </label>
        <footer>
          <button className="primary">Assign plan</button>
        </footer>
      </form>
    </Modal>
  );
}