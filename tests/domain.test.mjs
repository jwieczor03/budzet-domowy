import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  balances,
  currentPeriod,
  emptyState,
  exportBackup,
  overdueRows,
  parseMoney,
  periodBounds,
  rowsForPeriod,
  savingsProposal,
  shiftPeriod,
  summary,
  validateBackup,
} from "../server/domain.mjs";

const now = new Date("2026-11-10T12:00:00Z");
const period = "2026-11";
const row = (id, amount, extra = {}) => ({
  id,
  period,
  name: id,
  amount,
  category: "osobiste",
  source: "personal",
  kind: "expense",
  note: "",
  household: false,
  ...extra,
});
const apply = (state, action) =>
  applyAction(state, action, crypto.randomUUID(), now);
const expense = (state, r, recurring = false, scope = "future") =>
  apply(state, { type: "saveExpense", row: r, recurring, scope });
const income = (state, amount, splits, extra = {}) =>
  apply(state, {
    type: "saveIncome",
    income: {
      id: "salary",
      period,
      name: "Wpływ",
      amount,
      date: "2026-11-10",
      received: true,
      note: "",
      splits: splits || [{ destination: "budget", amount }],
      ...extra,
    },
  });
const settle = (state, id, settled = true, p = period) =>
  apply(state, { type: "settle", period: p, rowId: id, settled });

