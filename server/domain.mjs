import { z } from "zod";

const cents = z.number().int().safe().min(0).max(100_000_000_000);
const signed = z
  .number()
  .int()
  .safe()
  .min(-100_000_000_000)
  .max(100_000_000_000);
const positive = cents.refine((v) => v > 0, "Podaj kwotę większą od zera.");
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const name = z.string().trim().min(1, "Podaj nazwę.").max(120);
const note = z.string().max(1000).default("");
export const periodSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const date = z
  .string()
  .regex(/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, "Podaj prawidłową datę.");
const category = z.string().trim().min(1, "Podaj kategorię.").max(60);
const kind = z.enum(["expense", "debt", "savings", "bonds", "sharedDeposit"]);
const account = z.enum(["savings", "bonds", "shared"]);
const destination = z.enum(["budget", "savings", "bonds", "debt"]);
const rowFields = {
  name,
  amount: positive,
  category,
  source: z.enum(["personal", "shared"]),
  kind,
  debtId: id.optional(),
  note,
  household: z.boolean().default(false),
  fundingAccount: z.literal("savings").optional(),
};
const expenseSchema = z
  .object({
    id,
    period: periodSchema,
    ...rowFields,
    amount: cents,
    templateId: id.optional(),
    dueDate: date.optional(),
  })
  .strict();
const versionSchema = z
  .object({
    from: periodSchema,
    ...rowFields,
    dueDay: z.number().int().min(1).max(31).optional(),
    everyMonths: z.union([z.literal(1), z.literal(2)]).optional(),
    anchor: periodSchema.optional(),
    amount: cents,
    stopped: z.boolean().default(false),
  })
  .strict();
const splitSchema = z
  .object({ destination, amount: positive, debtId: id.optional() })
  .strict();
const incomeSchema = z
  .object({
    id,
    period: periodSchema,
    name,
    amount: positive,
    date,
    received: z.boolean(),
    splits: z.array(splitSchema).min(1).max(20),
    note,
  })
  .strict();
const transactionSchema = z
  .object({
    id,
    date,
    account: z.string().max(120),
    name: name.optional(),
    amount: signed,
    note,
    kind: z.enum(["deposit", "withdrawal", "correction", "reversal"]),
    reversedBy: id.optional(),
    reverses: id.optional(),
  })
  .strict();
const patrykSchema = z
  .object({
    period: periodSchema,
    income: cents,
    expenses: cents,
    savings: cents,
    note,
  })
  .strict();
const debtSchema = z
  .object({
    id,
    name,
    initial: cents,
    paymentAccount: z.string().trim().max(80).optional(),
    paymentTitle: z.string().trim().max(140).optional(),
    templateId: id.optional(),
  })
  .strict();
const goalMemberSchema = z
  .object({ type: z.enum(["template", "row"]), ref: id })
  .strict();
const goalGroupSchema = z
  .object({ id, name, members: z.array(goalMemberSchema).max(20000) })
  .strict();
const householdVersionSchema = z
  .object({
    from: periodSchema,
    name,
    own: cents,
    partner: cents,
    category,
    note,
    everyMonths: z.union([z.literal(1), z.literal(2)]),
    anchor: periodSchema,
    dueDay: z.number().int().min(1).max(31).optional(),
    estimated: z.boolean(),
    stopped: z.boolean().default(false),
  })
  .strict();
const householdCostSchema = z
  .object({
    id,
    templateId: id,
    versions: z.array(householdVersionSchema).min(1).max(500),
  })
  .strict();
const patrykMonthSchema = z
  .object({
    period: periodSchema,
    income: cents.optional(),
    note,
    detailedExpenses: z.boolean().default(false),
    savingsComplete: z.boolean().default(false),
  })
  .strict();
const patrykExpenseSchema = z
  .object({
    id,
    period: periodSchema,
    name,
    amount: positive,
    templateId: id.optional(),
  })
  .strict();
