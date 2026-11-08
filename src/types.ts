export type Category = string;
export type Kind = "expense" | "debt" | "savings" | "bonds" | "sharedDeposit";
export type Row = {
  id: string;
  period: string;
  templateId?: string;
  name: string;
  amount: number;
  category: Category;
  source: "personal" | "shared";
  kind: Kind;
  debtId?: string;
  dueDate?: string;
  note: string;
  household: boolean;
  fundingAccount?: "savings";
};
export type Income = {
  id: string;
  period: string;
  name: string;
  amount: number;
  date: string;
  received: boolean;
  note: string;
  splits: {
    destination: "budget" | "savings" | "bonds" | "debt";
    amount: number;
    debtId?: string;
  }[];
};
export type Transaction = {
  id: string;
  date: string;
  account: string;
  name?: string;
  amount: number;
  note: string;
  kind: "deposit" | "withdrawal" | "correction" | "reversal";
  reversedBy?: string;
  reverses?: string;
};
export type Patryk = {
  period: string;
  income: number;
  expenses: number;
  savings: number;
  note: string;
};
export type State = {
  version: 1;
  goalGroups?: GoalGroup[];
  householdCosts?: HouseholdCost[];
  settings: { reserveTarget: number };
  openings: { savings: number; bonds: number; shared: number };
  recurring: {
    id: string;
    versions: {
      from: string;
      name: string;
      amount: number;
      category: Category;
      source: "personal" | "shared";
      kind: Kind;
      debtId?: string;
      dueDay?: number;
      everyMonths?: 1 | 2;
      anchor?: string;
      note: string;
      stopped: boolean;
      household: boolean;
    }[];
  }[];
  expenses: Row[];
  incomes: Income[];
  settlements: { id: string; row: Row; date: string }[];
  obligations: Debt[];
  transactions: Transaction[];
  patryk: Patryk[];
  patrykMonths?: PatrykMonth[];
  patrykExpenses?: PatrykExpense[];
  patrykRecurring?: {
    id: string;
    versions: {
      from: string;
      name: string;
      amount: number;
      stopped: boolean;
    }[];
  }[];
  patrykSavingsOpening?: number;
  patrykSavingsOpeningPeriod?: string;
  patrykMovements?: PatrykMovement[];
  audit: { id: string; at: string; label: string; details?: string }[];
};
export type Snapshot = { revision: number; state: State; local: boolean };
export const categories: Record<Category, string> = {
  dom: "Dom",
  jedzenie: "Jedzenie",
  transport: "Transport",
  zdrowie: "Zdrowie",
  subskrypcje: "Subskrypcje",
  raty: "Raty",
  osobiste: "Osobiste",
  nieplanowane: "Nieplanowane",
  oszczednosci: "Oszczędności",
  inne: "Inne",
};
export const kinds: Record<Kind, string> = {
  expense: "Wydatek / środki na cel",
  debt: "Rata / nadpłata",
  savings: "Wpłata na oszczędności",
  bonds: "Zakup obligacji",
  sharedDeposit: "Wpłata na wspólne konto",
};
export const destinations = {
  budget: "Do budżetu",
  savings: "Na konto oszczędnościowe",
  bonds: "Na obligacje",
  debt: "Na spłatę zobowiązania",
};
export const accountNames: Record<string, string> = {
  savings: "Konto oszczędnościowe",
  bonds: "Obligacje",
  shared: "Wspólne konto",
};

export type Debt = {
  id: string;
  name: string;
  initial: number;
  paymentAccount?: string;
  paymentTitle?: string;
  templateId?: string;
};

export type GoalMember = { type: "template" | "row"; ref: string };
export type GoalGroup = { id: string; name: string; members: GoalMember[] };

export type HouseholdVersion = {
  from: string;
  name: string;
  own: number;
  partner: number;
  category: string;
  note: string;
  everyMonths: 1 | 2;
  anchor: string;
  dueDay?: number;
  estimated: boolean;
  stopped: boolean;
};
export type HouseholdCost = {
  id: string;
  templateId: string;
  versions: HouseholdVersion[];
};

export type PatrykMonth = {
  period: string;
  income?: number;
  note: string;
  detailedExpenses: boolean;
  savingsComplete: boolean;
};
export type PatrykExpense = {
  id: string;
  period: string;
  name: string;
  amount: number;
  templateId?: string;
};
export type PatrykMovement = {
  id: string;
  period: string;
  date: string;
  amount: number;
  kind: "deposit" | "withdrawal" | "correction" | "reversal";
  note: string;
  alreadyIncluded?: boolean;
  reversedBy?: string;
  reverses?: string;
};