test("okres 10–9, lata przestępne i zmiana roku", () => {
  assert.equal(currentPeriod("2026-11-09"), "2026-10");
  assert.equal(currentPeriod("2026-11-10"), "2026-11");
  assert.deepEqual(periodBounds("2026-12"), {
    start: "2026-12-10",
    end: "2027-01-09",
  });
  assert.equal(shiftPeriod("2026-01", -1), "2025-12");
});
test("kwoty w groszach, polski format i odrzucenie niejednoznacznej precyzji", () => {
  assert.equal(parseMoney("1 234,56"), 123456);
  assert.equal(parseMoney("0,10"), 10);
  assert.throws(() => parseMoney("1.234"));
  assert.throws(() => parseMoney("Infinity"));
});
test("stała pozycja jest wersjonowana; jednorazowa nie przechodzi dalej", () => {
  let s = expense(emptyState(), row("fixed", 5000), true);
  s = expense(s, row("single", 700));
  assert.equal(rowsForPeriod(s, "2026-12").length, 1);
  assert.equal(rowsForPeriod(s, "2026-10").length, 0);
  const future = rowsForPeriod(s, "2026-12")[0];
  s = expense(s, { ...future, amount: 6000 }, true);
  assert.equal(
    rowsForPeriod(s, period).find((r) => r.templateId)?.amount,
    5000,
  );
  assert.equal(rowsForPeriod(s, "2027-01")[0].amount, 6000);
});
test("jednomiesięczna zmiana stałego wydatku nie zmienia szablonu", () => {
  let s = expense(emptyState(), row("fixed", 5000), true);
  s = expense(s, { ...rowsForPeriod(s, period)[0], amount: 4000 }, true, "one");
  assert.equal(rowsForPeriod(s, period)[0].amount, 4000);
  assert.equal(rowsForPeriod(s, "2026-12")[0].amount, 5000);
});
test("zmiana stałej pozycji od danego okresu zastępuje też istniejące wyjątki", () => {
  let s = expense(emptyState(), row("fixed", 5000), true);
  s = expense(s, { ...rowsForPeriod(s, period)[0], amount: 4000 }, true, "one");
  s = expense(
    s,
    { ...rowsForPeriod(s, "2026-12")[0], amount: 4500 },
    true,
    "one",
  );
  s = expense(
    s,
    { ...rowsForPeriod(s, period)[0], amount: 6000 },
    true,
    "future",
  );
  assert.equal(rowsForPeriod(s, period)[0].amount, 6000);
  assert.equal(rowsForPeriod(s, "2026-12")[0].amount, 6000);
});
test("rata 0% pomniejsza dług dokładnie raz; cofnięcie przywraca saldo", () => {
  let s = apply(emptyState(), {
    type: "saveDebt",
    debt: { id: "tv", name: "Telewizor", initial: 50000 },
  });
  s = expense(s, row("instalment", 10000, { kind: "debt", debtId: "tv" }));
  s = settle(s, "instalment");
  s = settle(s, "instalment");
  assert.equal(balances(s)["debt:tv"], 40000);
  assert.equal(s.settlements.length, 1);
  assert.throws(() =>
    expense(s, row("instalment", 20000, { kind: "debt", debtId: "tv" })),
  );
  s = settle(s, "instalment", false);
  assert.equal(balances(s)["debt:tv"], 50000);
  s = apply(s, {
    type: "correctBalance",
    account: "debt:tv",
    balance: 30000,
    date: "2026-11-10",
    note: "Nadpłata poza planem",
  });
  assert.equal(balances(s)["debt:tv"], 30000);
  assert.equal(summary(s, period).planned, 10000);
});
test("rozliczony snapshot nie zmienia się wraz ze stałą pozycją", () => {
  let s = expense(emptyState(), row("fixed", 5000), true);
  const r = rowsForPeriod(s, period)[0];
  s = settle(s, r.id);
  s = expense(s, { ...rowsForPeriod(s, "2026-12")[0], amount: 6000 }, true);
  assert.equal(rowsForPeriod(s, period)[0].amount, 5000);
});
test("planowane oszczędności nie zmieniają salda; wykonane zmieniają je raz", () => {
  let s = expense(emptyState(), row("save", 15000, { kind: "savings" }));
  assert.equal(balances(s).savings, 0);
  s = settle(s, "save");
  assert.equal(balances(s).savings, 15000);
  s = settle(s, "save", false);
  assert.equal(balances(s).savings, 0);
});
test("wpłata na wspólne konto i zakup z niego nie liczą się dwa razy", () => {
  let s = income(emptyState(), 100000);
  s = expense(
    s,
    row("shared-deposit", 40000, { kind: "sharedDeposit", household: true }),
  );
  s = settle(s, "shared-deposit");
  s = expense(
    s,
    row("shared-purchase", 15000, { source: "shared", household: true }),
  );
  s = settle(s, "shared-purchase");
  assert.equal(balances(s).shared, 25000);
  assert.equal(summary(s, period).planned, 40000);
  assert.equal(summary(s, period).done, 40000);
});
test("nadwyżka 850 przy rezerwie 9700 daje podział 300/500/50", () => {
  let s = emptyState();
  s.openings.savings = 970000;
  s = income(s, 85000);
  assert.deepEqual(savingsProposal(s, period), {
    reserve: 30000,
    bonds: 50000,
    remainder: 5000,
  });
  s = apply(s, { type: "allocate", period, remainder: "budget" });
  assert.equal(balances(s).savings, 970000);
  assert.equal(summary(s, period).remaining, 0);
  assert.throws(() =>
    apply(s, { type: "allocate", period, remainder: "budget" }),
  );
  for (const r of rowsForPeriod(s, period)) s = settle(s, r.id);
  assert.equal(balances(s).savings, 1000000);
  assert.equal(balances(s).bonds, 50000);
});
test("podzielony wpływ zasila wyłącznie wybrane miejsca", () => {
  let s = apply(emptyState(), {
    type: "saveDebt",
    debt: { id: "tv", name: "TV", initial: 100000 },
  });
  s = income(s, 100000, [
    { destination: "budget", amount: 20000 },
    { destination: "bonds", amount: 50000 },
    { destination: "debt", debtId: "tv", amount: 30000 },
  ]);
  assert.equal(summary(s, period).income, 20000);
  assert.equal(balances(s).bonds, 50000);
  assert.equal(balances(s)["debt:tv"], 70000);
  assert.throws(() =>
    income(s, 100000, [{ destination: "budget", amount: 50000 }]),
  );
});
test("przyszłe wpływy i plan nie zmieniają sald, nie można rozliczyć przyszłego okresu", () => {
  let s = income(
    emptyState(),
    100000,
    [{ destination: "savings", amount: 100000 }],
    { received: false, date: "2026-11-20" },
  );
  assert.equal(balances(s).savings, 0);
  assert.throws(() =>
    income(s, 100000, undefined, { received: true, date: "2026-11-20" }),
  );
  s = expense(s, row("future", 5000, { period: "2026-12" }));
  assert.throws(() => settle(s, "future", true, "2026-12"));
});
test("zaległa pozycja pozostaje w swoim okresie bez duplikatu", () => {
  const s = expense(
    emptyState(),
    row("late", 12000, { period: "2026-10", dueDate: "2026-10-15" }),
  );
  const late = overdueRows(s, "2026-11-10");
  assert.equal(late.length, 1);
  assert.equal(late[0].period, "2026-10");
  assert.equal(rowsForPeriod(s, period).length, 0);
});
test("wypłata z rezerwy zasila plan, a cofnięcie odwraca oba skutki", () => {
  let s = emptyState();
  s.openings.savings = 100000;
  s = apply(s, {
    type: "transaction",
    account: "savings",
    amount: 20000,
    kind: "withdrawal",
    date: "2026-11-10",
    note: "Naprawa",
  });
  assert.equal(balances(s).savings, 80000);
  assert.equal(summary(s, period).remaining, 20000);
  const id = s.transactions[0].id;
  s = apply(s, { type: "reverseTransaction", transactionId: id });
  assert.equal(balances(s).savings, 100000);
  assert.equal(summary(s, period).remaining, 0);
  assert.throws(() =>
    apply(s, { type: "reverseTransaction", transactionId: id }),
  );
});
test("niedobór planu nie wypłaca automatycznie oszczędności", () => {
  let s = emptyState();
  s.openings.savings = 1000000;
  s = expense(s, row("exp", 30000));
  assert.equal(summary(s, period).remaining, -30000);
  assert.equal(balances(s).savings, 1000000);
});
test("nowy zakup z rozdysponowanej puli dzieli ją bez drugiego obciążenia", () => {
  let s = income(emptyState(), 100000);
  s = expense(s, row("pool", 50000, { category: "nieplanowane" }), true);
  const source = rowsForPeriod(s, period)[0];
  s = settle(s, source.id);
  s = apply(s, {
    type: "saveExpense",
    row: row("purchase", 15000),
    recurring: false,
    scope: "one",
    fundingRowId: source.id,
  });
  assert.equal(
    rowsForPeriod(s, period).find((r) => r.id === source.id).amount,
    35000,
  );
  assert.equal(summary(s, period).planned, 50000);
  assert.equal(summary(s, period).done, 50000);
  assert.equal(rowsForPeriod(s, "2026-12")[0].amount, 50000);
  assert.ok(s.settlements.some((s) => s.row.id === "purchase"));
});
test("można wykorzystać całą pulę, bez zaległości na zerową kwotę", () => {
  let s = expense(emptyState(), row("pool", 10000));
  s = apply(s, {
    type: "saveExpense",
    row: row("purchase", 10000),
    recurring: false,
    scope: "one",
    fundingRowId: "pool",
  });
  assert.equal(rowsForPeriod(s, period).find((r) => r.id === "pool").amount, 0);
  assert.equal(summary(s, period).planned, 10000);
  const late = overdueRows(s, "2026-12-10");
  assert.equal(
    late.some((r) => r.id === "pool"),
    false,
  );
  assert.deepEqual(validateBackup(exportBackup(s)), s);
});
test("wydatek z oszczędności zmienia saldo dopiero przy rozdysponowaniu", () => {
  let s = emptyState();
  s.openings.savings = 1000000;
  s = expense(s, row("repair", 20000, { fundingAccount: "savings" }));
  assert.equal(balances(s).savings, 1000000);
  assert.equal(summary(s, period).remaining, 0);
  s = settle(s, "repair");
  assert.equal(balances(s).savings, 980000);
  assert.equal(summary(s, period).available, 0);
  s = settle(s, "repair", false);
  assert.equal(balances(s).savings, 1000000);
});
test("przeplanowanie nie może użyć raty jako puli ani przekroczyć puli", () => {
  let s = expense(emptyState(), row("pool", 10000));
  assert.throws(() =>
    apply(s, {
      type: "saveExpense",
      row: row("too-much", 20000),
      recurring: false,
      scope: "one",
      fundingRowId: "pool",
    }),
  );
});
test("cofnięcie wypłaty w kolejnym okresie odbiera finansowanie pierwotnemu okresowi", () => {
  let s = emptyState();
  s.openings.savings = 100000;
  s = apply(s, {
    type: "transaction",
    account: "savings",
    amount: 20000,
    kind: "withdrawal",
    date: "2026-11-10",
    note: "Naprawa",
  });
  s = applyAction(
    s,
    { type: "reverseTransaction", transactionId: s.transactions[0].id },
    crypto.randomUUID(),
    new Date("2026-12-10T12:00:00Z"),
  );
  assert.equal(summary(s, "2026-11").remaining, 0);
  assert.equal(summary(s, "2026-12").remaining, 0);
  assert.equal(balances(s).savings, 100000);
});
test("historia zachowuje stan wykonanego wpływu i cofniętej płatności", () => {
  let s = income(emptyState(), 10000);
  s = income(s, 20000);
  assert.equal(JSON.parse(s.audit.at(-1).details).previous.amount, 10000);
  s = expense(s, row("paid", 1000));
  s = settle(s, "paid");
  s = settle(s, "paid", false);
  assert.equal(JSON.parse(s.audit.at(-1).details).previous.amount, 1000);
});
test("pełna kopia odtwarza historię i salda bez ponownych wpłat", () => {
  let s = expense(emptyState(), row("save", 10000, { kind: "bonds" }));
  s = settle(s, "save");
  const backup = JSON.parse(JSON.stringify(exportBackup(s, now)));
  const restored = validateBackup(backup);
  assert.deepEqual(balances(restored), balances(s));
  assert.deepEqual(restored, s);
  const imported = apply(emptyState(), { type: "restore", backup });
  assert.equal(balances(imported).bonds, 10000);
  const invalid = structuredClone(backup);
  invalid.state.settlements.push(invalid.state.settlements[0]);
  assert.throws(() => validateBackup(invalid));
});
test("walidacja zobowiązań, kwot, dat i wypłat chroni integralność", () => {
  assert.throws(() =>
    expense(emptyState(), row("bad", 12000, { kind: "bonds" })),
  );
  assert.throws(() => expense(emptyState(), row("bad", -1)));
  assert.throws(() =>
    expense(
      emptyState(),
      row("bad", 10000, { kind: "debt", debtId: "missing" }),
    ),
  );
  assert.throws(() =>
    expense(emptyState(), row("bad", 10000, { dueDate: "2026-11-31" })),
  );
  let s = expense(
    emptyState(),
    row("empty-account", 10000, { source: "shared" }),
  );
  assert.throws(() => settle(s, "empty-account"));
});
test("import odrzuca nieistniejący szablon, powtórzone wyjątki i zepsute cofnięcia", () => {
  const orphan = exportBackup(emptyState());
  orphan.state.expenses.push(row("orphan", 1000, { templateId: "missing" }));
  assert.throws(() => validateBackup(orphan));
  let s = expense(emptyState(), row("fixed", 5000), true);
  s = expense(s, { ...rowsForPeriod(s, period)[0], amount: 4000 }, true, "one");
  const duplicate = exportBackup(s);
  duplicate.state.expenses.push({
    ...duplicate.state.expenses[0],
    id: "duplicate",
  });
  assert.throws(() => validateBackup(duplicate));
  const broken = exportBackup(emptyState());
  broken.state.transactions.push({
    id: "rev",
    account: "savings",
    date: "2026-01-01",
    amount: 1000,
    kind: "reversal",
    reverses: "missing",
    note: "",
  });
  assert.throws(() => validateBackup(broken));
});

