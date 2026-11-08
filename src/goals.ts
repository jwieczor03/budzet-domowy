import { rowsForPeriod } from "../server/domain.mjs";
import type { GoalMember, Row, State } from "./types";
export const goalMember = (row: Row): GoalMember =>
  row.templateId
    ? { type: "template", ref: row.templateId }
    : { type: "row", ref: row.id };
export const goalKey = (member: GoalMember) => `${member.type}:${member.ref}`;
export function periodGoals(state: State, period: string) {
  const rows = rowsForPeriod(state, period).filter(
    (r) => r.source === "personal",
  );
  const assigned = new Set(
    (state.goalGroups || []).flatMap((g) => g.members.map(goalKey)),
  );
  const groups = (state.goalGroups || []).map((group) => {
    const keys = new Set(group.members.map(goalKey));
    const items = rows.filter((row) => keys.has(goalKey(goalMember(row))));
    return {
      ...group,
      items,
      total: items.reduce((sum, r) => sum + r.amount, 0),
    };
  });
  const unassigned = rows.filter(
    (row) => !assigned.has(goalKey(goalMember(row))),
  );
  return {
    groups,
    unassigned,
    total: groups.reduce((sum, g) => sum + g.total, 0),
  };
}
