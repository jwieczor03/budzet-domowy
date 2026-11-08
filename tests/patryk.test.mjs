import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  emptyState,
  patrykOwnRows,
  patrykSavingsBalance,
  balances,
  exportBackup,
  validateBackup,
} from "../server/domain.mjs";
import {
  patrykPeriod,
  patrykComparison,
  patrykStatistics,
  patrykSavingsNet,
} from "../src/patryk.ts";
const now = new Date("2026-11-08T12:00:00Z");
const apply = (s, a) => applyAction(s, a, crypto.randomUUID(), now);
const add = (s, period, name, amount, recurring = true, extra = {}) =>
  apply(s, {
    type: "savePatrykExpense",
    row: { id: name, period, name, amount, ...extra },
    recurring,
  });
const income = (s, period, value) =>
  apply(s, { type: "savePatrykIncome", period, income: value, note: "" });
const home = () =>
  apply(emptyState(), {
    type: "saveHouseholdCost",
    id: "rent",
    version: {
      from: "2026-09",
      anchor: "2026-09",
      name: "Mieszkanie",
      own: 130000,
      partner: 100000,
      category: "dom",
      note: "Podział",
      everyMonths: 1,
      estimated: false,
      stopped: false,
    },
  });
test("wydatki Patryka łączą części z Domu i własne pozycje bez zmiany własnych sald", () => {
  let state = home();
  const before = balances(state);
  state = income(state, "2026-09", 400000);
  state = add(state, "2026-09", "Telefon", 5000);
  assert.equal(patrykPeriod(state, "2026-09").total, 105000);
  assert.equal(patrykPeriod(state, "2026-10").total, 105000);
  assert.equal(patrykPeriod(state, "2026-10").income, null);
  assert.deepEqual(balances(state), before);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});
test("zmiana powtarzanej kwoty pokazuje poprzednią, a jednorazowa pozycja nie przechodzi dalej", () => {
  let state = add(emptyState(), "2026-09", "Telefon", 5000);
  const row = patrykOwnRows(state, "2026-10")[0];
  state = apply(state, {
    type: "savePatrykExpense",
    row: { ...row, amount: 6500 },
    recurring: true,
  });
  state = add(state, "2026-10", "Zakup", 10000, false);
  assert.equal(patrykOwnRows(state, "2026-09")[0].amount, 5000);
  const actual = patrykPeriod(state, "2026-10").rows.find((r) => r.recurring);
  assert.equal(
    patrykComparison(
      state,
      "2026-10",
      actual.id,
      actual.source,
      actual.row.templateId,
    ).amount,
    5000,
  );
  assert.equal(patrykOwnRows(state, "2026-11").length, 1);
  state = apply(state, {
    type: "deletePatrykExpense",
    rowId: row.id,
    period: "2026-10",
  });
  assert.equal(patrykOwnRows(state, "2026-09")[0].amount, 5000);
  assert.equal(patrykOwnRows(state, "2026-11").length, 0);
});
test("średnie wypłaty i wydatki pomijają brak wypłaty i przyszłe okresy", () => {
  let state = home();
  state = income(state, "2026-09", 400000);
  state = income(state, "2026-10", 600000);
  state = income(state, "2026-11", 999999);
  state = add(state, "2026-09", "Telefon", 5000);
  const stats = patrykStatistics(state);
  assert.equal(stats.salaryPeriods.length, 2);
  assert.equal(stats.averageIncome, 500000);
  assert.equal(stats.averageExpenses, 105000);
  assert.equal(stats.averageSavings, null);
});
test("późny wpis oszczędności przypisuje się do właściwego miesiąca, korekta nie jest wpłatą", () => {
  let state = apply(emptyState(), {
    type: "patrykCorrectSavings",
    period: "2026-09",
    date: "2026-11-08",
    balance: 100000,
    note: "Saldo początkowe",
  });
  state = apply(state, {
    type: "patrykMovement",
    period: "2026-09",
    date: "2026-11-08",
    kind: "deposit",
    amount: 20000,
    note: "Wrzesień uzupełniony w listopadzie",
  });
  state = apply(state, {
    type: "patrykMovement",
    period: "2026-09",
    date: "2026-11-08",
    kind: "withdrawal",
    amount: 5000,
    note: "",
  });
  assert.equal(patrykSavingsBalance(state), 115000);
  assert.equal(patrykSavingsNet(state, "2026-09"), 15000);
  assert.equal(patrykStatistics(state).averageSavings, null);
  state = apply(state, {
    type: "completePatrykSavings",
    period: "2026-09",
    complete: true,
  });
  assert.equal(patrykStatistics(state).averageSavings, 15000);
  state = apply(state, {
    type: "completePatrykSavings",
    period: "2026-10",
    complete: true,
  });
  assert.equal(patrykStatistics(state).averageSavings, 7500);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});