const patrykRecurringSchema = z
  .object({
    id,
    versions: z
      .array(
        z
          .object({
            from: periodSchema,
            name,
            amount: positive,
            stopped: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
const patrykMovementSchema = z
  .object({
    id,
    period: periodSchema,
    date,
    amount: signed,
    kind: z.enum(["deposit", "withdrawal", "correction", "reversal"]),
    note,
    alreadyIncluded: z.boolean().optional(),
    reversedBy: id.optional(),
    reverses: id.optional(),
  })
  .strict();
export const stateSchema = z
  .object({
    version: z.literal(1),
    goalGroups: z.array(goalGroupSchema).max(100).default([]),
    householdCosts: z.array(householdCostSchema).max(1000).default([]),
    settings: z.object({ reserveTarget: cents }).strict(),
    openings: z
      .object({ savings: cents, bonds: cents, shared: cents })
      .strict(),
    recurring: z
      .array(
        z
          .object({ id, versions: z.array(versionSchema).min(1).max(500) })
          .strict(),
      )
      .max(1000),
    expenses: z.array(expenseSchema).max(20000),
    incomes: z.array(incomeSchema).max(20000),
    settlements: z
      .array(z.object({ id, row: expenseSchema, date }).strict())
      .max(20000),
    obligations: z.array(debtSchema).max(200),
    transactions: z.array(transactionSchema).max(20000),
    patryk: z.array(patrykSchema).max(1200),
    patrykMonths: z.array(patrykMonthSchema).max(1200).default([]),
    patrykExpenses: z.array(patrykExpenseSchema).max(20000).default([]),
    patrykRecurring: z.array(patrykRecurringSchema).max(1000).default([]),
    patrykSavingsOpening: cents.optional(),
    patrykSavingsOpeningPeriod: periodSchema.optional(),
    patrykMovements: z.array(patrykMovementSchema).max(20000).default([]),
    audit: z
      .array(
        z
          .object({
            id,
            at: z.string().datetime(),
            label: z.string().max(200),
            details: z.string().max(20000).optional(),
          })
          .strict(),
      )
      .max(50000),
  })
  .strict();

export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = "DomainError";
  }
}
function requireThat(condition, message) {
  if (!condition) throw new DomainError(message);
}
export function emptyState() {
  return {
    version: 1,
    goalGroups: [],
    householdCosts: [],
    settings: { reserveTarget: 1_000_000 },
    openings: { savings: 0, bonds: 0, shared: 0 },
    recurring: [],
    expenses: [],
    incomes: [],
    settlements: [],
    obligations: [],
    transactions: [],
    patryk: [],
    patrykMonths: [],
    patrykExpenses: [],
    patrykRecurring: [],
    patrykMovements: [],
    audit: [],
  };
}
export function today(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function shiftPeriod(period, delta) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 10));
  return d.toISOString().slice(0, 7);
}
export function currentPeriod(day = today()) {
  return +day.slice(8) >= 10
    ? day.slice(0, 7)
    : shiftPeriod(day.slice(0, 7), -1);
}
export function periodBounds(period) {
  return { start: `${period}-10`, end: `${shiftPeriod(period, 1)}-09` };
}
export function money(value) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(value / 100);
}
export function parseMoney(value) {
  const normalized = String(value)
    .trim()
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(",", ".");
  requireThat(
    /^-?\d{1,9}(\.\d{1,2})?$/.test(normalized),
    "Podaj kwotę, np. 1250,50 (najwyżej dwa miejsca po przecinku).",
  );
  return Math.round(Number(normalized) * 100);
}
export function dueDate(period, day) {
  if (!day) return undefined;
  const month = day >= 10 ? period : shiftPeriod(period, 1);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
function checkRow(state, row) {
  requireThat(
    !row.fundingAccount ||
      (row.source === "personal" && row.kind === "expense"),
    "Oszczędności mogą pokrywać tylko własny wydatek.",
  );
  requireThat(
    row.amount > 0 || row.kind === "expense",
    "Kwota tej pozycji musi być większa od zera.",
  );
  requireThat(
    !row.templateId ||
      (state.recurring.some((t) => t.id === row.templateId) &&
        row.id === `${row.templateId}_${row.period}`),
    "Nieprawidłowe powiązanie ze stałą pozycją.",
  );
  requireThat(
    row.templateId ||
      !state.recurring.some((t) => row.id === `${t.id}_${row.period}`),
    "Identyfikator koliduje ze stałą pozycją.",
  );
  requireThat(
    row.source !== "shared" || row.kind === "expense",
    "Ze wspólnego konta zapisuj wydatek; przelewy własne dodaj do swojego budżetu.",
  );
  requireThat(
    row.kind !== "debt" || state.obligations.some((d) => d.id === row.debtId),
    "Wybierz istniejące zobowiązanie.",
  );
  requireThat(
    row.kind === "debt" || !row.debtId,
    "Powiązanie z długiem jest dozwolone tylko przy racie.",
  );
  requireThat(
    row.kind !== "bonds" || row.amount % 10000 === 0,
    "Wpłata na obligacje musi być wielokrotnością 100 zł.",
  );
}
function checkIncome(state, income, day) {
  requireThat(
    income.splits.reduce((s, a) => s + a.amount, 0) === income.amount,
    "Suma przeznaczeń musi być równa kwocie wpływu.",
  );
  requireThat(
    income.date >= periodBounds(income.period).start &&
      income.date <= periodBounds(income.period).end,
    "Data wpływu musi należeć do wybranego okresu.",
  );
  requireThat(
    !income.received || income.date <= day,
    "Przyszły wpływ możesz zaplanować, ale nie oznaczyć jako otrzymany.",
  );
  for (const split of income.splits) {
    requireThat(
      split.destination !== "debt" ||
        state.obligations.some((d) => d.id === split.debtId),
      "Wybierz zobowiązanie dla spłaty.",
    );
    requireThat(
      split.destination === "debt" || !split.debtId,
      "Nieprawidłowe powiązanie wpływu z długiem.",
    );
    requireThat(
      split.destination !== "bonds" || split.amount % 10000 === 0,
      "Na obligacje przeznacz pełne wielokrotności 100 zł.",
    );
  }
}
export function balances(state) {
  const result = { ...state.openings };
  for (const debt of state.obligations)
    result[`debt:${debt.id}`] = debt.initial;
  const add = (key, value) => {
    result[key] = (result[key] ?? 0) + value;
  };
  for (const entry of state.transactions) add(entry.account, entry.amount);
  for (const { row } of state.settlements) {
    if (row.fundingAccount === "savings") add("savings", -row.amount);
    if (row.source === "shared") add("shared", -row.amount);
    else if (row.kind === "sharedDeposit") add("shared", row.amount);
    else if (row.kind === "savings" || row.kind === "bonds")
      add(row.kind, row.amount);
    else if (row.kind === "debt") add(`debt:${row.debtId}`, -row.amount);
  }
  for (const inc of state.incomes.filter((i) => i.received))
    for (const split of inc.splits) {
      if (split.destination === "savings" || split.destination === "bonds")
        add(split.destination, split.amount);
      if (split.destination === "debt")
        add(`debt:${split.debtId}`, -split.amount);
    }
  return result;
}
export function isScheduledPeriod(period, anchor, everyMonths = 1) {
  const index = (p) => +p.slice(0, 4) * 12 + +p.slice(5);
  return (
    index(period) >= index(anchor) &&
    (index(period) - index(anchor)) % everyMonths === 0
  );
}
export function patrykOwnRows(state, period) {
  const one = (state.patrykExpenses || []).filter((r) => r.period === period);
  const rows = [];
  for (const t of state.patrykRecurring || []) {
    const v = t.versions
      .filter((v) => v.from <= period)
      .sort((a, b) => a.from.localeCompare(b.from))
      .at(-1);
    if (!v || v.stopped) continue;
    rows.push(
      one.find((r) => r.templateId === t.id) || {
        id: `${t.id}_${period}`,
        templateId: t.id,
        period,
        name: v.name,
        amount: v.amount,
      },
    );
  }
  return rows.concat(one.filter((r) => !rows.some((x) => x.id === r.id)));
}
export function patrykSavingsBalance(state) {
  const latest = [...state.patryk]
    .filter((p) => p.period <= currentPeriod())
    .sort((a, b) => a.period.localeCompare(b.period))
    .at(-1);
  return (
    (state.patrykSavingsOpening ?? latest?.savings ?? 0) +
    (state.patrykMovements || []).reduce(
      (sum, m) => sum + (m.alreadyIncluded ? 0 : m.amount),
      0,
    )
  );
}
export function householdForPeriod(state, period) {
  const ownRows = rowsForPeriod(state, period);
  return (state.householdCosts || []).flatMap((cost) => {
    const version = cost.versions
      .filter((v) => v.from <= period)
      .sort((a, b) => a.from.localeCompare(b.from))
      .at(-1);
    if (
      !version ||
      version.stopped ||
      !isScheduledPeriod(period, version.anchor, version.everyMonths)
    )
      return [];
    const row = ownRows.find((r) => r.templateId === cost.templateId);
    const own = row?.amount ?? version.own;
    return [
      {
        ...cost,
        version,
        own,
        partner: version.partner,
        total: own + version.partner,
      },
    ];
  });
}
function rawRowsForPeriod(state, period) {
  const rows = state.expenses.filter((e) => e.period === period);
  const result = [];
  for (const template of state.recurring) {
    const v = [...template.versions]
      .sort((a, b) => a.from.localeCompare(b.from))
      .filter((v) => v.from <= period)
      .at(-1);
    if (!v || v.stopped) continue;
    if (
      v.everyMonths === 2 &&
      !isScheduledPeriod(period, v.anchor || v.from, 2)
    )
      continue;
    const { from, dueDay, stopped, everyMonths, anchor, ...values } = v;
    const rowId = `${template.id}_${period}`;
    const override = rows.find((r) => r.templateId === template.id);
    const row = override ?? {
      id: rowId,
      period,
      templateId: template.id,
      ...values,
      ...(dueDay ? { dueDate: dueDate(period, dueDay) } : {}),
    };
    result.push(row);
  }
  result.push(
    ...rows.filter(
      (r) =>
        !r.templateId || !result.some((v) => v.templateId === r.templateId),
    ),
  );
  // A completed transfer is a historical snapshot, independent of future template edits.
  for (const settlement of state.settlements.filter(
    (s) => s.row.period === period,
  )) {
    const index = result.findIndex((r) => r.id === settlement.row.id);
    if (index >= 0) result[index] = settlement.row;
    else result.push(settlement.row);
  }
  return result;
}
// Forecast pending installments against the actual remaining principal. Paid snapshots stay intact.
export function rowsForPeriod(state, period) {
  const managed = new Map(
    state.obligations
      .filter((d) => d.templateId)
      .map((d) => [d.id, d.templateId]),
  );
  if (!managed.size) return rawRowsForPeriod(state, period);
  const remaining = balances(state);
  const paid = new Set(state.settlements.map((s) => s.row.id));
  const starts = [
    ...state.recurring.flatMap((t) => t.versions.map((v) => v.from)),
    ...state.expenses.map((r) => r.period),
    period,
  ];
  const first = starts.sort()[0];
  let result = [];
  for (let cursor = first; cursor <= period; cursor = shiftPeriod(cursor, 1)) {
    const rows = rawRowsForPeriod(state, cursor);
    for (const row of rows)
      if (
        row.kind === "debt" &&
        managed.has(row.debtId) &&
        row.templateId !== managed.get(row.debtId) &&
        !paid.has(row.id)
      )
        remaining[`debt:${row.debtId}`] -= row.amount;
    result = rows.flatMap((row) => {
      if (
        row.kind !== "debt" ||
        row.templateId !== managed.get(row.debtId) ||
        !managed.has(row.debtId) ||
        paid.has(row.id)
      )
        return [row];
      const key = `debt:${row.debtId}`;
      const amount = Math.min(row.amount, Math.max(0, remaining[key]));
      remaining[key] -= amount;
      return amount ? [{ ...row, amount }] : [];
    });
  }
  return result;
}
export function isSubscription(row) {
  return (
    !!row.templateId && row.category === "subskrypcje" && row.kind === "expense"
  );
}
export function subscriptionRows(state, period) {
  return rowsForPeriod(state, period).filter(
    (r) => r.source === "personal" && isSubscription(r),
  );
}
export function summary(state, period) {
  const rows = rowsForPeriod(state, period);
  const incomes = state.incomes.filter((i) => i.period === period);
  const income = incomes.reduce(
    (sum, i) =>
      sum +
      i.splits
        .filter((s) => s.destination === "budget")
        .reduce((a, b) => a + b.amount, 0),
    0,
  );
  const received = incomes
    .filter((i) => i.received)
    .reduce(
      (sum, i) =>
        sum +
        i.splits
          .filter((s) => s.destination === "budget")
          .reduce((a, b) => a + b.amount, 0),
      0,
    );
  const personal = rows.filter((r) => r.source === "personal");
  const planned = personal.reduce((sum, r) => sum + r.amount, 0);
  const done = personal
    .filter((r) => state.settlements.some((s) => s.row.id === r.id))
    .reduce((sum, r) => sum + r.amount, 0);
  const fundedFromSavings = personal
    .filter((r) => r.fundingAccount === "savings")
    .reduce((sum, r) => sum + r.amount, 0);
  const fundedAndDone = personal
    .filter(
      (r) =>
        r.fundingAccount === "savings" &&
        state.settlements.some((s) => s.row.id === r.id),
    )
    .reduce((sum, r) => sum + r.amount, 0);
  const withdrawals = state.transactions
    .filter((t) => {
      if (t.account !== "savings") return false;
      const original = t.reverses
        ? state.transactions.find((v) => v.id === t.reverses)
        : undefined;
      return (
        (t.kind === "withdrawal" || original?.kind === "withdrawal") &&
        currentPeriod(original?.date ?? t.date) === period
      );
    })
    .reduce((s, t) => s - t.amount, 0);
  return {
    income,
    received,
    planned,
    done,
    remaining: income + withdrawals + fundedFromSavings - planned,
    available: received + withdrawals + fundedAndDone - done,
    toSettle: planned - done,
    withdrawals,
  };
}
export function savingsProposal(state, period) {
  const surplus = Math.max(0, summary(state, period).remaining);
  // Already planned reserve transfers also fill the target, without changing the real balance.
  const plannedReserve = rowsForPeriod(state, period)
    .filter(
      (r) =>
        r.kind === "savings" &&
        !state.settlements.some((s) => s.row.id === r.id),
    )
    .reduce((s, r) => s + r.amount, 0);
  const pendingWithdrawal = rowsForPeriod(state, period)
    .filter(
      (r) =>
        r.fundingAccount === "savings" &&
        !state.settlements.some((s) => s.row.id === r.id),
    )
    .reduce((sum, r) => sum + r.amount, 0);
  const reserve = Math.min(
    surplus,
    Math.max(
      0,
      state.settings.reserveTarget -
        balances(state).savings -
        plannedReserve +
        pendingWithdrawal,
    ),
  );
  const bonds = Math.floor((surplus - reserve) / 10000) * 10000;
  return { reserve, bonds, remainder: surplus - reserve - bonds };
}
export function knownPeriods(state) {
  return [
    ...new Set([
      ...state.incomes.map((i) => i.period),
      ...state.expenses.map((e) => e.period),
      ...state.patryk.map((p) => p.period),
      ...(state.patrykMonths || []).map((p) => p.period),
      ...(state.patrykExpenses || []).map((p) => p.period),
      ...(state.patrykRecurring || []).flatMap((t) =>
        t.versions.map((v) => v.from),
      ),
      ...(state.patrykMovements || []).map((p) => p.period),
      ...state.settlements.map((s) => s.row.period),
      ...state.recurring.flatMap((t) => t.versions.map((v) => v.from)),
    ]),
  ].sort();
}
export function overdueRows(state, day = today()) {
  const periods = new Set([...knownPeriods(state), currentPeriod(day)]);
  const earliest = [...periods].sort()[0];
  let cursor = earliest;
  for (
    let i = 0;
    cursor <= currentPeriod(day) && i < 1200;
    i++, cursor = shiftPeriod(cursor, 1)
  )
    periods.add(cursor);
  return [...periods]
    .flatMap((p) => rowsForPeriod(state, p))
    .filter(
      (r) =>
        r.amount > 0 &&
        !state.settlements.some((s) => s.row.id === r.id) &&
        ((r.dueDate && r.dueDate < day) || r.period < currentPeriod(day)),
    );
}

const actionSchemas = {
  savePatrykIncome: z
    .object({
      type: z.literal("savePatrykIncome"),
      period: periodSchema,
      income: cents,
      note,
    })
    .strict(),
  savePatrykExpense: z
    .object({
      type: z.literal("savePatrykExpense"),
      row: patrykExpenseSchema,
      recurring: z.boolean(),
    })
    .strict(),
  deletePatrykExpense: z
    .object({
      type: z.literal("deletePatrykExpense"),
      rowId: id,
      period: periodSchema,
    })
    .strict(),
  enablePatrykDetails: z
    .object({ type: z.literal("enablePatrykDetails"), period: periodSchema })
    .strict(),
  patrykMovement: z
    .object({
      type: z.literal("patrykMovement"),
      period: periodSchema,
      date,
      amount: positive,
      kind: z.enum(["deposit", "withdrawal"]),
      note,
      alreadyIncluded: z.boolean().optional(),
    })
    .strict(),
  patrykCorrectSavings: z
    .object({
      type: z.literal("patrykCorrectSavings"),
      period: periodSchema,
      date,
      balance: cents,
      note,
    })
    .strict(),
  reversePatrykMovement: z
    .object({ type: z.literal("reversePatrykMovement"), movementId: id })
    .strict(),
  completePatrykSavings: z
    .object({
      type: z.literal("completePatrykSavings"),
      period: periodSchema,
      complete: z.boolean(),
    })
    .strict(),
  saveHouseholdCost: z
    .object({
      type: z.literal("saveHouseholdCost"),
      id,
      templateId: id.optional(),
      scope: z.enum(["one", "future"]).default("future"),
      version: householdVersionSchema,
    })
    .strict(),
  stopHouseholdCost: z
    .object({
      type: z.literal("stopHouseholdCost"),
      costId: id,
      period: periodSchema,
    })
    .strict(),
  saveGoalGroup: z
    .object({ type: z.literal("saveGoalGroup"), group: goalGroupSchema })
    .strict(),
  deleteGoalGroup: z
    .object({ type: z.literal("deleteGoalGroup"), groupId: id })
    .strict(),
  saveExpense: z
    .object({
      type: z.literal("saveExpense"),
      row: expenseSchema,
      recurring: z.boolean(),
      scope: z.enum(["one", "future"]),
      fundingRowId: id.optional(),
      dueDay: z.number().int().min(1).max(31).optional(),
    })
    .strict(),
  deleteExpense: z
    .object({
      type: z.literal("deleteExpense"),
      rowId: id,
      period: periodSchema,
      scope: z.enum(["one", "future"]),
    })
    .strict(),
  settleSubscriptions: z
    .object({
      type: z.literal("settleSubscriptions"),
      period: periodSchema,
      settled: z.boolean(),
    })
    .strict(),
  settle: z
    .object({
      type: z.literal("settle"),
      rowId: id,
      period: periodSchema,
      settled: z.boolean(),
    })
    .strict(),
  saveIncome: z
    .object({ type: z.literal("saveIncome"), income: incomeSchema })
    .strict(),
  deleteIncome: z
    .object({ type: z.literal("deleteIncome"), incomeId: id })
    .strict(),
  saveDebt: z
    .object({
      type: z.literal("saveDebt"),
      debt: debtSchema,
      schedule: z
        .object({
          amount: positive,
          day: z.number().int().min(1).max(31),
          start: periodSchema,
        })
        .strict()
        .optional(),
    })
    .strict(),
  overpayDebt: z
    .object({
      type: z.literal("overpayDebt"),
      debtId: id,
      amount: positive,
      date,
      note,
      fromBudget: z.boolean(),
    })
    .strict(),
  transaction: z
    .object({
      type: z.literal("transaction"),
      account: z.string().max(120),
      name: name.optional(),
      amount: positive,
      kind: z.enum(["deposit", "withdrawal", "correction"]),
      date,
      note,
    })
    .strict(),
  correctBalance: z
    .object({
      type: z.literal("correctBalance"),
      account: z.string().max(120),
      balance: cents,
      date,
      note,
    })
    .strict(),
  reverseTransaction: z
    .object({ type: z.literal("reverseTransaction"), transactionId: id })
    .strict(),
  savePatryk: z
    .object({ type: z.literal("savePatryk"), record: patrykSchema })
    .strict(),
  settings: z
    .object({ type: z.literal("settings"), reserveTarget: cents })
    .strict(),
  allocate: z
    .object({
      type: z.literal("allocate"),
      period: periodSchema,
      remainder: z.enum(["savings", "budget"]),
    })
    .strict(),
  restore: z
    .object({ type: z.literal("restore"), backup: z.unknown() })
    .strict(),
};
const actionSchema = z.discriminatedUnion("type", Object.values(actionSchemas));
export function validateBackup(input) {
  const parsed = z
    .object({
      format: z.literal("budzet-backup"),
      version: z.literal(1),
      exportedAt: z.string().datetime(),
      state: stateSchema,
    })
    .strict()
    .parse(input);
  const state = parsed.state;
  const unique = (list) =>
    requireThat(
      new Set(list).size === list.length,
      "Kopia zawiera powtórzone identyfikatory.",
    );
  unique(state.expenses.map((x) => x.id));
  requireThat(
    !state.patrykSavingsOpeningPeriod ||
      (state.patrykSavingsOpening !== undefined &&
        state.patrykSavingsOpeningPeriod <= currentPeriod()),
    "Nieprawidłowy okres salda początkowego oszczędności Patryka.",
  );
  unique(state.patrykMonths.map((m) => m.period));
  unique(state.patrykExpenses.map((r) => r.id));
  unique(state.patrykRecurring.map((t) => t.id));
  unique(state.patrykMovements.map((m) => m.id));
  for (const template of state.patrykRecurring)
    unique(template.versions.map((v) => v.from));
  for (const row of state.patrykExpenses)
    if (row.templateId)
      requireThat(
        state.patrykRecurring.some((t) => t.id === row.templateId) &&
          row.id === `${row.templateId}_${row.period}`,
        "Nieprawidłowa własna stała pozycja Patryka.",
      );
  for (const m of state.patrykMovements) {
    requireThat(
      m.date <= today() && m.period <= currentPeriod(),
      "Kopia zawiera przyszły ruch oszczędności Patryka.",
    );
    requireThat(
      m.kind !== "deposit" || m.amount > 0,
      "Nieprawidłowa wpłata oszczędności Patryka.",
    );
    requireThat(
      m.kind !== "withdrawal" || m.amount < 0,
      "Nieprawidłowa wypłata oszczędności Patryka.",
    );
    requireThat(
      m.kind !== "correction" || !m.alreadyIncluded,
      "Korekta salda nie może być pomijana jako ruch historyczny.",
    );
    requireThat(
      (m.kind === "reversal") === !!m.reverses,
      "Brak powiązania cofnięcia oszczędności Patryka.",
    );
    if (m.reverses) {
      const original = state.patrykMovements.find((x) => x.id === m.reverses);
      requireThat(
        original &&
          !original.reverses &&
          original.reversedBy === m.id &&
          m.amount === -original.amount &&
          !!m.alreadyIncluded === !!original.alreadyIncluded &&
          m.period === original.period &&
          m.date >= original.date,
        "Nieprawidłowe cofnięcie oszczędności Patryka.",
      );
    }
    if (m.reversedBy)
      requireThat(
        state.patrykMovements.some(
          (x) => x.id === m.reversedBy && x.reverses === m.id,
        ),
        "Brak odwrócenia ruchu oszczędności Patryka.",
      );
  }
  requireThat(
    patrykSavingsBalance(state) >= 0 &&
      Number.isSafeInteger(patrykSavingsBalance(state)),
    "Nieprawidłowe saldo oszczędności Patryka.",
  );
  unique(state.householdCosts.map((c) => c.id));
  unique(state.householdCosts.map((c) => c.templateId));
  for (const cost of state.householdCosts) {
    unique(cost.versions.map((v) => v.from));
    const template = state.recurring.find((t) => t.id === cost.templateId);
    requireThat(
      template &&
        template.versions.every(
          (v) =>
            v.kind === "expense" &&
            v.source === "personal" &&
            !v.fundingAccount,
        ),
      "Brak prawidłowej własnej pozycji wspólnego kosztu.",
    );
    for (const version of cost.versions)
      requireThat(
        template.versions.some(
          (v) =>
            v.from === version.from &&
            v.amount === version.own &&
            !!v.stopped === (version.stopped || version.own === 0) &&
            (v.everyMonths || 1) === version.everyMonths &&
            (v.anchor || v.from) === version.anchor,
        ),
        "Podział kosztu nie zgadza się z własną stałą pozycją.",
      );
    cost.versions.forEach((v) =>
      requireThat(
        v.own + v.partner > 0 && v.anchor <= v.from,
        "Nieprawidłowy podział kosztu lub cykl.",
      ),
    );
  }
  unique(state.goalGroups.map((g) => g.id));
  unique(
    state.goalGroups.flatMap((g) => g.members.map((m) => `${m.type}:${m.ref}`)),
  );
  for (const group of state.goalGroups)
    for (const member of group.members)
      requireThat(
        member.type === "template"
          ? state.recurring.some((t) => t.id === member.ref)
          : state.expenses.some((r) => r.id === member.ref) ||
              state.settlements.some((s) => s.row.id === member.ref),
        "Kopia zawiera nieistniejącą pozycję celu.",
      );
  unique(state.incomes.map((x) => x.id));
  unique(state.recurring.map((x) => x.id));
  unique(state.obligations.map((x) => x.id));
  unique(state.transactions.map((x) => x.id));
  unique(state.settlements.map((x) => x.row.id));
  unique(state.settlements.map((x) => x.id));
  unique(
    state.expenses
      .filter((e) => e.templateId)
      .map((e) => `${e.templateId}_${e.period}`),
  );
  unique(state.patryk.map((x) => x.period));
  unique(state.audit.map((x) => x.id));
  for (const debt of state.obligations)
    if (debt.templateId)
      requireThat(
        state.recurring.some(
          (t) =>
            t.id === debt.templateId &&
            t.versions.some((v) => v.kind === "debt" && v.debtId === debt.id) &&
            t.versions.every((v) => v.kind !== "debt" || v.debtId === debt.id),
        ),
        "Nieprawidłowe powiązanie harmonogramu rat.",
      );
  for (const t of state.recurring) {
    unique(t.versions.map((v) => v.from));
    t.versions.forEach((v) => checkRow(state, v));
  }
  const checkHouseholdRow = (r) => {
    if (state.householdCosts.some((c) => c.templateId === r.templateId))
      requireThat(
        r.source === "personal" && r.kind === "expense" && !r.fundingAccount,
        "Kopia zmienia znaczenie własnej części wspólnego kosztu.",
      );
  };
  state.expenses.forEach((r) => {
    checkRow(state, r);
    checkHouseholdRow(r);
  });
  state.settlements.forEach((s) => {
    checkRow(state, s.row);
    checkHouseholdRow(s.row);
    date.parse(s.date);
  });
  state.incomes.forEach((i) => checkIncome(state, i, today()));
  state.transactions.forEach((t) => {
    requireThat(
      [
        "savings",
        "bonds",
        "shared",
        ...state.obligations.map((d) => `debt:${d.id}`),
      ].includes(t.account),
      "Kopia wskazuje nieistniejące konto.",
    );
    requireThat(t.date <= today(), "Kopia zawiera przyszły ruch konta.");
    requireThat(
      t.kind !== "deposit" || t.amount > 0,
      "Nieprawidłowa kwota wpłaty.",
    );
    requireThat(
      t.kind !== "withdrawal" || t.amount < 0,
      "Nieprawidłowa kwota wypłaty.",
    );
    requireThat(
      !(t.kind === "deposit" && t.account === "bonds") ||
        t.amount % 10000 === 0,
      "Nieprawidłowa wpłata na obligacje.",
    );
    requireThat(
      !t.account.startsWith("debt:") ||
        t.kind === "correction" ||
        t.kind === "reversal" ||
        t.kind === "withdrawal",
      "Nieprawidłowy ruch długu.",
    );
    requireThat(
      (t.kind === "reversal") === !!t.reverses,
      "Brak powiązania cofniętego ruchu.",
    );
    if (t.reverses) {
      const original = state.transactions.find((v) => v.id === t.reverses);
      requireThat(
        original &&
          !original.reverses &&
          original.reversedBy === t.id &&
          original.account === t.account &&
          original.amount === -t.amount &&
          original.date <= t.date,
        "Nieprawidłowe powiązanie cofnięcia.",
      );
    }
    if (t.reversedBy) {
      const reversal = state.transactions.find((v) => v.id === t.reversedBy);
      requireThat(
        reversal?.reverses === t.id,
        "Nieprawidłowe powiązanie z operacją odwracającą.",
      );
    }
  });
  for (const [key, balance] of Object.entries(balances(state)))
    requireThat(
      balance >= 0 && Number.isSafeInteger(balance),
      `Nieprawidłowe saldo w kopii: ${key}.`,
    );
  return state;
}
export function exportBackup(state, now = new Date()) {
  return {
    format: "budzet-backup",
    version: 1,
    exportedAt: now.toISOString(),
    state,
  };
}

export function applyAction(inputState, input, operationId, now = new Date()) {
  const action = actionSchema.parse(input);
  id.parse(operationId);
  let state = structuredClone(inputState);
  state.goalGroups ??= [];
  state.householdCosts ??= [];
  state.patrykMonths ??= [];
  state.patrykExpenses ??= [];
  state.patrykRecurring ??= [];
  state.patrykMovements ??= [];
  const day = today(now);
  let label = "";
  const rowAt = (rowId, period) => {
    const row = rowsForPeriod(state, period).find((r) => r.id === rowId);
    requireThat(row, "Ta pozycja już nie istnieje. Odśwież dane.");
    return row;
  };
  const upsert = (list, entry, key = "id") => {
    const index = list.findIndex((i) => i[key] === entry[key]);
    if (index >= 0) list[index] = entry;
    else list.push(entry);
  };
  const checkAccount = (acc) =>
    requireThat(
      [
        "savings",
        "bonds",
        "shared",
        ...state.obligations.map((d) => `debt:${d.id}`),
      ].includes(acc),
      "Wybierz istniejące konto.",
    );
  const patrykMonth = (period) => {
    let record = state.patrykMonths.find((m) => m.period === period);
    if (!record) {
      record = {
        period,
        note: "",
        detailedExpenses: false,
        savingsComplete: false,
      };
      state.patrykMonths.push(record);
    }
    return record;
  };
  if (action.type === "savePatrykIncome") {
    const record = patrykMonth(action.period);
    record.income = action.income;
    record.note = action.note;
    label = "Zapisano wypłatę Patryka";
  } else if (action.type === "enablePatrykDetails") {
    patrykMonth(action.period).detailedExpenses = true;
    label = "Włączono szczegółową listę wydatków Patryka";
  } else if (action.type === "savePatrykExpense") {
    const row = action.row;
    requireThat(
      !state.patrykExpenses.some(
        (r) => r.id === row.id && r.period !== row.period,
      ),
      "Nie można zmienić okresu istniejącego wydatku.",
    );
    if (action.recurring) {
      const templateId = row.templateId || row.id;
      const template = state.patrykRecurring.find(
        (t) => t.id === templateId,
      ) || { id: templateId, versions: [] };
      requireThat(
        !row.templateId ||
          state.patrykRecurring.some((t) => t.id === row.templateId),
        "Nie istnieje stała pozycja Patryka.",
      );
      template.versions = template.versions.filter((v) => v.from < row.period);
      template.versions.push({
        from: row.period,
        name: row.name,
        amount: row.amount,
        stopped: false,
      });
      upsert(state.patrykRecurring, template);
      state.patrykExpenses = state.patrykExpenses.filter(
        (r) =>
          r.id !== row.id &&
          !(r.templateId === templateId && r.period >= row.period),
      );
    } else {
      requireThat(
        !row.templateId,
        "Powtarzaną pozycję zakończ przyciskiem Zakończ.",
      );
      upsert(state.patrykExpenses, row);
    }
    patrykMonth(row.period).detailedExpenses = true;
    label = "Zapisano wydatek Patryka";
  } else if (action.type === "deletePatrykExpense") {
    const row = patrykOwnRows(state, action.period).find(
      (r) => r.id === action.rowId,
    );
    requireThat(row, "Ten wydatek już nie istnieje.");
    if (row.templateId) {
      const template = state.patrykRecurring.find(
        (t) => t.id === row.templateId,
      );
      template.versions = template.versions.filter(
        (v) => v.from < action.period,
      );
      template.versions.push({
        from: action.period,
        name: row.name,
        amount: row.amount,
        stopped: true,
      });
      state.patrykExpenses = state.patrykExpenses.filter(
        (r) => !(r.templateId === row.templateId && r.period >= action.period),
      );
    } else
      state.patrykExpenses = state.patrykExpenses.filter(
        (r) => r.id !== row.id,
      );
    patrykMonth(action.period).detailedExpenses = true;
    label = "Usunięto lub zakończono wydatek Patryka";
  } else if (
    action.type === "patrykMovement" ||
    action.type === "patrykCorrectSavings"
  ) {
    requireThat(
      action.date <= day && action.period <= currentPeriod(day),
      "Ruch oszczędności przypisz do bieżącego lub wcześniejszego okresu, bez przyszłej daty.",
    );
    const balance = patrykSavingsBalance(state);
    if (state.patrykSavingsOpening === undefined) {
      const latest = state.patryk
        .filter((p) => p.period <= currentPeriod(day))
        .sort((a, b) => a.period.localeCompare(b.period))
        .at(-1);
      state.patrykSavingsOpening =
        balance -
        state.patrykMovements.reduce(
          (sum, m) => sum + (m.alreadyIncluded ? 0 : m.amount),
          0,
        );
      if (latest) state.patrykSavingsOpeningPeriod = latest.period;
    }
    const alreadyIncluded =
      action.type === "patrykMovement"
        ? (action.alreadyIncluded ??
          (!!state.patrykSavingsOpeningPeriod &&
            action.period <= state.patrykSavingsOpeningPeriod))
        : false;
    const amount =
      action.type === "patrykCorrectSavings"
        ? action.balance - balance
        : action.kind === "deposit"
          ? action.amount
          : -action.amount;
    state.patrykMovements.push({
      id: operationId,
      period: action.period,
      date: action.date,
      amount,
      kind: action.type === "patrykCorrectSavings" ? "correction" : action.kind,
      alreadyIncluded,
      note: action.note,
    });
    patrykMonth(action.period).savingsComplete = false;
    label = "Zapisano ruch oszczędności Patryka";
  } else if (action.type === "reversePatrykMovement") {
    const movement = state.patrykMovements.find(
      (m) => m.id === action.movementId,
    );
    requireThat(
      movement && !movement.reversedBy && !movement.reverses,
      "Tego ruchu nie można ponownie cofnąć.",
    );
    state.patrykMovements.push({
      id: operationId,
      period: movement.period,
      date: day,
      amount: -movement.amount,
      kind: "reversal",
      note: `Cofnięcie: ${movement.note}`.slice(0, 1000),
      reverses: movement.id,
      alreadyIncluded: !!movement.alreadyIncluded,
    });
    movement.reversedBy = operationId;
    patrykMonth(movement.period).savingsComplete = false;
    label = "Cofnięto ruch oszczędności Patryka";
  } else if (action.type === "completePatrykSavings") {
    requireThat(
      action.period <= currentPeriod(day),
      "Przyszłego okresu nie można jeszcze oznaczyć jako uzupełniony.",
    );
    patrykMonth(action.period).savingsComplete = action.complete;
    label = "Zmieniono kompletność oszczędności Patryka";
  } else if (action.type === "saveHouseholdCost") {
    const v = action.version;
    requireThat(
      !v.stopped && v.own + v.partner > 0,
      "Podaj dodatnią kwotę kosztu.",
    );
    requireThat(
      v.anchor <= v.from,
      "Początek cyklu nie może być późniejszy niż okres zmiany.",
    );
    const existing = state.householdCosts.find((c) => c.id === action.id);
    const templateId =
      existing?.templateId || action.templateId || `home_${action.id}`;
    requireThat(
      !action.templateId ||
        !existing ||
        action.templateId === existing.templateId,
      "Nie można zmienić powiązanej pozycji.",
    );
    requireThat(
      !state.householdCosts.some(
        (c) => c.id !== action.id && c.templateId === templateId,
      ),
      "Ta pozycja ma już zdefiniowany podział kosztów.",
    );
    const template = state.recurring.find((t) => t.id === templateId);
    if (template && !existing)
      requireThat(
        template.versions.every(
          (r) =>
            r.source === "personal" &&
            r.kind === "expense" &&
            !r.fundingAccount,
        ),
        "Wybierz własną stałą pozycję wydatku.",
      );
    const paid = state.settlements.find(
      (s) => s.row.id === `${templateId}_${v.from}`,
    );
    requireThat(
      !paid || paid.row.amount === v.own,
      "Twoja część tego rachunku jest rozliczona. Cofnij rozliczenie albo wybierz kolejny okres.",
    );
    const version = {
      from: v.from,
      name: v.name,
      amount: v.own,
      category: v.category,
      source: "personal",
      kind: "expense",
      note: v.note,
      household: true,
      everyMonths: v.everyMonths,
      anchor: v.anchor,
      ...(v.dueDay ? { dueDay: v.dueDay } : {}),
      stopped: v.own === 0,
    };
    const target = template || { id: templateId, versions: [] };
    const cost = existing || { id: action.id, templateId, versions: [] };
    if (action.scope === "one") {
      requireThat(existing, "Najpierw utwórz wspólny koszt.");
      requireThat(
        isScheduledPeriod(v.from, v.anchor, v.everyMonths),
        "W tym okresie nie przypada rachunek. Wybierz okres płatności albo zmianę od tego okresu w kolejnych miesiącach.",
      );
      const previous = cost.versions
        .filter((r) => r.from <= v.from)
        .sort((a, b) => a.from.localeCompare(b.from))
        .at(-1);
      const previousOwn = target.versions
        .filter((r) => r.from <= v.from)
        .sort((a, b) => a.from.localeCompare(b.from))
        .at(-1);
      requireThat(
        previous && previousOwn,
        "Brak wcześniejszego planu tego kosztu.",
      );
      const next = shiftPeriod(v.from, 1);
      cost.versions = cost.versions.filter((r) => r.from !== v.from);
      cost.versions.push(v);
      target.versions = target.versions.filter((r) => r.from !== v.from);
      target.versions.push(version);
      if (!cost.versions.some((r) => r.from === next))
        cost.versions.push({ ...previous, from: next });
      if (!target.versions.some((r) => r.from === next))
        target.versions.push({ ...previousOwn, from: next });
      state.expenses = state.expenses.filter(
        (r) => !(r.templateId === templateId && r.period === v.from),
      );
    } else {
      target.versions = target.versions.filter((r) => r.from < v.from);
      target.versions.push(version);
      cost.versions = cost.versions.filter((r) => r.from < v.from);
      cost.versions.push(v);
      state.expenses = state.expenses.filter(
        (r) => !(r.templateId === templateId && r.period >= v.from),
      );
    }
    target.versions.sort((a, b) => a.from.localeCompare(b.from));
    cost.versions.sort((a, b) => a.from.localeCompare(b.from));
    upsert(state.recurring, target);
    upsert(state.householdCosts, cost);
    label = "Zapisano podział wspólnego kosztu i własną stałą pozycję";
  } else if (action.type === "stopHouseholdCost") {
    const cost = state.householdCosts.find((c) => c.id === action.costId);
    requireThat(cost, "Ten koszt już nie istnieje.");
    const v = cost.versions
      .filter((v) => v.from <= action.period)
      .sort((a, b) => a.from.localeCompare(b.from))
      .at(-1);
    requireThat(v, "Koszt nie obowiązuje w tym okresie.");
    requireThat(
      !state.settlements.some(
        (s) => s.row.id === `${cost.templateId}_${action.period}`,
      ),
      "Ta pozycja jest rozliczona. Zakończ ją od kolejnego okresu.",
    );
    cost.versions = cost.versions.filter((v) => v.from < action.period);
    cost.versions.push({ ...v, from: action.period, stopped: true });
    const template = state.recurring.find((t) => t.id === cost.templateId);
    const last = template.versions
      .filter((v) => v.from <= action.period)
      .sort((a, b) => a.from.localeCompare(b.from))
      .at(-1);
    template.versions = template.versions.filter((v) => v.from < action.period);
    template.versions.push({ ...last, from: action.period, stopped: true });
    state.expenses = state.expenses.filter(
      (r) => !(r.templateId === cost.templateId && r.period >= action.period),
    );
    label = "Zakończono wspólny koszt i własną stałą pozycję";
  } else if (action.type === "saveGoalGroup") {
    const members = action.group.members;
    requireThat(
      new Set(members.map((m) => `${m.type}:${m.ref}`)).size === members.length,
      "Pozycja nie może być przypisana dwa razy.",
    );
    for (const member of members)
      requireThat(
        member.type === "template"
          ? state.recurring.some((t) => t.id === member.ref)
          : state.expenses.some((r) => r.id === member.ref) ||
              state.settlements.some((s) => s.row.id === member.ref),
        "Wybrana pozycja już nie istnieje. Odśwież dane.",
      );
    const selected = new Set(members.map((m) => `${m.type}:${m.ref}`));
    for (const group of state.goalGroups)
      group.members = group.members.filter(
        (m) => !selected.has(`${m.type}:${m.ref}`),
      );
    upsert(state.goalGroups, action.group);
    label = "Zapisano grupę celów";
  } else if (action.type === "deleteGoalGroup") {
    requireThat(
      state.goalGroups.some((g) => g.id === action.groupId),
      "Ta grupa już nie istnieje.",
    );
    state.goalGroups = state.goalGroups.filter((g) => g.id !== action.groupId);
    label = "Usunięto grupę celów; wydatki pozostają w budżecie";
  } else if (action.type === "saveExpense") {
    const row = action.row;
    requireThat(row.amount > 0, "Podaj kwotę większą od zera.");
    checkRow(state, row);
    const householdCost = state.householdCosts.find(
      (c) => c.templateId === row.templateId,
    );
    requireThat(
      !householdCost ||
        (row.source === "personal" &&
          row.kind === "expense" &&
          !row.fundingAccount),
      "Własna część wspólnego kosztu musi pozostać własnym wydatkiem.",
    );
    requireThat(
      !householdCost || !(action.recurring && action.scope === "future"),
      "Stały podział tego kosztu zmień w Dom → Podział kosztów. W rozliczeniu możesz zmienić tylko bieżący okres.",
    );
    const scheduledDebt = state.obligations.find(
      (d) => d.templateId && d.templateId === row.templateId,
    );
    requireThat(
      !scheduledDebt ||
        (row.kind === "debt" &&
          row.debtId === scheduledDebt.id &&
          row.source === "personal"),
      "Rata musi pozostać powiązana ze swoim zobowiązaniem.",
    );
    requireThat(
      !action.dueDay ||
        (action.recurring &&
          action.scope === "future" &&
          row.dueDate === dueDate(row.period, action.dueDay)),
      "Dzień płatności musi odpowiadać terminowi stałej pozycji.",
    );
    requireThat(
      !row.dueDate ||
        (row.dueDate >= periodBounds(row.period).start &&
          row.dueDate <= periodBounds(row.period).end),
      "Termin płatności musi należeć do okresu.",
    );
    requireThat(
      !state.settlements.some((s) => s.row.id === row.id),
      "Najpierw cofnij rozdysponowanie tej pozycji.",
    );
    const existing = state.expenses.find((e) => e.id === row.id);
    if (action.fundingRowId) {
      requireThat(
        !existing &&
          !row.templateId &&
          !action.recurring &&
          row.kind === "expense" &&
          row.source === "personal" &&
          !row.fundingAccount,
        "Podział innej puli jest dostępny dla nowego jednorazowego wydatku.",
      );
      const source = rowAt(action.fundingRowId, row.period);
      requireThat(
        source.id !== row.id &&
          source.kind === "expense" &&
          source.source === "personal" &&
          !source.fundingAccount,
        "Wybierz własną pulę wydatków jako źródło.",
      );
      requireThat(
        source.amount >= row.amount,
        "Wydatek przekracza wybraną pulę. Zwiększ pulę lub wybierz inne źródło.",
      );
      const reduced = { ...source, amount: source.amount - row.amount };
      row.note = [row.note, `Pokryto z puli: ${source.name}`]
        .filter(Boolean)
        .join("\n")
        .slice(0, 1000);
      upsert(state.expenses, reduced);
      const sourceSettlement = state.settlements.find(
        (s) => s.row.id === source.id,
      );
      if (sourceSettlement) {
        sourceSettlement.row = reduced;
        state.settlements.push({ id: operationId, row, date: day });
      }
    }
    requireThat(
      !existing || existing.period === row.period,
      "Nie można zmienić okresu istniejącej pozycji.",
    );
    if (action.recurring && action.scope === "future") {
      const templateId = row.templateId ?? row.id;
      if (!row.templateId) {
        const owner = state.goalGroups.find((g) =>
          g.members.some((m) => m.type === "row" && m.ref === row.id),
        );
        if (owner)
          for (const group of state.goalGroups) {
            group.members = group.members.filter(
              (m) =>
                !(
                  (m.type === "row" && m.ref === row.id) ||
                  (m.type === "template" && m.ref === templateId)
                ),
            );
            if (group.id === owner.id)
              group.members.push({ type: "template", ref: templateId });
          }
      }
      const { id: _, period, templateId: __, dueDate: due, ...values } = row;
      const version = {
        from: period,
        ...values,
        ...(action.dueDay
          ? { dueDay: action.dueDay }
          : due
            ? { dueDay: +due.slice(8) }
            : {}),
        stopped: false,
      };
      let template = state.recurring.find((t) => t.id === templateId);
      if (!template) {
        template = { id: templateId, versions: [] };
        state.recurring.push(template);
      }
      template.versions = template.versions.filter((v) => v.from < period);
      template.versions.push(version);
      // New recurring item replaces its one-off source, without duplicating its amount.
      state.expenses = state.expenses.filter(
        (e) =>
          e.id !== row.id &&
          !(e.templateId === templateId && e.period >= period),
      );
    } else {
      if (row.templateId)
        requireThat(
          state.recurring.some((t) => t.id === row.templateId),
          "Nie istnieje szablon tej pozycji.",
        );
      upsert(state.expenses, row);
    }
    label = "Zapisano pozycję planu";
  } else if (action.type === "deleteExpense") {
    requireThat(
      !(
        action.scope === "future" &&
        state.householdCosts.some(
          (c) => `${c.templateId}_${action.period}` === action.rowId,
        )
      ),
      "Wspólny koszt zakończ w Dom → Podział kosztów.",
    );
    const row = rowAt(action.rowId, action.period);
    requireThat(
      !state.settlements.some((s) => s.row.id === row.id),
      "Najpierw cofnij rozdysponowanie.",
    );
    if (row.templateId) {
      const t = state.recurring.find((t) => t.id === row.templateId);
      if (action.scope === "future") {
        const latest = [...t.versions]
          .filter((v) => v.from <= row.period)
          .sort((a, b) => a.from.localeCompare(b.from))
          .at(-1);
        t.versions = t.versions.filter((v) => v.from < row.period);
        t.versions.push({ ...latest, from: row.period, stopped: true });
        state.expenses = state.expenses.filter(
          (e) => !(e.templateId === row.templateId && e.period >= row.period),
        );
      } else {
        // A zero-value stopped override is modeled as a period exclusion on the template.
        requireThat(
          false,
          "Stałą pozycję zakończ od tego okresu albo zmień jej kwotę tylko w tym okresie.",
        );
      }
    } else state.expenses = state.expenses.filter((e) => e.id !== row.id);
    label = "Usunięto pozycję planu";
  } else if (action.type === "settleSubscriptions") {
    const subscriptions = subscriptionRows(state, action.period);
    requireThat(subscriptions.length > 0, "Brak subskrypcji w tym okresie.");
    if (action.settled) {
      requireThat(
        action.period <= currentPeriod(day),
        "Przyszły okres jest planem. Rozliczysz go po rozpoczęciu.",
      );
      subscriptions.forEach((row, index) => {
        if (
          row.amount > 0 &&
          !state.settlements.some((s) => s.row.id === row.id)
        )
          state.settlements.push({
            id: `${operationId.slice(0, 80)}_sub_${index}`,
            row,
            date: day,
          });
      });
    } else {
      const ids = new Set(subscriptions.map((r) => r.id));
      state.settlements = state.settlements.filter((s) => !ids.has(s.row.id));
    }
    label = action.settled
      ? "Przelano środki na subskrypcje"
      : "Cofnięto przelew na subskrypcje";
  } else if (action.type === "settle") {
    const row = rowAt(action.rowId, action.period);
    const existing = state.settlements.find((s) => s.row.id === row.id);
    if (action.settled && !existing) {
      requireThat(
        row.period <= currentPeriod(day),
        "Przyszły okres jest planem. Rozliczysz go po rozpoczęciu.",
      );
      state.settlements.push({ id: operationId, row, date: day });
    }
    if (!action.settled && existing)
      state.settlements = state.settlements.filter((s) => s.row.id !== row.id);
    label = action.settled
      ? "Oznaczono jako rozdysponowane"
      : "Cofnięto rozdysponowanie";
  } else if (action.type === "saveIncome") {
    checkIncome(state, action.income, day);
    upsert(state.incomes, action.income);
    label = "Zapisano wpływ";
  } else if (action.type === "deleteIncome") {
    requireThat(
      state.incomes.some((i) => i.id === action.incomeId),
      "Nie znaleziono wpływu.",
    );
    state.incomes = state.incomes.filter((i) => i.id !== action.incomeId);
    label = "Usunięto wpływ i jego przeznaczenia";
  } else if (action.type === "saveDebt") {
    const existing = state.obligations.find((d) => d.id === action.debt.id);
    requireThat(
      !existing || existing.initial === action.debt.initial,
      "Aktualne saldo zmień przez korektę, aby zachować historię.",
    );
    requireThat(
      !action.debt.templateId ||
        action.debt.templateId === existing?.templateId,
      "Nie można przypisać obcego harmonogramu rat.",
    );
    const debt = {
      ...action.debt,
      ...(existing?.templateId ? { templateId: existing.templateId } : {}),
    };
    if (action.schedule) {
      const schedule = action.schedule;
      requireThat(
        !existing || schedule.start >= currentPeriod(day),
        "Zmianę raty zaplanuj od bieżącego lub przyszłego okresu.",
      );
      const linked = state.recurring.find((t) =>
        t.versions.some(
          (v) => v.kind === "debt" && v.debtId === debt.id && !v.stopped,
        ),
      );
      const templateId = debt.templateId || linked?.id || `debt_${debt.id}`;
      requireThat(
        !state.settlements.some(
          (s) => s.row.id === `${templateId}_${schedule.start}`,
        ),
        "Ta rata jest już rozliczona. Wybierz kolejny okres.",
      );
      debt.templateId = templateId;
      const template = state.recurring.find((t) => t.id === templateId) || {
        id: templateId,
        versions: [],
      };
      template.versions = template.versions.filter(
        (v) => v.from < schedule.start,
      );
      template.versions.push({
        from: schedule.start,
        name: `Rata: ${debt.name}`,
        amount: schedule.amount,
        category: "raty",
        source: "personal",
        kind: "debt",
        debtId: debt.id,
        dueDay: schedule.day,
        note: "",
        household: false,
        stopped: false,
      });
      upsert(state.recurring, template);
      state.expenses = state.expenses.filter(
        (r) => !(r.templateId === templateId && r.period >= schedule.start),
      );
    }
    upsert(state.obligations, debt);
    label = "Zapisano zobowiązanie";
  } else if (action.type === "overpayDebt") {
    const debt = state.obligations.find((d) => d.id === action.debtId);
    requireThat(debt, "Wybierz istniejące zobowiązanie.");
    requireThat(action.date <= day, "Nadpłata nie może mieć przyszłej daty.");
    requireThat(
      action.amount <= balances(state)[`debt:${debt.id}`],
      "Nadpłata przekracza kwotę do spłaty.",
    );
    if (action.fromBudget) {
      const row = {
        id: `overpay_${operationId}`,
        period: currentPeriod(action.date),
        name: `Nadpłata: ${debt.name}`,
        amount: action.amount,
        category: "raty",
        source: "personal",
        kind: "debt",
        debtId: debt.id,
        note: action.note,
        household: false,
      };
      state.expenses.push(row);
      state.settlements.push({ id: operationId, row, date: action.date });
    } else
      state.transactions.push({
        id: operationId,
        date: action.date,
        account: `debt:${debt.id}`,
        amount: -action.amount,
        note: action.note || `Nadpłata: ${debt.name}`,
        kind: "withdrawal",
      });
    label = "Zapisano nadpłatę";
  } else if (
    action.type === "transaction" ||
    action.type === "correctBalance"
  ) {
    checkAccount(action.account);
    requireThat(action.date <= day, "Ruch konta nie może mieć przyszłej daty.");
    let amount;
    if (action.type === "correctBalance")
      amount = action.balance - balances(state)[action.account];
    else {
      requireThat(
        !action.account.startsWith("debt:"),
        "Saldo długu popraw przez korektę albo zapisz spłatę w budżecie.",
      );
      requireThat(
        action.kind !== "correction",
        "Do korekty użyj aktualnego salda.",
      );
      requireThat(
        !(action.account === "bonds" && action.kind === "deposit") ||
          action.amount % 10000 === 0,
        "Wpłata na obligacje musi być wielokrotnością 100 zł.",
      );
      amount = action.kind === "withdrawal" ? -action.amount : action.amount;
    }
    state.transactions.push({
      id: operationId,
      date: action.date,
      account: action.account,
      amount,
      note: action.note,
      kind: action.type === "correctBalance" ? "correction" : action.kind,
      ...(action.name ? { name: action.name } : {}),
    });
    label =
      action.type === "correctBalance"
        ? "Skorygowano saldo"
        : "Zapisano ruch konta";
  } else if (action.type === "reverseTransaction") {
    const t = state.transactions.find((t) => t.id === action.transactionId);
    requireThat(
      t && !t.reversedBy && !t.reverses,
      "Tego ruchu nie można ponownie cofnąć.",
    );
    state.transactions.push({
      id: operationId,
      date: day,
      account: t.account,
      amount: -t.amount,
      note: `Cofnięcie: ${t.note}`,
      ...(t.name ? { name: `Cofnięcie: ${t.name}`.slice(0, 120) } : {}),
      kind: "reversal",
      reverses: t.id,
    });
    t.reversedBy = operationId;
    label = "Cofnięto ruch konta";
  } else if (action.type === "savePatryk") {
    upsert(state.patryk, action.record, "period");
    label = "Zapisano podsumowanie Patryka";
  } else if (action.type === "settings") {
    state.settings.reserveTarget = action.reserveTarget;
    label = "Zmieniono cel rezerwy";
  } else if (action.type === "allocate") {
    const proposal = savingsProposal(state, action.period);
    requireThat(
      proposal.reserve + proposal.bonds + proposal.remainder > 0,
      "Nie ma nadwyżki do zaplanowania.",
    );
    const addRow = (suffix, amount, kind, name, category) => {
      if (amount > 0)
        state.expenses.push({
          id: `${operationId}_${suffix}`,
          period: action.period,
          name,
          amount,
          category,
          source: "personal",
          kind,
          note: "Podział nadwyżki",
        });
    };
    addRow(
      "reserve",
      proposal.reserve +
        (action.remainder === "savings" ? proposal.remainder : 0),
      "savings",
      "Konto oszczędnościowe",
      "oszczednosci",
    );
    addRow("bonds", proposal.bonds, "bonds", "Obligacje", "oszczednosci");
    if (action.remainder === "budget")
      addRow(
        "remainder",
        proposal.remainder,
        "expense",
        "Nieplanowane — końcówka",
        "nieplanowane",
      );
    label = "Zaplanowano podział nadwyżki";
  } else if (action.type === "restore") {
    state = structuredClone(validateBackup(action.backup));
    label = "Przywrócono pełną kopię danych";
  }
  requireThat(
    patrykSavingsBalance(state) >= 0 &&
      Number.isSafeInteger(patrykSavingsBalance(state)),
    "Wypłata przekracza zapisane oszczędności Patryka. Popraw saldo lub kwotę.",
  );
  for (const [key, balance] of Object.entries(balances(state)))
    requireThat(
      balance >= 0 && Number.isSafeInteger(balance),
      key.startsWith("debt:")
        ? "Spłata przekracza pozostały dług. Popraw kwotę lub saldo zobowiązania."
        : "Operacja dałaby ujemne saldo konta. Sprawdź saldo początkowe i wykonane ruchy.",
    );
  const previous =
    action.type === "saveIncome" || action.type === "deleteIncome"
      ? inputState.incomes.find(
          (i) =>
            i.id ===
            (action.type === "saveIncome" ? action.income.id : action.incomeId),
        )
      : action.type === "settle" || action.type === "deleteExpense"
        ? rowsForPeriod(inputState, action.period).find(
            (r) => r.id === action.rowId,
          )
        : undefined;
  const details =
    action.type === "restore"
      ? { restoredBackupAt: action.backup.exportedAt }
      : {
          action,
          ...(previous ? { previous } : {}),
          ...(action.type === "saveExpense" && action.fundingRowId
            ? {
                fundingBefore: rowsForPeriod(
                  inputState,
                  action.row.period,
                ).find((r) => r.id === action.fundingRowId),
              }
            : {}),
        };
  // Classification must never retain dead references after a budget item is deleted.
  state.goalGroups = (state.goalGroups || []).map((group) => ({
    ...group,
    members: group.members.filter((m) =>
      m.type === "template"
        ? state.recurring.some((t) => t.id === m.ref)
        : state.expenses.some((r) => r.id === m.ref) ||
          state.settlements.some((s) => s.row.id === m.ref),
    ),
  }));
  state.audit.push({
    id: operationId,
    at: now.toISOString(),
    label,
    details: JSON.stringify(details),
  });
  return stateSchema.parse(state);
}
