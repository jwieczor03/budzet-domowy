import test from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../server/domain.mjs";
import { periodStatistics, comparisonPeriods } from "../src/statistics.ts";
const makeRow = (id, amount, extra = {}) => ({
  id,
  period: "2026-10",
  name: id,
  amount,
  category: "jedzenie",
  source: "personal",
  kind: "expense",
  household: false,
  note: "",
  ...extra,
});
test("statystyki nie liczą dwa razy wpłaty na wspólne konto i zakupów z niego", () => {
  const state = emptyState();
  state.expenses = [
    makeRow("own", 10000),
    makeRow("shared-in", 5000, { kind: "sharedDeposit" }),
    makeRow("shared-buy", 3000, { source: "shared" }),
  ];
  state.settlements = [
    { id: "paid", date: "2026-10-10", row: state.expenses[0] },
  ];
  const plan = periodStatistics(state, "2026-10", "plan");
  assert.equal(plan.total, 15000);
  assert.equal(plan.spendingTotal, 10000);
  const done = periodStatistics(state, "2026-10", "done");
  assert.equal(done.total, 10000);
  assert.equal(done.spendingTotal, 10000);
});
test("statystyki oddzielają oszczędności, raty i bezpośrednie podziały wpływu od zakupów", () => {
  const state = emptyState();
  state.obligations = [{ id: "tv", name: "TV", initial: 50000 }];
  state.expenses = [
    makeRow("food", 12000),
    makeRow("debt", 2000, { kind: "debt", debtId: "tv" }),
    makeRow("reserve", 7000, { kind: "savings" }),
    makeRow("bonds", 10000, { kind: "bonds" }),
  ];
  state.incomes = [
    {
      id: "salary",
      period: "2026-10",
      name: "Pensja",
      amount: 60000,
      date: "2026-10-10",
      received: true,
      note: "",
      splits: [
        { destination: "budget", amount: 40000 },
        { destination: "savings", amount: 20000 },
      ],
    },
  ];
  const stats = periodStatistics(state, "2026-10", "plan");
  assert.equal(stats.spendingTotal, 12000);
  assert.equal(stats.total, 31000);
  assert.equal(stats.allocation.find((x) => x.id === "savings").amount, 7000);
  const comparison = comparisonPeriods(state, "2026-10").find(
    (x) => x.period === "2026-10",
  );
  assert.equal(comparison.income, 40000);
  assert.equal(comparison.remaining, 9000);
  assert.equal(periodStatistics(state, "2026-09", "plan").total, 0);
});