test("dzień płatności 31 zachowuje się po krótszym miesiącu", () => {
  const state = apply(emptyState(), {
    type: "saveExpense",
    row: row("subscription", 4999, {
      period: "2027-02",
      category: "subskrypcje",
      dueDate: "2027-02-28",
    }),
    recurring: true,
    scope: "future",
    dueDay: 31,
  });
  assert.equal(rowsForPeriod(state, "2027-02")[0].dueDate, "2027-02-28");
  assert.equal(rowsForPeriod(state, "2027-03")[0].dueDate, "2027-03-31");
  const early = apply(emptyState(), {
    type: "saveExpense",
    row: row("subscription", 4999, { dueDate: "2026-12-05" }),
    recurring: true,
    scope: "future",
    dueDay: 5,
  });
  assert.equal(rowsForPeriod(early, "2026-12")[0].dueDate, "2027-01-05");
});

const scheduledDebt = () =>
  apply(emptyState(), {
    type: "saveDebt",
    debt: {
      id: "car",
      name: "Samochód",
      initial: 25000,
      paymentAccount: "PL konto testowe",
      paymentTitle: "Rata testowa",
    },
    schedule: { amount: 10000, day: 15, start: period },
  });
test("zobowiązanie tworzy raty, dopasowuje ostatnią i kończy harmonogram", () => {
  let state = scheduledDebt();
  assert.equal(rowsForPeriod(state, period)[0].amount, 10000);
  assert.equal(rowsForPeriod(state, "2026-12")[0].dueDate, "2026-12-15");
  assert.equal(rowsForPeriod(state, "2027-01")[0].amount, 5000);
  assert.equal(rowsForPeriod(state, "2027-02").length, 0);
  state = apply(state, {
    type: "settle",
    rowId: rowsForPeriod(state, period)[0].id,
    period,
    settled: true,
  });
  assert.equal(balances(state)["debt:car"], 15000);
  assert.equal(rowsForPeriod(state, "2026-12")[0].amount, 10000);
  assert.equal(rowsForPeriod(state, "2027-01")[0].amount, 5000);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});
