import type {
  Debt,
  GoalGroup,
  HouseholdCost,
  Income,
  PatrykExpense,
  Row,
} from "./types";
export type Dialog =
  | {
      type: "expense";
      row?: Row;
      shared?: boolean;
      debtId?: string;
      fixed?: boolean;
      transfer?: boolean;
      category?: string;
    }
  | { type: "income"; income?: Income }
  | { type: "account"; account: string; correction?: boolean }
  | { type: "debt"; debt?: Debt }
  | { type: "overpay"; debt: Debt }
  | { type: "patryk" }
  | { type: "patrykExpense"; row?: PatrykExpense }
  | { type: "patrykSavings"; kind: "deposit" | "withdrawal" | "correction" }
  | { type: "target" }
  | { type: "sharedEntry"; kind: "deposit" | "withdrawal" }
  | { type: "householdCost"; cost?: HouseholdCost; templateId?: string }
  | { type: "goalGroup"; group?: GoalGroup }
  | {
      type: "confirm";
      title: string;
      body: React.ReactNode;
      perform: () => Promise<void>;
      label: string;
      danger?: boolean;
    }
  | { type: "allocate" };
