import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  balances,
  currentPeriod,
  householdForPeriod,
  isScheduledPeriod,
  shiftPeriod,
} from "../server/domain.mjs";
import { Button, Empty, Money, NoteTooltip } from "./components";
import { Ledger } from "./secondary";
import { householdTotals, sharedEntries, sharedPeriodStats } from "./household";
import type { Dialog } from "./dialogs";
import type { Act } from "./forms";
import type { HouseholdCost, State } from "./types";
import { periodLabel } from "./format";
export default function HouseholdView({
  state,
  period,
  page,
  busy,
  open,
  act,
  selectPeriod,
}: {
  state: State;
  period: string;
  page: "home" | "home-costs" | "home-stats";
  busy: boolean;
  open: (dialog: Dialog) => void;
  act: Act;
  selectPeriod: (period: string) => void;
}) {
  const confirm = (
    title: string,
    body: React.ReactNode,
    action: object,
    label: string,
    danger = false,
  ) =>
    open({
      type: "confirm",
      title,
      body,
      label,
      danger,
      perform: () => act(action),
    });
  if (page === "home")
    return (
      <div className="household-view">
        <section className="home-summary">
          <div>
            <p>Saldo wspólnego konta</p>
            <Money className="large-money" value={balances(state).shared} />
            <small>Po zapisanych wpływach, wydatkach i korektach</small>
          </div>
          <div className="actions">
            <Button
              disabled={busy}
              onClick={() => open({ type: "sharedEntry", kind: "deposit" })}
            >
              <Plus size={16} />
              Dodaj wpływ
            </Button>
            <Button
              disabled={busy}
              tone="secondary"
              onClick={() => open({ type: "sharedEntry", kind: "withdrawal" })}
            >
              Dodaj wydatek
            </Button>
            <Button
              tone="ghost"
              onClick={() =>
                open({ type: "account", account: "shared", correction: true })
              }
            >
              Ustaw saldo
            </Button>
          </div>
        </section>
        <p className="hint">
          Tutaj zapisujesz historię ręcznie. Koszty dzielone między Ciebie i
          Patryka są w „Podział kosztów” i nie zmieniają tego konta
          automatycznie.
        </p>
        <Ledger state={state} account="shared" act={act} confirm={confirm} />
      </div>
    );
  if (page === "home-stats") {
    const stats = sharedPeriodStats(state, period);
    const periods = [
      ...new Set([
        ...sharedEntries(state).map((e) => currentPeriod(e.date)),
        period,
      ]),
    ]
      .sort()
      .slice(-6);
    const spending = new Map<string, number>();
    for (const e of stats.entries.filter((e) => e.kind === "expense"))
      spending.set(e.name, (spending.get(e.name) || 0) - e.amount);
    return (
      <div className="household-view">
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Wpływy i wydatki wspólnego konta</h2>
              <p>
                Okresy 10–9. Dane z historii konta, bez kosztów opłacanych
                osobno.
              </p>
            </div>
          </div>
          <div
            className="stats-table-scroll"
            role="region"
            aria-label="Historia wyników wspólnego konta"
            tabIndex={0}
          >
            <table className="stats-table">
              <caption className="sr-only">
                Wpływy, wydatki, korekty i zmiana salda wspólnego konta
              </caption>
              <thead>
                <tr>
                  <th scope="col">Okres</th>
                  <th scope="col">Wpływy</th>
                  <th scope="col">Wydatki</th>
                  <th scope="col">Korekty</th>
                  <th scope="col">Zmiana salda</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const s = sharedPeriodStats(state, p);
                  return (
                    <tr
                      key={p}
                      className={period === p ? "selected-period" : ""}
                    >
                      <th scope="row">
                        <Button tone="ghost" onClick={() => selectPeriod(p)}>
                          {periodLabel(p)}
                        </Button>
                      </th>
                      <td>
                        <Money value={s.income} />
                      </td>
                      <td>
                        <Money value={s.expenses} />
                      </td>
                      <td>
                        <Money value={s.corrections} />
                      </td>
                      <td>
                        <Money value={s.net} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="stats-footnote">
            Cofnięte zapisy pomijamy. Korekty salda pokazujemy osobno, żeby nie
            udawały wpływów lub wydatków. Saldo początkowe nie jest wpływem.
          </p>
        </section>
        <section className="panel">
          <div className="section-title">
            <h2>Wydatki · {periodLabel(period)}</h2>
          </div>
          {spending.size ? (
            <div className="stats-bars">
              {[...spending]
                .sort((a, b) => b[1] - a[1])
                .map(([name, amount]) => (
                  <div className="stats-bar-row" key={name}>
                    <div>
                      <span className="row-title">
                        {name}
                        {stats.entries.some(
                          (e) => e.name === name && e.note,
                        ) && (
                          <NoteTooltip
                            name={name}
                            note={[
                              ...new Set(
                                stats.entries
                                  .filter((e) => e.name === name && e.note)
                                  .map((e) => e.note),
                              ),
                            ].join("\n\n")}
                          />
                        )}
                      </span>
                      <Money value={amount} />
                    </div>
                    <progress
                      value={amount}
                      max={Math.max(1, stats.expenses)}
                      aria-label={`Udział wydatku: ${name}`}
                    />
                  </div>
                ))}
            </div>
          ) : (
            <Empty title="Brak wydatków wspólnego konta w tym okresie">
              Dodaj wpisy w zakładce Wspólne konto, a pojawią się tutaj.
            </Empty>
          )}
        </section>
      </div>
    );
  }
  const planned = householdForPeriod(state, period),
    totals = householdTotals(state, period);
  const costs = (state.householdCosts || []).flatMap((cost) => {
    const v = cost.versions
      .filter((v) => v.from <= period)
      .sort((a, b) => a.from.localeCompare(b.from))
      .at(-1);
    return v && !v.stopped
      ? [
          {
            cost,
            v,
            charged: isScheduledPeriod(period, v.anchor, v.everyMonths),
            actual: planned.find((p) => p.id === cost.id),
          },
        ]
      : [];
  });
  const stop = (cost: HouseholdCost) => {
    let from = period < currentPeriod() ? currentPeriod() : period;
    while (
      state.settlements.some((s) => s.row.id === `${cost.templateId}_${from}`)
    )
      from = shiftPeriod(from, 1);
    confirm(
      "Zakończyć wspólny koszt?",
      <p>
        Koszt zniknie z podziału oraz Twoich stałych pozycji od okresu{" "}
        {periodLabel(from)}. Wcześniejsze okresy i zapłacone pozycje pozostaną w
        historii.
      </p>,
      { type: "stopHouseholdCost", costId: cost.id, period: from },
      "Zakończ koszt",
      true,
    );
  };
  const pct = (v: number) =>
    new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(v);
  return (
    <div className="household-view">
      <div className="section-title standalone">
        <p className="hint">
          Wpisz obie części kosztu. Twoja trafi do stałych w Moim budżecie;
          szacunek poprawisz po otrzymaniu rachunku. Każdy koszt możesz opisać
          notatką pod ⓘ.
        </p>
        <Button disabled={busy} onClick={() => open({ type: "householdCost" })}>
          <Plus size={16} />
          Dodaj wspólny koszt
        </Button>
      </div>
      <section className="panel">
        <div className="section-title">
          <h2>Podział wspólnych kosztów</h2>
        </div>
        {costs.length ? (
          <div className="household-cost-list">
            {costs.map(({ cost, v, charged, actual }) => (
              <div
                className={`household-cost-row ${charged ? "" : "cost-not-due"}`}
                key={cost.id}
              >
                <div className="row-name">
                  <div className="row-title">
                    <strong>{v.name}</strong>
                    {v.note && <NoteTooltip name={v.name} note={v.note} />}
                  </div>
                  <div className="row-meta">
                    <span>
                      {v.everyMonths === 2 ? "Co dwa miesiące" : "Co miesiąc"}
                    </span>
                    {v.estimated && <span>Szacunek</span>}
                    {v.dueDay && <span>{v.dueDay}. dzień miesiąca</span>}
                    {!charged && <span>Nie przypada w tym okresie</span>}
                  </div>
                </div>
                <div className="household-share">
                  <small>Ja</small>
                  <Money value={actual?.own ?? v.own} />
                </div>
                <div className="household-share">
                  <small>Patryk</small>
                  <Money value={v.partner} />
                </div>
                <div className="household-share">
                  <small>Razem</small>
                  <Money value={(actual?.own ?? v.own) + v.partner} />
                </div>
                <div className="row-actions">
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Edytuj wspólny koszt: ${v.name}`}
                    onClick={() => open({ type: "householdCost", cost })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Zakończ wspólny koszt: ${v.name}`}
                    onClick={() => stop(cost)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Dodaj wspólne opłaty">
            Np. mieszkanie: 1300 zł Ty i 1000 zł Patryk. Twoja część pojawi się
            w Twoim planie.
          </Empty>
        )}
      </section>
      <section className="panel household-total">
        <div className="section-title">
          <div>
            <h2>Podział budżetu · {periodLabel(period)}</h2>
            <p>
              Sumujemy tylko koszty przypadające w tym okresie z uzupełnionym
              podziałem.
            </p>
          </div>
        </div>
        <div className="household-total-values">
          <div>
            <span>Ja</span>
            <Money value={totals.own} />
            <small>{pct(totals.ownPercent)}%</small>
          </div>
          <div>
            <span>Patryk</span>
            <Money value={totals.partner} />
            <small>{pct(totals.partnerPercent)}%</small>
          </div>
          <div>
            <span>Łącznie</span>
            <Money value={totals.total} />
            <small>
              {totals.total ? "100%" : "Brak kosztów w tym okresie"}
            </small>
          </div>
        </div>
      </section>
    </div>
  );
}