test("nadpłata z budżetu jest jednym rozliczonym wydatkiem i skraca plan", () => {
  const state = apply(scheduledDebt(), {
    type: "overpayDebt",
    debtId: "car",
    amount: 20000,
    date: "2026-11-10",
    note: "Premia",
    fromBudget: true,
  });
  assert.equal(balances(state)["debt:car"], 5000);
  assert.equal(summary(state, period).done, 20000);
  assert.equal(
    rowsForPeriod(state, period).find((r) => r.templateId).amount,
    5000,
  );
  assert.equal(rowsForPeriod(state, "2026-12").length, 0);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});
test("nadpłatę poza planem można cofnąć, bez ponownego wydatku", () => {
  let state = apply(scheduledDebt(), {
    type: "overpayDebt",
    debtId: "car",
    amount: 5000,
    date: "2026-11-08",
    note: "Rozliczone osobno",
    fromBudget: false,
  });
  assert.equal(balances(state)["debt:car"], 20000);
  assert.equal(summary(state, period).done, 0);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
  state = apply(state, {
    type: "reverseTransaction",
    transactionId: state.transactions[0].id,
  });
  assert.equal(balances(state)["debt:car"], 25000);
  assert.throws(() =>
    apply(state, {
      type: "overpayDebt",
      debtId: "car",
      amount: 30000,
      date: "2026-11-10",
      note: "",
      fromBudget: true,
    }),
  );
});
test("edycja harmonogramu zachowuje rozliczoną ratę i dane przelewu", () => {
  let state = scheduledDebt();
  state = apply(state, {
    type: "settle",
    rowId: rowsForPeriod(state, period)[0].id,
    period,
    settled: true,
  });
  const debt = { ...state.obligations[0], paymentTitle: "Nowy tytuł" };
  assert.throws(() =>
    apply(state, {
      type: "saveDebt",
      debt,
      schedule: { amount: 5000, day: 5, start: period },
    }),
  );
  state = apply(state, {
    type: "saveDebt",
    debt,
    schedule: { amount: 5000, day: 5, start: "2026-12" },
  });
  assert.equal(state.recurring.length, 1);
  assert.equal(rowsForPeriod(state, period)[0].amount, 10000);
  assert.equal(rowsForPeriod(state, "2026-12")[0].dueDate, "2027-01-05");
  assert.equal(state.obligations[0].paymentTitle, "Nowy tytuł");
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});

