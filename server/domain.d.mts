import type {
  State,
  PatrykExpense,
  Row,
  HouseholdCost,
  HouseholdVersion,
} from "../src/types";
export class DomainError extends Error {}
export function emptyState(): State;
export function today(now?: Date): string;
export function currentPeriod(day?: string): string;
export function shiftPeriod(period: string, delta: number): string;
export function periodBounds(period: string): { start: string; end: string };
export function dueDate(period: string, day?: number): string | undefined;
export function money(value: number): string;
export function parseMoney(value: string): number;
export function balances(state: State): Record<string, number>;
export function rowsForPeriod(state: State, period: string): Row[];
export function knownPeriods(state: State): string[];
export function overdueRows(state: State, day?: string): Row[];
export function summary(
  state: State,
  period: string,
): {
  income: number;
  received: number;
  planned: number;
  done: number;
  remaining: number;
  available: number;
  toSettle: number;
  withdrawals: number;
};
export function savingsProposal(
  state: State,
  period: string,
): { reserve: number; bonds: number; remainder: number };
export function exportBackup(
  state: State,
  now?: Date,
): { format: "budzet-backup"; version: 1; exportedAt: string; state: State };
export function validateBackup(input: unknown): State;
export function applyAction(
  state: State,
  action: unknown,
  operationId: string,
  now?: Date,
): State;

export function isScheduledPeriod(
  period: string,
  anchor: string,
  everyMonths?: number,
): boolean;
export function householdForPeriod(
  state: State,
  period: string,
): (HouseholdCost & {
  version: HouseholdVersion;
  own: number;
  partner: number;
  total: number;
})[];

export function patrykOwnRows(state: State, period: string): PatrykExpense[];
export function patrykSavingsBalance(state: State): number;

export function isSubscription(row: Row): boolean;
export function subscriptionRows(state: State, period: string): Row[];
