import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  emptyState,
  rowsForPeriod,
  summary,
  exportBackup,
  validateBackup,
} from "../server/domain.mjs";
import { periodGoals } from "../src/goals.ts";
const now = new Date("2026-11-08T12:00:00Z");
const apply = (s, a) => applyAction(s, a, crypto.randomUUID(), now);
const row = (id, amount) => ({
  id,
  period: "2026-10",
  name: id,
  amount,
  category: "osobiste",
  source: "personal",
  kind: "expense",
  note: "",
  household: false,
});
const seed = () => {
  let s = apply(emptyState(), {
    type: "saveExpense",
    row: row("barber", 13000),
    recurring: true,
    scope: "future",
  });
  s = apply(s, {
    type: "saveExpense",
    row: row("psycholog", 20000),
    recurring: true,
    scope: "future",
  });
  return s;
};
const group = (s, id, name, members) =>
  apply(s, { type: "saveGoalGroup", group: { id, name, members } });
test("cele sumują pozycje miesiąca i zachowują powiązania stałych pozycji", () => {
  let s = group(seed(), "general", "Ogólne", [
    { type: "template", ref: "barber" },
    { type: "template", ref: "psycholog" },
  ]);
  assert.equal(periodGoals(s, "2026-10").groups[0].total, 33000);
  const future = rowsForPeriod(s, "2026-11").find(
    (r) => r.templateId === "psycholog",
  );
  s = apply(s, {
    type: "saveExpense",
    row: { ...future, amount: 25000 },
    recurring: true,
    scope: "future",
  });
  assert.equal(periodGoals(s, "2026-10").total, 33000);
  assert.equal(periodGoals(s, "2026-11").total, 38000);
  s = apply(s, {
    type: "settle",
    rowId: "barber_2026-10",
    period: "2026-10",
    settled: true,
  });
  assert.equal(periodGoals(s, "2026-10").total, 33000);
  assert.deepEqual(validateBackup(exportBackup(s)), s);
});
test("przenoszenie i usunięcie grupy nie zmienia finansów ani nie liczy pozycji dwa razy", () => {
  let s = group(seed(), "general", "Ogólne", [
    { type: "template", ref: "barber" },
    { type: "template", ref: "psycholog" },
  ]);
  const before = summary(s, "2026-10");
  s = group(s, "health", "Zdrowie", [{ type: "template", ref: "psycholog" }]);
  assert.equal(periodGoals(s, "2026-10").total, 33000);
  assert.equal(s.goalGroups[0].members.length, 1);
  s = apply(s, { type: "deleteGoalGroup", groupId: "health" });
  assert.equal(periodGoals(s, "2026-10").unassigned[0].name, "psycholog");
  assert.deepEqual(summary(s, "2026-10"), before);
});
test("usunięcie jednorazowego wydatku usuwa martwe przypisanie, kopia odtwarza się", () => {
  let s = apply(seed(), {
    type: "saveExpense",
    row: row("extra", 1000),
    recurring: false,
    scope: "one",
  });
  s = group(s, "extra-group", "Dodatkowe", [{ type: "row", ref: "extra" }]);
  s = apply(s, {
    type: "deleteExpense",
    rowId: "extra",
    period: "2026-10",
    scope: "one",
  });
  assert.equal(s.goalGroups[0].members.length, 0);
  assert.deepEqual(validateBackup(exportBackup(s)), s);
  const oldBackup = exportBackup(emptyState());
  delete oldBackup.state.goalGroups;
  assert.deepEqual(validateBackup(oldBackup).goalGroups, []);
});
test("nieistniejące i powielone przypisania w kopii są odrzucane", () => {
  const s = seed();
  assert.throws(() =>
    group(s, "invalid", "Błąd", [{ type: "row", ref: "missing" }]),
  );
  const backup = exportBackup(
    group(s, "a", "A", [{ type: "template", ref: "barber" }]),
  );
  backup.state.goalGroups.push({
    id: "b",
    name: "B",
    members: [{ type: "template", ref: "barber" }],
  });
  assert.throws(() => validateBackup(backup));
});
test("zamiana jednorazowej pozycji na stałą zachowuje przypisanie do grupy", () => {
  let s = apply(emptyState(), {
    type: "saveExpense",
    row: row("haircut", 13000),
    recurring: false,
    scope: "one",
  });
  s = group(s, "general", "Ogólne", [{ type: "row", ref: "haircut" }]);
  s = apply(s, {
    type: "saveExpense",
    row: row("haircut", 13000),
    recurring: true,
    scope: "future",
  });
  assert.deepEqual(s.goalGroups[0].members, [
    { type: "template", ref: "haircut" },
  ]);
  assert.equal(periodGoals(s, "2026-11").total, 13000);
  assert.deepEqual(validateBackup(exportBackup(s)), s);
});
