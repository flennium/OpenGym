// @ts-nocheck -- renderer records are validated at the IPC boundary.
// Renderer data is validated by shared IPC contracts before it reaches these views.
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Plus, Search } from "lucide-react";
import { Badge, DataToolbar, Field, Modal, Page, Table } from "../components/ui";
import { api, notifySuccess, confirmWithPin, money } from "../app/runtime";
export function Payments({ settings, user, can }: any) {
  const [rows, setRows] = useState<any[]>([]),
    [memberships, setMemberships] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [methodFilter, setMethodFilter] = useState(""),
    [open, setOpen] = useState(false);
  const load = () =>
    Promise.all([
      api("payments:list").then(setRows),
      api("memberships:list").then(setMemberships),
    ]);
  useEffect(() => {
    load();
  }, []);
  const visibleRows = rows.filter(
    (row) =>
      (!statusFilter || row.status === statusFilter) &&
      (!methodFilter || row.method === methodFilter) &&
      [
        row.receipt_number,
        row.member_name,
        row.plan_name,
        row.method,
        row.status,
        row.paid_at,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
  );
  return (
    <Page
      title="Payments"
      action={
        <div className="headActions">
          <button onClick={() => api("export:csv", { module: "payments" })}>
            Export CSV
          </button>
          {can("Payments", "create") && (
            <button className="primary" onClick={() => setOpen(true)}>
              <Plus />
              Record payment
            </button>
          )}
        </div>
      }
    >
      <DataToolbar
        label="Search payments"
        value={query}
        onChange={setQuery}
        placeholder="Receipt, member, plan, method, or status"
        shown={visibleRows.length}
        total={rows.length}
        filters={[
          {
            label: "Payment status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "paid", label: "Paid" },
              { value: "refunded", label: "Refunded" },
            ],
          },
          {
            label: "Method",
            value: methodFilter,
            onChange: setMethodFilter,
            options: [
              { value: "cash", label: "Cash" },
              { value: "card", label: "Card" },
              { value: "transfer", label: "Transfer" },
            ],
          },
        ]}
      />
      <Table
        heads={[
          "Receipt",
          "Member",
          "Plan",
          "Paid",
          "Method",
          "Status",
          "Actions",
        ]}
        rows={visibleRows.map((x) => [
          <b>{x.receipt_number}</b>,
          x.member_name,
          x.plan_name,
          money(x.amount_minor, settings),
          x.method,
          <Badge text={x.status} />,
          <div className="actions">
            <button onClick={() => api("payments:receipt", { id: x.id })}>
              Receipt
            </button>
            {user.role === "Owner" && x.status === "paid" && (
              <button
                onClick={async () => {
                  const authorizationPin = await confirmWithPin({
                    title: "Refund this payment?",
                    message: `Receipt ${x.receipt_number} will be marked as refunded. Enter your current Owner PIN. The financial record will remain in history.`,
                    confirmLabel: "Refund payment",
                    tone: "danger",
                  });
                  if (authorizationPin) {
                    try {
                      await api("payments:refund", {
                        id: x.id,
                        authorizationPin,
                      });
                    } catch {
                      return;
                    }
                    await load();
                    notifySuccess("Payment marked as refunded.");
                  }
                }}
              >
                Refund
              </button>
            )}
          </div>,
        ])}
        emptyText={
          query ? "No payments match this search." : "No payments recorded yet."
        }
      />
      {open && (
        <Pay
          memberships={memberships}
          close={() => setOpen(false)}
          refresh={load}
        />
      )}
    </Page>
  );
}
export function Pay({ memberships, close, refresh }: any) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      membershipId: memberships[0]?.id,
      amount: 0,
      method: "cash",
    },
  });
  return (
    <Modal title="Record payment" onClose={close}>
      <form
        onSubmit={handleSubmit(async (x: any) => {
          await api("payments:record", {
            membershipId: +x.membershipId,
            amountMinor: Math.round(+x.amount * 100),
            method: x.method,
          });
          refresh();
          close();
          notifySuccess("Payment recorded.");
        })}
      >
        <label>
          <span>Membership</span>
          <select {...register("membershipId")}>
            {memberships.map((x: any) => (
              <option value={x.id}>
                {x.member_name} · {x.plan_name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid2">
          <Field
            label="Amount"
            type="number"
            step=".01"
            {...register("amount")}
          />
          <label>
            <span>Method</span>
            <select {...register("method")}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>
        </div>
        <footer>
          <button className="primary">Record payment</button>
        </footer>
      </form>
    </Modal>
  );
}