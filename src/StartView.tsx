import { Check, Minus } from "lucide-react";
import {
  balances,
  currentPeriod,
  patrykSavingsBalance,
  periodBounds,
  rowsForPeriod,
  shiftPeriod,
  summary,
} from "../server/domain.mjs";
import { Money, NoteTooltip } from "./components";
import { periodLabel, prettyDate } from "./format";
import type { State } from "./types";

export default function StartView({ state }: { state: State }) {
  const current = currentPeriod();
  const balance = balances(state);
  const ownSavings = balance.savings + balance.bonds;
  const partnerSavings = patrykSavingsBalance(state);
  return (
    <div className="start-view">
      <section className="start-savings" aria-labelledby="start-savings-title">
        <div>
          <h2 id="start-savings-title">Oszczędności na dziś</h2>
          <p>Stan z zapisanych wpłat, wypłat i korekt.</p>
        </div>
        <dl>
          <div>
            <dt>Twoje</dt>
            <dd>
              <Money value={ownSavings} />
            </dd>
            <dt className="start-detail">
              Konto <Money value={balance.savings} /> · obligacje{" "}
              <Money value={balance.bonds} />
            </dt>
          </div>
          <div>
            <dt>Patryka</dt>
            <dd>
              <Money value={partnerSavings} />
            </dd>
          </div>
          <div>
            <dt>Razem</dt>
            <dd>
              <Money value={ownSavings + partnerSavings} />
            </dd>
          </div>
        </dl>
        <p className="start-shared">
          Wspólne konto: <Money value={balance.shared} />{" "}
          <span>· poza sumą oszczędności</span>
        </p>
      </section>
      <section aria-labelledby="start-plans-title">
        <div className="start-plans-heading">
          <h2 id="start-plans-title">Twój plan w trzech okresach</h2>
          <p>Tylko podgląd · edytuj w zakładce Mój budżet</p>
        </div>
        <div className="start-plans">
          {[-1, 0, 1].map((offset) => {
            const period = shiftPeriod(current, offset);
            const bounds = periodBounds(period);
            const sum = summary(state, period);
            const rows = rowsForPeriod(state, period).filter(
              (r) => r.source === "personal",
            );
            const incomes = state.incomes
              .filter((i) => i.period === period)
              .map((i) => ({
                ...i,
                budgetAmount: i.splits
                  .filter((s) => s.destination === "budget")
                  .reduce((a, s) => a + s.amount, 0),
              }))
              .filter((i) => i.budgetAmount > 0);
            return (
              <article
                className={`start-plan ${offset === 0 ? "is-current" : ""}`}
                key={period}
              >
                <header>
                  <p className="eyebrow">
                    {offset === -1
                      ? "Poprzedni okres"
                      : offset === 0
                        ? "Bieżący okres"
                        : "Następny okres"}
                  </p>
                  <h3>{periodLabel(period)}</h3>
                  <p>
                    {prettyDate(bounds.start)} – {prettyDate(bounds.end)}
                  </p>
                </header>
                <div className="start-plan-content">
                  <h4>Wpływy do budżetu</h4>
                  {incomes.length ? (
                    <ul>
                      {incomes.map((i) => (
                        <li key={i.id}>
                          <span className="start-row-name">
                            <span
                              className="start-status"
                              aria-label={
                                i.received ? "Otrzymane" : "Planowane"
                              }
                            >
                              {i.received ? (
                                <Check size={14} />
                              ) : (
                                <Minus size={14} />
                              )}
                            </span>
                            {i.name}
                            {i.note && (
                              <NoteTooltip name={i.name} note={i.note} />
                            )}
                          </span>
                          <Money value={i.budgetAmount} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="start-empty">Nie wpisano wpływów.</p>
                  )}
                  <h4>Wydatki i cele</h4>
                  {rows.length ? (
                    <ul>
                      {rows.map((r) => {
                        const done = state.settlements.some(
                          (s) => s.row.id === r.id,
                        );
                        return (
                          <li key={r.id} className={done ? "is-done" : ""}>
                            <span className="start-row-name">
                              <span
                                className="start-status"
                                aria-label={
                                  done ? "Rozdysponowane" : "Do rozdysponowania"
                                }
                              >
                                {done ? (
                                  <Check size={14} />
                                ) : (
                                  <Minus size={14} />
                                )}
                              </span>
                              {r.name}
                              {r.note && (
                                <NoteTooltip name={r.name} note={r.note} />
                              )}
                            </span>
                            <Money value={r.amount} />
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="start-empty">Brak pozycji w planie.</p>
                  )}
                </div>
                <footer>
                  <dl>
                    <div>
                      <dt>Wpływy</dt>
                      <dd>
                        <Money value={sum.income} />
                      </dd>
                    </div>
                    <div>
                      <dt>Wydatki i cele</dt>
                      <dd>
                        <Money value={sum.planned} />
                      </dd>
                    </div>
                    <div>
                      <dt>Rozdysponowane</dt>
                      <dd>
                        <Money value={sum.done} />
                      </dd>
                    </div>
                    <div className="start-remaining">
                      <dt>Zostaje w planie</dt>
                      <dd>
                        <Money value={sum.remaining} />
                      </dd>
                    </div>
                  </dl>
                </footer>
              </article>
            );
          })}
        </div>
        <p className="start-legend">
          <Check size={14} aria-hidden="true" /> Otrzymane lub rozdysponowane{" "}
          <Minus size={14} aria-hidden="true" /> Planowane
        </p>
      </section>
    </div>
  );
}
