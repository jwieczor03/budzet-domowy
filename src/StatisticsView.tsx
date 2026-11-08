import { useState } from "react";
import { balances, currentPeriod } from "../server/domain.mjs";
import { Button, Empty, Money } from "./components";
import { periodLabel } from "./format";
import { categories, type State } from "./types";
import { comparisonPeriods, periodStatistics } from "./statistics";
export default function StatisticsView({
  state,
  period,
  selectPeriod,
}: {
  state: State;
  period: string;
  selectPeriod: (period: string) => void;
}) {
  const [mode, setMode] = useState<"plan" | "done">("plan");
  const stats = periodStatistics(state, period, mode);
  const periods = comparisonPeriods(state, period);
  const balance = balances(state);
  const percent = (part: number, total: number) =>
    total ? Math.round((part / total) * 100) : 0;
  return (
    <div className="statistics-view">
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Miesiąc do miesiąca</h2>
            <p>
              Do sześciu okresów z danymi. Wybierz miesiąc, by zobaczyć jego
              szczegóły poniżej.
            </p>
          </div>
        </div>
        <div
          className="stats-table-scroll"
          role="region"
          aria-label="Porównanie okresów budżetowych"
          tabIndex={0}
        >
          <table className="stats-table">
            <caption className="sr-only">
              Plan oraz otrzymane i rozdysponowane środki w kolejnych okresach
              10–9
            </caption>
            <thead>
              <tr>
                <th scope="col">Okres</th>
                <th scope="col">Wpływy do budżetu</th>
                <th scope="col">Wydatki i cele</th>
                <th scope="col">Pozostaje w planie</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((row) => (
                <tr
                  key={row.period}
                  className={row.period === period ? "selected-period" : ""}
                >
                  <th scope="row">
                    <Button
                      tone="ghost"
                      onClick={() => selectPeriod(row.period)}
                      aria-current={row.period === period ? "true" : undefined}
                    >
                      {periodLabel(row.period)}
                    </Button>
                    <small>
                      {row.period > currentPeriod()
                        ? "Przyszły plan"
                        : row.period === currentPeriod()
                          ? "Bieżący okres"
                          : "Poprzedni okres"}
                    </small>
                  </th>
                  <td>
                    <Money value={row.income} />
                    <small>
                      Otrzymane: <Money value={row.received} />
                    </small>
                  </td>
                  <td>
                    <Money value={row.planned} />
                    <small>
                      Rozdysponowane: <Money value={row.done} />
                    </small>
                  </td>
                  <td className={row.remaining < 0 ? "late-text" : ""}>
                    <Money value={row.remaining} />
                    {row.withdrawals > 0 && (
                      <small>Uwzględnia wypłatę z oszczędności</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="stats-footnote">
          Wpływy obejmują część przeznaczoną na budżet. Pozostała kwota
          uwzględnia zapisane finansowanie z oszczędności. Rozdysponowanie
          oznacza zapłatę lub przekazanie do puli — nie ewidencję każdego
          zakupu.
        </p>
      </section>
      <div className="stats-detail-heading">
        <h2>{periodLabel(period)} — szczegóły</h2>
        <div className="filter-tabs" aria-label="Zakres statystyk">
          <button
            className={mode === "plan" ? "selected" : ""}
            aria-pressed={mode === "plan"}
            onClick={() => setMode("plan")}
          >
            Cały plan
          </button>
          <button
            className={mode === "done" ? "selected" : ""}
            aria-pressed={mode === "done"}
            onClick={() => setMode("done")}
          >
            Rozdysponowane
          </button>
        </div>
      </div>
      <div className="stats-columns">
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Na co przeznaczasz pieniądze?</h2>
              <p>
                Kategorie własnych wydatków, w tym Twoje części kosztów
                domowych.
              </p>
            </div>
          </div>
          {stats.spending.length ? (
            <div className="stats-bars">
              {stats.spending.map((item) => (
                <div className="stats-bar-row" key={item.id}>
                  <div>
                    <span>{categories[item.id] || item.label}</span>
                    <span>
                      <Money value={item.amount} />{" "}
                      <small>
                        {percent(item.amount, stats.spendingTotal)}%
                      </small>
                    </span>
                  </div>
                  <progress
                    aria-label={`${item.label}: udział w wydatkach`}
                    value={item.amount}
                    max={Math.max(1, stats.spendingTotal)}
                  />
                </div>
              ))}
              <div className="summary-line">
                <strong>Razem wydatki</strong>
                <Money value={stats.spendingTotal} />
              </div>
            </div>
          ) : (
            <Empty
              title={
                mode === "done"
                  ? "Brak rozdysponowanych wydatków"
                  : "Brak wydatków w tym okresie"
              }
            >
              {mode === "done"
                ? "Po oznaczeniu zapłaty kategorie pojawią się tutaj."
                : "Dodaj pozycje w rozliczeniu tego miesiąca."}
            </Empty>
          )}
          <p className="stats-footnote">
            Raty, oszczędności i przelewy na wspólne konto są obok, aby nie
            liczyć ich jako zakupów. Zakupy ze wspólnego konta należą do budżetu
            Dom.
          </p>
        </section>
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Jak dzielisz swój budżet?</h2>
              <p>
                {mode === "plan"
                  ? "Kwoty zaplanowane w rozliczeniu."
                  : "Pozycje oznaczone jako zapłacone lub przekazane."}
              </p>
            </div>
          </div>
          <div className="stats-bars">
            {stats.allocation.map((item) => (
              <div className="summary-line" key={item.id}>
                <span>{item.label}</span>
                <Money value={item.amount} />
              </div>
            ))}
            <div className="summary-line stats-total">
              <strong>Razem</strong>
              <Money value={stats.total} />
            </div>
          </div>
          <p className="stats-footnote">
            Wpływy wysłane bezpośrednio na oszczędności lub spłatę długu nie
            przechodzą przez budżet i nie są tu doliczane. Wpływają na aktualne
            salda poniżej.
          </p>
        </section>
      </div>
      <div className="stats-columns">
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Oszczędności — aktualny stan</h2>
              <p>
                Według zapisanych sald i wykonanych ruchów, niezależnie od
                wybranego miesiąca.
              </p>
            </div>
          </div>
          <div className="stats-bars">
            <div className="summary-line">
              <span>Konto oszczędnościowe</span>
              <Money value={balance.savings} />
            </div>
            <div className="summary-line">
              <span>Obligacje</span>
              <Money value={balance.bonds} />
            </div>
            <div className="summary-line stats-total">
              <strong>Łącznie</strong>
              <Money value={balance.savings + balance.bonds} />
            </div>
            <div className="stats-reserve">
              <div className="summary-line">
                <span>Rezerwa do celu</span>
                <span>
                  {percent(balance.savings, state.settings.reserveTarget)}%
                </span>
              </div>
              <progress
                aria-label="Realizacja celu rezerwy"
                value={Math.min(balance.savings, state.settings.reserveTarget)}
                max={Math.max(1, state.settings.reserveTarget)}
              />
              <small>
                Cel: <Money value={state.settings.reserveTarget} />
              </small>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Spłata zobowiązań — aktualny stan</h2>
              <p>Raty i nadpłaty pomniejszają pozostały dług.</p>
            </div>
          </div>
          {state.obligations.length ? (
            <div className="stats-bars">
              {state.obligations.map((debt) => (
                <div className="stats-bar-row" key={debt.id}>
                  <div>
                    <span>{debt.name}</span>
                    <span>
                      Do spłaty <Money value={balance[`debt:${debt.id}`]} />
                    </span>
                  </div>
                  <progress
                    aria-label={`Spłata: ${debt.name}`}
                    value={Math.max(
                      0,
                      debt.initial - balance[`debt:${debt.id}`],
                    )}
                    max={Math.max(1, debt.initial)}
                  />
                  <small>
                    Zmniejszenie od salda początkowego:{" "}
                    <Money value={debt.initial - balance[`debt:${debt.id}`]} />
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Brak zapisanych zobowiązań">
              Dodaj raty w zakładce Zobowiązania.
            </Empty>
          )}
        </section>
      </div>
    </div>
  );
}
