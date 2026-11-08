import {
  ArrowDown,
  ArrowUp,
  Minus,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  currentPeriod,
  money,
  patrykSavingsBalance,
} from "../server/domain.mjs";
import { Button, Empty, Money, NoteTooltip } from "./components";
import {
  patrykComparison,
  patrykPeriod,
  patrykSavingsNet,
  patrykStatistics,
} from "./patryk";
import { periodLabel, prettyDate } from "./format";
import type { State } from "./types";
import type { Dialog } from "./dialogs";
import type { Act } from "./forms";
export default function PatrykView({
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
  page: "patryk" | "patryk-savings" | "patryk-stats";
  busy: boolean;
  open: (dialog: Dialog) => void;
  act: Act;
  selectPeriod: (period: string) => void;
}) {
  const data = patrykPeriod(state, period);
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
  const run = (action: object) =>
    void act(action).catch(() => {
      /* App retains errors for retry. */
    });
  if (page === "patryk-savings") {
    const entries = (state.patrykMovements || [])
      .filter((m) => m.period === period)
      .sort((a, b) => b.date.localeCompare(a.date));
    const complete = data.month?.savingsComplete || false;
    const names = {
      deposit: "Wpłata",
      withdrawal: "Wypłata",
      correction: "Korekta salda",
      reversal: "Cofnięcie",
    };
    return (
      <div className="patryk-view">
        <section className="home-summary">
          <div>
            <p>Oszczędności Patryka — aktualny stan</p>
            <Money
              className="large-money"
              value={patrykSavingsBalance(state)}
            />
            <small>Oddzielne od Twojego budżetu i wspólnego konta</small>
          </div>
          <div className="actions">
            <Button
              onClick={() => open({ type: "patrykSavings", kind: "deposit" })}
            >
              <Plus size={16} />
              Dodaj wpłatę
            </Button>
            <Button
              tone="secondary"
              onClick={() =>
                open({ type: "patrykSavings", kind: "withdrawal" })
              }
            >
              Dodaj wypłatę
            </Button>
            <Button
              tone="ghost"
              onClick={() =>
                open({ type: "patrykSavings", kind: "correction" })
              }
            >
              Ustaw saldo
            </Button>
          </div>
        </section>
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>{periodLabel(period)} — oszczędności</h2>
              <p>
                Listopad możesz uzupełnić w grudniu. Wybierz miesiąc, którego
                dotyczą wpłaty i wypłaty.
              </p>
            </div>
            <Button
              tone="secondary"
              disabled={busy || period > currentPeriod()}
              onClick={() =>
                run({
                  type: "completePatrykSavings",
                  period,
                  complete: !complete,
                })
              }
            >
              {complete
                ? "Oznacz jako nieuzupełniony"
                : "Miesiąc uzupełniony — uwzględnij w średniej"}
            </Button>
          </div>
          <div className="patryk-month-status">
            <span>{complete ? "Uzupełniony" : "Czeka na uzupełnienie"}</span>
            <span>
              Wpłaty minus wypłaty:{" "}
              <Money value={patrykSavingsNet(state, period)} />
            </span>
          </div>
          {entries.length ? (
            <div>
              {entries.map((m) => (
                <div className="patryk-savings-row" key={m.id}>
                  <div className="row-name">
                    <div className="row-title">
                      <strong>{names[m.kind]}</strong>
                      {m.note && (
                        <NoteTooltip name={names[m.kind]} note={m.note} />
                      )}
                    </div>
                    <div className="row-meta">
                      <span>{prettyDate(m.date)}</span>
                      {m.alreadyIncluded && (
                        <span>Już uwzględnione w saldzie</span>
                      )}
                      {(m.reversedBy || m.reverses) && (
                        <span>Cofnięty zapis</span>
                      )}
                    </div>
                  </div>
                  <Money value={m.amount} />
                  {!m.reversedBy && !m.reverses && (
                    <button
                      className="icon-button"
                      disabled={busy}
                      aria-label={`Cofnij ${names[m.kind].toLocaleLowerCase("pl")} z ${prettyDate(m.date)}`}
                      onClick={() =>
                        confirm(
                          "Cofnąć ruch oszczędności?",
                          <p>
                            Odwrócimy {money(m.amount)}. Oba wpisy pozostaną w
                            historii, a miesiąc trzeba będzie ponownie oznaczyć
                            jako uzupełniony.
                          </p>,
                          { type: "reversePatrykMovement", movementId: m.id },
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
          ) : (
            <Empty title="Brak wpisanych ruchów w tym miesiącu">
              Jeśli nie było wpłat ani wypłat, oznacz miesiąc jako uzupełniony —
              wtedy do średniej trafi rzeczywiste 0 zł.
            </Empty>
          )}
          <p className="stats-footnote">
            Korekty salda nie są odkładaniem pieniędzy. Nowa wpłata, wypłata lub
            cofnięcie ustawia miesiąc jako nieuzupełniony, abyś mógł sprawdzić
            pełny wynik.
          </p>
        </section>
      </div>
    );
  }
  if (page === "patryk-stats") {
    const stats = patrykStatistics(state);
    const periods = [
      ...new Set([
        ...stats.salaryPeriods,
        ...stats.savingsPeriods,
        ...(state.patrykMonths || []).map((m) => m.period),
        ...(state.patrykExpenses || []).map((r) => r.period),
        ...(state.patrykRecurring || []).flatMap((t) =>
          t.versions.map((v) => v.from),
        ),
        period,
      ]),
    ]
      .sort()
      .slice(-12);
    return (
      <div className="patryk-view">
        <section className="panel">
          <div className="section-title">
            <h2>Średnie z uzupełnionych danych</h2>
          </div>
          <div className="patryk-averages">
            {[
              {
                label: "Średnia wypłata",
                value: stats.averageIncome,
                count: stats.salaryPeriods.length,
                description: "Bieżące i wcześniejsze okresy z wpisaną wypłatą.",
              },
              {
                label: "Średnie wydatki",
                value: stats.averageExpenses,
                count: stats.salaryPeriods.length,
                description:
                  "Suma Domu i innych wydatków w okresach z wpisaną wypłatą.",
              },
              {
                label: "Średnio odkładane miesięcznie",
                value: stats.averageSavings,
                count: stats.savingsPeriods.length,
                description:
                  "Wpłaty minus wypłaty. Tylko miesiące oznaczone jako uzupełnione, bez korekt salda.",
              },
            ].map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                {item.value === null ? (
                  <strong>Brak danych</strong>
                ) : (
                  <Money value={item.value} />
                )}
                <small>
                  {item.description} Liczba okresów: {item.count}.
                </small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="section-title">
            <h2>Miesiąc do miesiąca</h2>
          </div>
          <div
            className="stats-table-scroll"
            role="region"
            aria-label="Statystyki Patryka według okresu"
            tabIndex={0}
          >
            <table className="stats-table">
              <caption className="sr-only">
                Wypłaty, wydatki i odkładane kwoty Patryka
              </caption>
              <thead>
                <tr>
                  <th scope="col">Okres</th>
                  <th scope="col">Wypłata</th>
                  <th scope="col">Wydatki</th>
                  <th scope="col">Odłożone netto</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const d = patrykPeriod(state, p);
                  return (
                    <tr
                      key={p}
                      className={p === period ? "selected-period" : ""}
                    >
                      <th scope="row">
                        <Button tone="ghost" onClick={() => selectPeriod(p)}>
                          {periodLabel(p)}
                        </Button>
                        {p > currentPeriod() && (
                          <small>Przyszły okres — poza średnią</small>
                        )}
                      </th>
                      <td>
                        {d.income === null ? (
                          "Nieuzupełniona"
                        ) : (
                          <Money value={d.income} />
                        )}
                      </td>
                      <td>
                        <Money value={d.total} />
                      </td>
                      <td>
                        {d.month?.savingsComplete ? (
                          <Money value={patrykSavingsNet(state, p)} />
                        ) : (
                          <span className="muted">Do uzupełnienia</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="stats-footnote">
            Brak wypłaty nie jest zerową wypłatą. Przyszłe okresy nie trafiają
            do średnich. Wydatki są liczone z wpisanych pozycji — nie z historii
            bankowej Patryka.
          </p>
        </section>
      </div>
    );
  }
  return (
    <div className="patryk-view">
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Wypłata Patryka</h2>
            <p>{periodLabel(period)} — kwota tylko dla tego okresu.</p>
          </div>
          <Button tone="ghost" onClick={() => open({ type: "patryk" })}>
            {data.income === null ? "Wpisz wypłatę" : "Edytuj wypłatę"}
          </Button>
        </div>
        <div className="patryk-salary">
          {data.income === null ? (
            <span className="muted">Jeszcze nieuzupełniona</span>
          ) : (
            <Money value={data.income} />
          )}
        </div>
        {(data.month?.note || data.legacy?.note) && (
          <div className="patryk-income-note">
            <NoteTooltip
              name="Wypłata Patryka"
              note={data.month?.note || data.legacy?.note || ""}
            />
          </div>
        )}
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Wydatki Patryka</h2>
            <p>
              Części z Domu pojawiają się automatycznie. Pozostałe wpisujesz
              poniżej.
            </p>
          </div>
          <Button onClick={() => open({ type: "patrykExpense" })}>
            <Plus size={16} />
            Dodaj wydatek
          </Button>
        </div>
        {data.rows.length ? (
          data.rows.map((row) => {
            const previous = row.recurring
              ? patrykComparison(
                  state,
                  period,
                  row.id,
                  row.source,
                  row.row?.templateId,
                )
              : undefined;
            const delta = previous ? row.amount - previous.amount : null;
            const comparison = previous
              ? `Poprzedni okres: ${money(previous.amount)}. Teraz: ${money(row.amount)}. ${delta === 0 ? "Kwota bez zmian." : `Zmiana: ${money(delta!)}.`}`
              : "Pozycja nie występowała w poprzednim okresie. Przy opłacie co dwa miesiące poprzedni miesiąc może być bez rachunku.";
            return (
              <div className="patryk-expense-row" key={row.id}>
                <div className="row-name">
                  <div className="row-title">
                    <strong>{row.name}</strong>
                    {row.note && (
                      <NoteTooltip name={row.name} note={row.note} />
                    )}{" "}
                    {row.recurring && (
                      <NoteTooltip
                        name={row.name}
                        label={`Porównanie kwoty: ${row.name}`}
                        note={comparison}
                      >
                        {delta === null || delta === 0 ? (
                          <Minus size={14} />
                        ) : delta > 0 ? (
                          <ArrowUp size={14} />
                        ) : (
                          <ArrowDown size={14} />
                        )}
                      </NoteTooltip>
                    )}
                  </div>
                  <div className="row-meta">
                    <span>
                      {row.source === "home"
                        ? "Z Domu"
                        : row.recurring
                          ? "Powtarzana"
                          : "Jednorazowa"}
                    </span>
                  </div>
                </div>
                <Money value={row.amount} />
                <div className="row-actions">
                  {row.source === "own" && row.row && (
                    <>
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label={`Edytuj wydatek Patryka: ${row.name}`}
                        onClick={() =>
                          open({ type: "patrykExpense", row: row.row })
                        }
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label={`${row.recurring ? "Zakończ" : "Usuń"} wydatek Patryka: ${row.name}`}
                        onClick={() =>
                          confirm(
                            row.recurring
                              ? "Zakończyć powtarzanie wydatku?"
                              : "Usunąć wydatek?",
                            <p>
                              {row.recurring
                                ? `„${row.name}” zniknie od okresu ${periodLabel(period)} we wszystkich kolejnych. Wcześniejsze okresy pozostaną w historii.`
                                : `„${row.name}” zostanie usunięty tylko z tego okresu.`}
                            </p>,
                            {
                              type: "deletePatrykExpense",
                              rowId: row.row!.id,
                              period,
                            },
                            row.recurring
                              ? "Zakończ powtarzanie"
                              : "Usuń wydatek",
                            true,
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  {row.source === "home" && (
                    <span className="muted patryk-source-label">
                      Edytuj w Dom
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <Empty title="Dodaj inne wydatki Patryka">
            Wystarczą tytuł, kwota i zaznaczenie, czy powtarzać w następnych
            miesiącach.
          </Empty>
        )}
        {data.useLegacy && (
          <p className="stats-footnote">
            To suma ze starego podsumowania. Możesz przejść na szczegółową listę
            Dom + inne wydatki. Stara suma zostanie zachowana w danych.{" "}
            <Button
              tone="ghost"
              onClick={() => run({ type: "enablePatrykDetails", period })}
            >
              Użyj szczegółowej listy
            </Button>
          </p>
        )}
      </section>
      <div className="budget-totals">
        <span>
          Wydatki łącznie <Money value={data.total} />
        </span>
        {data.income !== null && (
          <strong>
            Pozostaje z wypłaty <Money value={data.income - data.total} />
          </strong>
        )}
      </div>
      <p className="hint">
        Strzałka przy powtarzanej pozycji pokazuje zmianę względem poprzedniego
        okresu. Najedź lub dotknij, aby zobaczyć poprzednią kwotę. Oszczędności
        uzupełnisz osobno, także później.
      </p>
    </div>
  );
}
