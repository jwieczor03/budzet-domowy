import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  emptyState,
  rowsForPeriod,
  householdForPeriod,
  balances,
  exportBackup,
  validateBackup,
} from "../server/domain.mjs";
import { householdTotals, sharedPeriodStats } from "../src/household.ts";
const now = new Date("2026-11-08T12:00:00Z");
const apply = (s, a) => applyAction(s, a, crypto.randomUUID(), now);
const v = (extra = {}) => ({
  from: "2026-10",
  name: "Mieszkanie",
  own: 130000,
  partner: 100000,
  category: "dom",
  note: "Moja notatka",
  everyMonths: 1,
  anchor: "2026-10",
  estimated: true,
  stopped: false,
  ...extra,
});
const create = (extra = {}) =>
  apply(emptyState(), {
    type: "saveHouseholdCost",
    id: "rent",
    version: v(extra),
  });
test("wspólny koszt tworzy własną stałą pozycję i poprawny podział procentowy", () => {
  const state = create();
  assert.equal(rowsForPeriod(state, "2026-10")[0].amount, 130000);
  assert.equal(rowsForPeriod(state, "2026-11")[0].amount, 130000);
  assert.equal(householdForPeriod(state, "2026-10")[0].total, 230000);
  const total = householdTotals(state, "2026-10");
  assert.equal(total.own, 130000);
  assert.equal(total.partner, 100000);
  assert.ok(Math.abs(total.ownPercent + total.partnerPercent - 100) < 0.001);
  assert.equal(balances(state).shared, 0);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});
test("koszt co dwa miesiące trafia tylko do właściwych okresów także przez zmianę roku", () => {
  const state = create({
    from: "2026-11",
    anchor: "2026-11",
    everyMonths: 2,
    name: "Prąd",
    own: 20000,
    partner: 20000,
    dueDay: 5,
  });
  assert.equal(rowsForPeriod(state, "2026-11")[0].dueDate, "2026-12-05");
  assert.equal(rowsForPeriod(state, "2026-12").length, 0);
  assert.equal(householdTotals(state, "2026-12").total, 0);
  assert.equal(rowsForPeriod(state, "2027-01")[0].amount, 20000);
});
test("korekta jednego rachunku nie zmienia cyklu i kolejnych szacunków", () => {
  let state = create({ everyMonths: 2, own: 20000, partner: 20000 });
  state = apply(state, {
    type: "saveHouseholdCost",
    id: "rent",
    scope: "one",
    version: v({
      from: "2026-12",
      everyMonths: 2,
      own: 24000,
      partner: 24000,
      estimated: false,
    }),
  });
  assert.equal(householdTotals(state, "2026-10").total, 40000);
  assert.equal(householdTotals(state, "2026-12").total, 48000);
  assert.equal(rowsForPeriod(state, "2026-12")[0].amount, 24000);
  assert.equal(rowsForPeriod(state, "2027-01").length, 0);
  assert.equal(rowsForPeriod(state, "2027-02")[0].amount, 20000);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});
test("podłączenie istniejącej pozycji nie dubluje jej, zakończenie zachowuje historię", () => {
  let state = apply(emptyState(), {
    type: "saveExpense",
    row: {
      id: "old-rent",
      period: "2026-09",
      name: "Mieszkanie",
      amount: 130000,
      category: "dom",
      source: "personal",
      kind: "expense",
      note: "",
      household: true,
    },
    recurring: true,
    scope: "future",
  });
  state = apply(state, {
    type: "saveHouseholdCost",
    id: "rent",
    templateId: "old-rent",
    version: v(),
  });
  assert.equal(state.recurring.length, 1);
  assert.equal(rowsForPeriod(state, "2026-10").length, 1);
  state = apply(state, {
    type: "stopHouseholdCost",
    costId: "rent",
    period: "2026-12",
  });
  assert.equal(householdTotals(state, "2026-10").total, 230000);
  assert.equal(rowsForPeriod(state, "2026-12").length, 0);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});