test("cofnięta jednorazowa nadpłata zachowuje wpisaną kwotę", () => {
  let state = apply(scheduledDebt(), {
    type: "overpayDebt",
    debtId: "car",
    amount: 20000,
    date: "2026-11-10",
    note: "",
    fromBudget: true,
  });
  const overpay = state.expenses[0];
  state = apply(state, {
    type: "settle",
    rowId: overpay.id,
    period,
    settled: false,
  });
  assert.equal(
    rowsForPeriod(state, period).find((r) => r.id === overpay.id).amount,
    20000,
  );
  assert.equal(
    rowsForPeriod(state, period).find((r) => r.templateId).amount,
    5000,
  );
  state = apply(state, {
    type: "settle",
    rowId: overpay.id,
    period,
    settled: true,
  });
  assert.equal(balances(state)["debt:car"], 5000);
});
test("edycja danych przelewu nie zmienia wersji rat", () => {
  let state = scheduledDebt();
  state = apply(state, {
    type: "saveDebt",
    debt: state.obligations[0],
    schedule: { amount: 5000, day: 20, start: "2026-12" },
  });
  const before = structuredClone(state.recurring);
  state = apply(state, {
    type: "saveDebt",
    debt: { ...state.obligations[0], paymentAccount: "Nowe konto" },
  });
  assert.deepEqual(state.recurring, before);
});
test("przejęty harmonogram z historycznym wydatkiem zachowuje odtwarzalną kopię", () => {
  let state = expense(
    emptyState(),
    row("legacy", 10000, { period: "2026-10" }),
    true,
  );
  state = apply(state, {
    type: "saveDebt",
    debt: { id: "legacyDebt", name: "Dług", initial: 25000 },
  });
  const old = rowsForPeriod(state, period)[0];
  state = expense(state, { ...old, kind: "debt", debtId: "legacyDebt" }, true);
  state = apply(state, {
    type: "saveDebt",
    debt: state.obligations[0],
    schedule: { amount: 10000, day: 15, start: period },
  });
  assert.equal(state.recurring.length, 1);
  assert.deepEqual(validateBackup(exportBackup(state)), state);
});

