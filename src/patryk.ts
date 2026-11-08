import {
  currentPeriod,
  householdForPeriod,
  patrykOwnRows,
  shiftPeriod,
} from "../server/domain.mjs";
import type { PatrykExpense, State } from "./types";
export type PatrykDisplayRow = {
  id: string;
  name: string;
  amount: number;
  source: "home" | "own" | "legacy";
  recurring: boolean;
  note: string;
  row?: PatrykExpense;
};
export function patrykPeriod(state: State, period: string) {
  const month = state.patrykMonths?.find((m) => m.period === period),
    legacy = state.patryk.find((m) => m.period === period);
  const own = patrykOwnRows(state, period);
  const useLegacy = !!legacy && !month?.detailedExpenses;
  const rows: PatrykDisplayRow[] = useLegacy
    ? [
        {
          id: `legacy_${period}`,
          name: "Wydatki z wcześniejszego podsumowania",
          amount: legacy!.expenses,
          source: "legacy",
          recurring: false,
          note: "",
        },
      ]
    : [
        ...householdForPeriod(state, period)
          .filter((c) => c.partner > 0)
          .map((c): PatrykDisplayRow => ({
            id: `home_${c.id}`,
            name: c.version.name,
            amount: c.partner,
            source: "home",
            recurring: true,
            note: c.version.note,
          })),
        ...own.map((r): PatrykDisplayRow => ({
          id: r.id,
          name: r.name,
          amount: r.amount,
          source: "own",
          recurring: !!r.templateId,
          note: "",
          row: r,
        })),
      ];
  return {
    rows,
    total: rows.reduce((sum, r) => sum + r.amount, 0),
    income: month?.income ?? legacy?.income ?? null,
    month,
    legacy,
    useLegacy,
  };
}
export function patrykComparison(
  state: State,
  period: string,
  id: string,
  source: string,
  templateId?: string,
) {
  const previous = patrykPeriod(state, shiftPeriod(period, -1));
  return previous.rows.find((r) =>
    source === "home"
      ? r.id === id
      : "row" in r && r.row?.templateId === templateId,
  );
}
export function patrykSavingsNet(state: State, period: string) {
  return (state.patrykMovements || [])
    .filter(
      (m) =>
        m.period === period &&
        !m.reversedBy &&
        !m.reverses &&
        (m.kind === "deposit" || m.kind === "withdrawal"),
    )
    .reduce((sum, m) => sum + m.amount, 0);
}
export function patrykStatistics(state: State) {
  const salaryPeriods = [
    ...new Set([
      ...state.patryk.map((m) => m.period),
      ...(state.patrykMonths || [])
        .filter((m) => m.income !== undefined)
        .map((m) => m.period),
    ]),
  ]
    .filter((p) => p <= currentPeriod())
    .sort();
  const savingsPeriods = (state.patrykMonths || [])
    .filter((m) => m.savingsComplete && m.period <= currentPeriod())
    .map((m) => m.period)
    .sort();
  const salary = salaryPeriods.map((p) => patrykPeriod(state, p));
  const mean = (values: number[]) =>
    values.length
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : null;
  return {
    salaryPeriods,
    savingsPeriods,
    averageIncome: mean(salary.map((m) => m.income!)),
    averageExpenses: mean(salary.map((m) => m.total)),
    averageSavings: mean(savingsPeriods.map((p) => patrykSavingsNet(state, p))),
  };
}