test("nowy ruch i cofnięcie wymagają ponownego potwierdzenia miesiąca; nie można wypłacić ponad saldo", () => {
  let state = apply(emptyState(), {
    type: "patrykMovement",
    period: "2026-10",
    date: "2026-11-08",
    kind: "deposit",
    amount: 10000,
    note: "",
  });
  state = apply(state, {
    type: "completePatrykSavings",
    period: "2026-10",
    complete: true,
  });
  const id = state.patrykMovements[0].id;
  state = apply(state, { type: "reversePatrykMovement", movementId: id });
  assert.equal(patrykSavingsBalance(state), 0);
  assert.equal(patrykSavingsNet(state, "2026-10"), 0);
  assert.equal(patrykStatistics(state).averageSavings, null);
  assert.throws(() =>
    apply(state, { type: "reversePatrykMovement", movementId: id }),
  );
  assert.throws(() =>
    apply(state, {
      type: "patrykMovement",
      period: "2026-10",
      date: "2026-11-08",
      kind: "withdrawal",
      amount: 100,
      note: "",
    }),
  );
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});
test("dawne podsumowanie i saldo są zachowane bez podwójnego doliczania Domu", () => {
  let state = home();
  state = apply(state, {
    type: "savePatryk",
    record: {
      period: "2026-09",
      income: 400000,
      expenses: 200000,
      savings: 300000,
      note: "Dawny zapis",
    },
  });
  assert.equal(patrykPeriod(state, "2026-09").total, 200000);
  assert.equal(patrykSavingsBalance(state), 300000);
  state = apply(state, { type: "enablePatrykDetails", period: "2026-09" });
  assert.equal(patrykPeriod(state, "2026-09").total, 100000);
  assert.equal(state.patryk[0].expenses, 200000);
  state = apply(state, {
    type: "patrykMovement",
    period: "2026-10",
    date: "2026-11-08",
    kind: "deposit",
    amount: 10000,
    note: "",
  });
  assert.equal(patrykSavingsBalance(state), 310000);
  assert.equal(state.patrykSavingsOpening, 300000);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});
test("import odrzuca uszkodzone cofnięcia i nieistniejące szablony Patryka", () => {
  let state = apply(emptyState(), {
    type: "patrykMovement",
    period: "2026-10",
    date: "2026-11-08",
    kind: "deposit",
    amount: 10000,
    note: "",
  });
  state = apply(state, {
    type: "reversePatrykMovement",
    movementId: state.patrykMovements[0].id,
  });
  const backup = exportBackup(state);
  backup.state.patrykMovements[1].amount = 1;
  assert.throws(() => validateBackup(backup));
  const invalid = exportBackup(emptyState());
  invalid.state.patrykExpenses.push({
    id: "missing_2026-10",
    templateId: "missing",
    period: "2026-10",
    name: "Brak",
    amount: 100,
  });
  assert.throws(() => validateBackup(invalid));
});
test("powtarzana nowa pozycja nie zastępuje starego agregatu kolejnego miesiąca bez zgody", () => {
  let state = apply(emptyState(), {
    type: "savePatryk",
    record: {
      period: "2026-10",
      income: 400000,
      expenses: 200000,
      savings: 100000,
      note: "",
    },
  });
  state = add(state, "2026-09", "Telefon", 5000);
  assert.equal(patrykPeriod(state, "2026-10").total, 200000);
  assert.equal(patrykStatistics(state).averageExpenses, 200000);
  state = apply(state, { type: "enablePatrykDetails", period: "2026-10" });
  assert.equal(patrykPeriod(state, "2026-10").total, 5000);
});
test("historyczna wpłata ujęta w starym saldzie nie zwiększa go drugi raz", () => {
  let state = apply(emptyState(), {
    type: "savePatryk",
    record: {
      period: "2026-10",
      income: 400000,
      expenses: 200000,
      savings: 100000,
      note: "",
    },
  });
  state = apply(state, {
    type: "patrykMovement",
    period: "2026-09",
    date: "2026-11-08",
    kind: "deposit",
    amount: 20000,
    note: "Wcześniejsza wpłata",
  });
  assert.equal(patrykSavingsBalance(state), 100000);
  assert.equal(patrykSavingsNet(state, "2026-09"), 20000);
  assert.equal(state.patrykMovements[0].alreadyIncluded, true);
  state = apply(state, {
    type: "reversePatrykMovement",
    movementId: state.patrykMovements[0].id,
  });
  assert.equal(patrykSavingsBalance(state), 100000);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});
test("jawnie historyczny ruch nie zmienia bieżącego salda, a nowa wpłata zmienia", () => {
  let state = apply(emptyState(), {
    type: "patrykCorrectSavings",
    period: "2026-10",
    date: "2026-11-08",
    balance: 100000,
    note: "",
  });
  state = apply(state, {
    type: "patrykMovement",
    period: "2026-09",
    date: "2026-11-08",
    kind: "deposit",
    amount: 20000,
    note: "Zawarta w saldzie",
    alreadyIncluded: true,
  });
  assert.equal(patrykSavingsBalance(state), 100000);
  state = apply(state, {
    type: "patrykMovement",
    period: "2026-10",
    date: "2026-11-08",
    kind: "deposit",
    amount: 50000,
    note: "Nowa wpłata",
    alreadyIncluded: false,
  });
  assert.equal(patrykSavingsBalance(state), 150000);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});