test("zerowa własna część nie tworzy pozornej raty i nie blokuje kosztu Patryka", () => {
  const state = create({ own: 0, partner: 10000 });
  assert.equal(rowsForPeriod(state, "2026-10").length, 0);
  assert.equal(householdTotals(state, "2026-10").total, 10000);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});
test("zapłacona własna część jest chroniona, a szablon edytowany razem z podziałem", () => {
  let state = create();
  const row = rowsForPeriod(state, "2026-10")[0];
  assert.throws(() =>
    apply(state, {
      type: "saveExpense",
      row: { ...row, amount: 140000 },
      recurring: true,
      scope: "future",
    }),
  );
  state = apply(state, {
    type: "settle",
    rowId: row.id,
    period: "2026-10",
    settled: true,
  });
  assert.throws(() =>
    apply(state, {
      type: "saveHouseholdCost",
      id: "rent",
      version: v({ own: 140000 }),
    }),
  );
  state = apply(state, {
    type: "saveHouseholdCost",
    id: "rent",
    version: v({ from: "2026-11", own: 140000, partner: 90000 }),
  });
  assert.equal(rowsForPeriod(state, "2026-10")[0].amount, 130000);
  assert.equal(rowsForPeriod(state, "2026-11")[0].amount, 140000);
});
test("historia i statystyki wspólnego konta oddzielają korekty i cofnięte zapisy", () => {
  let state = apply(emptyState(), {
    type: "transaction",
    account: "shared",
    kind: "deposit",
    amount: 50000,
    date: "2026-11-08",
    name: "Wpłata Patryka",
    note: "Opis wpływu",
  });
  state = apply(state, {
    type: "transaction",
    account: "shared",
    kind: "withdrawal",
    amount: 10000,
    date: "2026-11-08",
    name: "Naprawa",
    note: "Opis wydatku",
  });
  assert.equal(balances(state).shared, 40000);
  assert.equal(sharedPeriodStats(state, "2026-10").income, 50000);
  assert.equal(sharedPeriodStats(state, "2026-10").expenses, 10000);
  state = apply(state, {
    type: "reverseTransaction",
    transactionId: state.transactions[1].id,
  });
  assert.equal(sharedPeriodStats(state, "2026-10").expenses, 0);
  state = apply(state, {
    type: "correctBalance",
    account: "shared",
    balance: 55000,
    date: "2026-11-08",
    note: "Odsetki / korekta",
  });
  assert.equal(sharedPeriodStats(state, "2026-10").corrections, 5000);
  assert.equal(sharedPeriodStats(state, "2026-10").net, 55000);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});
test("starsza kopia pozostaje zgodna, uszkodzony podział jest odrzucany", () => {
  const old = exportBackup(emptyState());
  delete old.state.householdCosts;
  assert.deepEqual(validateBackup(old).householdCosts, []);
  const backup = exportBackup(create());
  backup.state.householdCosts[0].versions[0].own = 999;
  assert.throws(() => validateBackup(backup));
});
test("wyjątek własnej części nie może przełączyć jej na wspólne konto", () => {
  const state = create();
  const row = rowsForPeriod(state, "2026-10")[0];
  assert.throws(() =>
    apply(state, {
      type: "saveExpense",
      row: { ...row, source: "shared" },
      recurring: true,
      scope: "one",
    }),
  );
  const backup = exportBackup(state);
  backup.state.expenses.push({ ...row, source: "shared" });
  assert.throws(() => validateBackup(backup));
});
test("jednorazowa korekta poza cyklem jest odrzucana z komunikatem", () => {
  const state = create({ everyMonths: 2, own: 20000, partner: 20000 });
  assert.throws(
    () =>
      apply(state, {
        type: "saveHouseholdCost",
        id: "rent",
        scope: "one",
        version: v({
          from: "2026-11",
          everyMonths: 2,
          own: 24000,
          partner: 24000,
        }),
      }),
    /nie przypada rachunek/,
  );
});