test("jeden przelew rozlicza prywatne i wspólne subskrypcje atomowo, bez obciążania innych pozycji", () => {
  let s = emptyState();
  s = expense(s, row("private_sub", 3700, { category: "subskrypcje" }), true);
  s = expense(
    s,
    row("shared_sub", 5000, { category: "subskrypcje", household: true }),
    true,
  );
  s = expense(s, row("other", 13000), true);
  s = expense(s, row("oneoff_sub", 1200, { category: "subskrypcje" }));
  s = apply(s, { type: "settleSubscriptions", period, settled: true });
  assert.equal(s.settlements.length, 2);
  assert.equal(summary(s, period).done, 8700);
  assert.equal(summary(s, period).planned, 22900);
  assert.equal(new Set(s.settlements.map((p) => p.id)).size, 2);
  const again = apply(s, {
    type: "settleSubscriptions",
    period,
    settled: true,
  });
  assert.equal(again.settlements.length, 2);
  assert.deepEqual(balances(again), balances(emptyState()));
  assert.deepEqual(validateBackup(exportBackup(again)), again);
  const undo = apply(again, {
    type: "settleSubscriptions",
    period,
    settled: false,
  });
  assert.equal(summary(undo, period).done, 0);
  assert.equal(undo.settlements.length, 0);
});

test("grupowy przelew zachowuje wcześniej rozliczoną historię i nie dotyka wspólnego konta", () => {
  let s = emptyState();
  s = expense(s, row("sub", 5000, { category: "subskrypcje" }), true);
  s = expense(
    s,
    row("sub2", 3000, { category: "subskrypcje", household: true }),
    true,
  );
  s = expense(
    s,
    row("joint", 2000, {
      category: "subskrypcje",
      source: "shared",
      household: true,
    }),
    true,
  );
  const first = rowsForPeriod(s, period).find((r) => r.name === "sub");
  s = apply(s, { type: "settle", rowId: first.id, period, settled: true });
  const original = structuredClone(s.settlements[0]);
  s = apply(s, { type: "settleSubscriptions", period, settled: true });
  assert.deepEqual(s.settlements[0], original);
  assert.equal(s.settlements.length, 2);
  assert.equal(balances(s).shared, 0);
  assert.equal(summary(s, period).done, 8000);
  assert.throws(
    () =>
      apply(s, {
        type: "settleSubscriptions",
        period: "2026-12",
        settled: true,
      }),
    /Przyszły/,
  );
  assert.throws(
    () =>
      apply(emptyState(), {
        type: "settleSubscriptions",
        period,
        settled: true,
      }),
    /Brak subskrypcji/,
  );
});
