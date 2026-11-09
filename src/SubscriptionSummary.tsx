import { useState } from "react";
import { Check, ChevronRight, Layers } from "lucide-react";
import { currentPeriod, isSubscription } from "../server/domain.mjs";
import { Modal, Money, NoteTooltip } from "./components";
import { prettyDate, periodLabel } from "./format";
import type { Row, State } from "./types";

export { isSubscription };
export const isSharedSubscription = (row: Row) =>
  row.household || row.source === "shared";

export default function SubscriptionSummary({
  rows,
  state,
  period,
  compact = false,
  busy = false,
  transfer,
}: {
  rows: Row[];
  state: State;
  period: string;
  compact?: boolean;
  busy?: boolean;
  transfer?: (settled: boolean) => void;
}) {
  const [opened, setOpened] = useState(false);
  if (!rows.length) return null;
  const paid = (r: Row) =>
    r.amount === 0 || state.settlements.some((s) => s.row.id === r.id);
  const count = rows.filter(paid).length;
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return (
    <>
      <div
        className={`subscription-summary-row ${count === rows.length ? "is-done" : ""}`}
      >
        {transfer && (
          <button
            className={`settle-check ${count === rows.length ? "checked" : ""}`}
            disabled={busy || total === 0 || period > currentPeriod()}
            aria-label={`${count === rows.length ? "Cofnij przelew" : "Oznacz przelew"}: Subskrypcje`}
            aria-pressed={count === rows.length}
            onClick={() => transfer(count !== rows.length)}
          >
            {count === rows.length ? <Check size={17} /> : <span />}
          </button>
        )}
        <button
          className={`subscription-summary ${compact ? "is-compact" : ""} ${count === rows.length ? "is-done" : ""}`}
          onClick={() => setOpened(true)}
          aria-label={`Subskrypcje — ${periodLabel(period)}. Pokaż szczegóły`}
        >
          <Layers size={compact ? 15 : 20} aria-hidden="true" />
          <span className="subscription-summary-name">
            <strong>Subskrypcje</strong>
            {!compact && (
              <small>
                {count === rows.length
                  ? "Przelano na konto subskrypcji"
                  : count > 0
                    ? "Częściowo przekazane — uzupełnij przelew"
                    : "Do przelania na konto subskrypcji"}
              </small>
            )}
          </span>
          <Money value={total} />
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      {opened && (
        <Modal
          title="Subskrypcje"
          subtitle={`${periodLabel(period)} · Podział kwoty przelewanej na konto subskrypcji. Płatności pobierają się automatycznie.`}
          close={() => setOpened(false)}
          busy={busy}
        >
          <div className="subscription-details">
            {[false, true].map((shared) => {
              const group = rows.filter(
                (r) => isSharedSubscription(r) === shared,
              );
              return (
                <section key={String(shared)}>
                  <h3>
                    {shared ? "Wspólne" : "Prywatne"}
                    <Money
                      value={group.reduce((sum, r) => sum + r.amount, 0)}
                    />
                  </h3>
                  {group.length ? (
                    group.map((r) => (
                      <div className="subscription-detail-row" key={r.id}>
                        <div className="row-name">
                          <div className="row-title">
                            <strong>{r.name}</strong>
                            {r.note && (
                              <NoteTooltip name={r.name} note={r.note} />
                            )}
                          </div>
                          <div className="row-meta">
                            {r.dueDate
                              ? `Płatność: ${prettyDate(r.dueDate)}`
                              : "Dzień płatności nieustalony"}
                            {r.source === "shared" && (
                              <span>Ze wspólnego konta</span>
                            )}
                          </div>
                        </div>
                        <Money value={r.amount} />
                      </div>
                    ))
                  ) : (
                    <p className="muted">Brak subskrypcji w tej grupie.</p>
                  )}
                </section>
              );
            })}
            <div className="catalogue-total">
              <span>Razem w planie</span>
              <Money value={total} />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
