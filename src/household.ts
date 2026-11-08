import { currentPeriod, householdForPeriod } from "../server/domain.mjs";
import type { State } from "./types";
export function householdTotals(state: State, period: string) {
  const costs = householdForPeriod(state, period);
  const own = costs.reduce((sum, c) => sum + c.own, 0),
    partner = costs.reduce((sum, c) => sum + c.partner, 0);
  return {
    own,
    partner,
    total: own + partner,
    ownPercent: own + partner ? (own / (own + partner)) * 100 : 0,
    partnerPercent: own + partner ? (partner / (own + partner)) * 100 : 0,
  };
}
export function sharedEntries(state: State) {
  const entries = state.transactions
    .filter((t) => t.account === "shared")
    .map((t) => ({
      id: t.id,
      date: t.date,
      name:
        t.name ||
        (t.kind === "deposit"
          ? "Wpływ"
          : t.kind === "withdrawal"
            ? "Wydatek"
            : t.kind === "reversal"
              ? "Cofnięcie"
              : "Korekta salda"),
      note: t.note,
      amount: t.amount,
      kind:
        t.kind === "correction"
          ? "correction"
          : t.kind === "withdrawal"
            ? "expense"
            : t.kind === "deposit"
              ? "income"
              : "reversal",
      effective: !t.reversedBy && !t.reverses,
    }));
  for (const settlement of state.settlements) {
    const row = settlement.row;
    if (row.source === "shared" || row.kind === "sharedDeposit")
      entries.push({
        id: settlement.id,
        date: settlement.date,
        name: row.name,
        note: row.note,
        amount: row.source === "shared" ? -row.amount : row.amount,
        kind: row.source === "shared" ? "expense" : "income",
        effective: true,
      });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}
export function sharedPeriodStats(state: State, period: string) {
  const entries = sharedEntries(state).filter(
    (e) => e.effective && currentPeriod(e.date) === period,
  );
  const income = entries
    .filter((e) => e.kind === "income")
    .reduce((sum, e) => sum + e.amount, 0);
  const expenses = entries
    .filter((e) => e.kind === "expense")
    .reduce((sum, e) => sum - e.amount, 0);
  const corrections = entries
    .filter((e) => e.kind === "correction")
    .reduce((sum, e) => sum + e.amount, 0);
  return {
    entries,
    income,
    expenses,
    corrections,
    net: income - expenses + corrections,
  };
}
