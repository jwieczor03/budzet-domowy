import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Undo2 } from "lucide-react";
import { money } from "../server/domain.mjs";
import { Button, Confirm, Money, NoteTooltip } from "./components";
import { accountNames, type State, type Transaction } from "./types";
import { prettyDate } from "./format";
export function Allocation({
  proposal,
  close,
  act,
  period,
}: {
  proposal: { reserve: number; bonds: number; remainder: number };
  close: () => void;
  act: (a: object) => Promise<void>;
  period: string;
}) {
  const [remainder, setRemainder] = useState<"savings" | "budget">("savings");
  return (
    <Confirm
      title="Zaplanuj nadwyżkę"
      close={close}
      label="Dodaj do planu"
      perform={() => act({ type: "allocate", period, remainder })}
    >
      <p>
        Dodamy pozycje do planu. Salda zmienią się dopiero, gdy oznaczysz je
        jako rozdysponowane.
      </p>
      <div className="allocation">
        <div>
          <span>Uzupełnienie rezerwy</span>
          <Money value={proposal.reserve} />
        </div>
        <div>
          <span>Obligacje · pełne setki</span>
          <Money value={proposal.bonds} />
        </div>
        <div>
          <span>Końcówka do decyzji</span>
          <Money value={proposal.remainder} />
        </div>
      </div>
      {proposal.remainder > 0 && (
        <fieldset className="radio-group">
          <legend>Gdzie zaplanować końcówkę?</legend>
          <label>
            <input
              type="radio"
              name="remainder"
              checked={remainder === "savings"}
              onChange={() => setRemainder("savings")}
            />
            Konto oszczędnościowe
          </label>
          <label>
            <input
              type="radio"
              name="remainder"
              checked={remainder === "budget"}
              onChange={() => setRemainder("budget")}
            />
            Pula nieplanowanych wydatków
          </label>
        </fieldset>
      )}
    </Confirm>
  );
}
type LedgerItem = {
  id: string;
  date: string;
  note: string;
  amount: number;
  source: string;
  transaction?: Transaction;
  details?: string;
};
export function Ledger({
  state,
  account,
  confirm,
  compact = false,
}: {
  state: State;
  account: string;
  act: (a: object) => Promise<void>;
  confirm: (
    title: string,
    body: React.ReactNode,
    action: object,
    label: string,
    danger?: boolean,
  ) => void;
  compact?: boolean;
}) {
  const [limit, setLimit] = useState(10);
  const entries: LedgerItem[] = state.transactions
    .filter((t) => t.account === account)
    .map((t) => ({
      id: t.id,
      date: t.date,
      details: t.note,
      note:
        t.name ||
        (account === "shared" ? "" : t.note) ||
        (t.kind === "correction"
          ? "Korekta salda"
          : t.kind === "withdrawal"
            ? "Wypłata"
            : "Wpłata"),
      amount: t.amount,
      source:
        t.kind === "correction"
          ? "Korekta"
          : t.kind === "reversal"
            ? "Cofnięcie"
            : "Ruch konta",
      transaction: t,
    }));
  for (const s of state.settlements) {
    let amount = 0;
    const r = s.row;
    if (account === "shared")
      amount =
        r.source === "shared"
          ? -r.amount
          : r.kind === "sharedDeposit"
            ? r.amount
            : 0;
    else if (account.startsWith("debt:"))
      amount =
        r.kind === "debt" && `debt:${r.debtId}` === account ? -r.amount : 0;
    else if (account === "savings" && r.fundingAccount === "savings")
      amount = -r.amount;
    else amount = r.kind === account ? r.amount : 0;
    if (amount)
      entries.push({
        id: s.id,
        date: s.date,
        note: r.name,
        details: r.note,
        amount,
        source: "Z rozliczenia budżetu",
      });
  }
  for (const inc of state.incomes.filter((i) => i.received))
    inc.splits.forEach((s, i) => {
      if (
        s.destination === account ||
        (s.destination === "debt" && `debt:${s.debtId}` === account)
      )
        entries.push({
          id: `${inc.id}_${i}`,
          date: inc.date,
          note: inc.name,
          details: inc.note,
          amount: s.destination === "debt" ? -s.amount : s.amount,
          source: "Bezpośrednio z wpływu",
        });
    });
  entries.sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section className={compact ? "compact-ledger" : "panel ledger-panel"}>
      <div className="section-title">
        <h2>
          {compact
            ? "Historia spłat i korekt"
            : `Historia · ${accountNames[account]}`}
        </h2>
        <span className="count">{entries.length}</span>
      </div>
      {entries.length ? (
        <>
          <div className="ledger-list">
            {entries.slice(0, limit).map((e) => (
              <div className="ledger-row" key={e.id}>
                <span
                  className={`ledger-direction ${e.amount >= 0 ? "positive" : ""}`}
                >
                  {e.amount >= 0 ? (
                    <ArrowDownLeft size={17} />
                  ) : (
                    <ArrowUpRight size={17} />
                  )}
                </span>
                <div className="row-name">
                  <div className="row-title">
                    <strong>{e.note}</strong>
                    {e.details && (
                      <NoteTooltip name={e.note} note={e.details} />
                    )}
                  </div>
                  <div className="row-meta">
                    <span>{prettyDate(e.date)}</span>
                    <span>{e.source}</span>
                  </div>
                </div>
                <Money value={e.amount} />
                {e.transaction &&
                  !e.transaction.reverses &&
                  !e.transaction.reversedBy && (
                    <button
                      className="icon-button"
                      aria-label={`Cofnij ruch: ${e.note}`}
                      onClick={() =>
                        confirm(
                          "Cofnąć ruch konta?",
                          <p>
                            Kwota {money(e.amount)} zostanie odwrócona. Oba
                            zapisy pozostaną w historii.
                          </p>,
                          { type: "reverseTransaction", transactionId: e.id },
                          "Cofnij ruch",
                        )
                      }
                    >
                      <Undo2 size={16} />
                    </button>
                  )}
              </div>
            ))}
          </div>
          {entries.length > limit && (
            <Button tone="ghost" onClick={() => setLimit(limit + 20)}>
              Pokaż więcej
            </Button>
          )}
        </>
      ) : (
        <p className="hint">
          Historia pojawi się po zapisaniu pierwszego ruchu lub rozliczeniu
          powiązanej pozycji.
        </p>
      )}
    </section>
  );
}
