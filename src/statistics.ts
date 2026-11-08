import {
  currentPeriod,
  knownPeriods,
  rowsForPeriod,
  summary,
} from "../server/domain.mjs";
import type { State } from "./types";
export function periodStatistics(
  state: State,
  period: string,
  mode: "plan" | "done",
) {
  const paid = new Set(state.settlements.map((s) => s.row.id));
  const rows = rowsForPeriod(state, period).filter(
    (r) => r.source === "personal" && (mode === "plan" || paid.has(r.id)),
  );
  const categoryTotals = new Map<string, number>();
  for (const row of rows.filter((r) => r.kind === "expense"))
    categoryTotals.set(
      row.category,
      (categoryTotals.get(row.category) || 0) + row.amount,
    );
  const spending = [...categoryTotals]
    .map(([id, amount]) => ({ id, label: id, amount }))
    .sort(
      (a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "pl"),
    );
  const allocation = [
    { id: "expense", label: "Wydatki i pule na zakupy" },
    { id: "debt", label: "Raty i nadpłaty" },
    { id: "savings", label: "Konto oszczędnościowe" },
    { id: "bonds", label: "Obligacje" },
    { id: "sharedDeposit", label: "Wpłaty na wspólne konto" },
  ].map((item) => ({
    ...item,
    amount: rows
      .filter((r) => r.kind === item.id)
      .reduce((sum, r) => sum + r.amount, 0),
  }));
  return {
    spending,
    spendingTotal: spending.reduce((sum, r) => sum + r.amount, 0),
    allocation,
    total: allocation.reduce((sum, r) => sum + r.amount, 0),
  };
}
export function comparisonPeriods(state: State, selected: string) {
  return [...new Set([...knownPeriods(state), currentPeriod(), selected])]
    .sort()
    .slice(-6)
    .map((period) => ({ period, ...summary(state, period) }));
}
