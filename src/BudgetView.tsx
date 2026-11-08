import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Leaf,
  ListChecks,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  balances,
  currentPeriod,
  money,
  overdueRows,
  rowsForPeriod,
  summary,
  today,
} from "../server/domain.mjs";
import { Button, Empty, Money, NoteTooltip } from "./components";
import { categories, destinations, type Row, type State } from "./types";
import { Ledger } from "./secondary";
import { prettyDate, periodLabel } from "./format";
import type { Dialog } from "./dialogs";
import type { Act } from "./forms";
export default function BudgetView({
  state,
  period,
  household,
  busy,
  open: setDialog,
  act,
}: {
  state: State;
  period: string;
  household: boolean;
  busy: boolean;
  open: (dialog: Dialog) => void;
  act: Act;
}) {
  const page = household ? "home" : "budget";
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const balance = balances(state);
  const sum = summary(state, period);
  const rows = rowsForPeriod(state, period);
  const late = overdueRows(state);
  const confirm = (
    title: string,
    body: React.ReactNode,
    action: object,
    label: string,
    danger = false,
  ) =>
    setDialog({
      type: "confirm",
      title,
      body,
      label,
      danger,
      perform: () => act(action),
    });
  const settle = (row: Row) => {
    const done = state!.settlements.some((s) => s.row.id === row.id);
    void act({
      type: "settle",
      rowId: row.id,
      period: row.period,
      settled: !done,
    }).catch(() => {
      /* Shared error banner preserves the failed operation for retry. */
    });
  };
  const deleteRow = (row: Row) =>
    confirm(
      row.templateId ? "Zakończyć stałą pozycję?" : "Usunąć pozycję?",
      <>
        <p>
          <strong>{row.name}</strong> · <Money value={row.amount} />
        </p>
        <p>
          {row.templateId
            ? `Pozycja zniknie z planu od okresu ${periodLabel(row.period)} i we wszystkich kolejnych. Rozliczona historia pozostanie zachowana.`
            : "Pozycja zostanie usunięta tylko z tego okresu."}
        </p>
      </>,
      {
        type: "deleteExpense",
        rowId: row.id,
        period: row.period,
        scope: row.templateId ? "future" : "one",
      },
      row.templateId ? "Zakończ pozycję" : "Usuń pozycję",
      true,
    );
  const renderRows = (list: Row[]) => (
    <div className="expense-list">
      {list.map((row) => {
        const done = !!state!.settlements.find((s) => s.row.id === row.id);
        const isLate =
          !done &&
          ((row.dueDate && row.dueDate < today()) ||
            row.period < currentPeriod());
        return (
          <div className={`expense-row ${done ? "is-done" : ""}`} key={row.id}>
            <button
              className={`settle-check ${done ? "checked" : ""}`}
              disabled={
                busy || row.amount === 0 || row.period > currentPeriod()
              }
              onClick={() => settle(row)}
              aria-label={`${done ? "Cofnij rozdysponowanie" : "Oznacz jako rozdysponowane"}: ${row.name}`}
              aria-pressed={done}
            >
              {done ? <Check size={17} /> : <span />}
            </button>
            <div className="row-name">
              <div className="row-title">
                <strong>{row.name}</strong>
                {row.note && <NoteTooltip note={row.note} name={row.name} />}
              </div>
              <div className="row-meta">
                <span>{categories[row.category] || row.category}</span>
                <span>{row.templateId ? "Stała" : "Jednorazowa"}</span>
                {row.source === "shared" ? (
                  <span>Ze wspólnego konta</span>
                ) : row.household ? (
                  <span>Twoja część</span>
                ) : null}
                {row.fundingAccount && <span>Z oszczędności</span>}
                {row.dueDate && (
                  <span className={isLate ? "late-text" : ""}>
                    {isLate ? "Po terminie · " : "Do "}
                    {prettyDate(row.dueDate)}
                  </span>
                )}
              </div>
            </div>
            <div className="row-amount">
              <Money value={row.amount} />
              <span
                className={
                  done ? "status-done" : isLate ? "late-text" : "muted"
                }
              >
                {row.amount === 0
                  ? "Pula wykorzystana"
                  : done
                    ? "Rozdysponowane"
                    : isLate
                      ? "Wymaga zapłaty"
                      : "Do rozdysponowania"}
              </span>
            </div>
            <div className="row-actions">
              <button
                className="icon-button"
                disabled={busy || done}
                title={done ? "Najpierw cofnij rozdysponowanie" : "Edytuj"}
                aria-label={`Edytuj: ${row.name}`}
                onClick={() => setDialog({ type: "expense", row })}
              >
                <Pencil size={16} />
              </button>
              <button
                className="icon-button"
                disabled={busy || done}
                title={row.templateId ? "Zakończ stałą pozycję" : "Usuń"}
                aria-label={`${row.templateId ? "Zakończ" : "Usuń"}: ${row.name}`}
                onClick={() => deleteRow(row)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
  const list = rows
    .filter((r) =>
      page === "home"
        ? r.household || r.source === "shared" || r.kind === "sharedDeposit"
        : r.source === "personal",
    )
    .filter((r) => {
      const done =
        r.amount === 0 || state!.settlements.some((s) => s.row.id === r.id);
      return (
        (filter === "all" ||
          (filter === "pending" && !done) ||
          (filter === "done" && done) ||
          (filter === "fixed" && !!r.templateId)) &&
        `${r.name} ${r.note}`
          .toLocaleLowerCase("pl")
          .includes(query.toLocaleLowerCase("pl"))
      );
    });

  return (
    <>
      {(page === "budget" || page === "home") && (
        <>
          {page === "home" && (
            <div className="home-summary">
              <div>
                <p>Wspólne konto na nieplanowane</p>
                <Money value={balance.shared} className="large-money" />
                <small>Saldo po zapisanych wpłatach i wypłatach</small>
              </div>
              <div className="actions">
                <Button
                  tone="secondary"
                  onClick={() =>
                    setDialog({
                      type: "account",
                      account: "shared",
                      correction: true,
                    })
                  }
                >
                  <SlidersHorizontal size={17} />
                  Ustaw saldo
                </Button>
                <Button
                  tone="secondary"
                  onClick={() =>
                    setDialog({
                      type: "expense",
                      shared: true,
                      transfer: true,
                      category: "dom",
                    })
                  }
                >
                  Moja wpłata z budżetu
                </Button>
                <Button
                  onClick={() =>
                    setDialog({ type: "account", account: "shared" })
                  }
                >
                  <Plus size={17} />
                  Wpłata / wypłata
                </Button>
              </div>
            </div>
          )}
          {page === "budget" && late.length > 0 && (
            <section className="overdue">
              <div className="section-title">
                <h2>
                  <CircleAlert size={19} />
                  Wymaga zapłaty <span className="count">{late.length}</span>
                </h2>
                <span>Bez przenoszenia między okresami</span>
              </div>
              {renderRows(late)}
            </section>
          )}
          <div className="content-columns">
            <div className="primary-column">
              {page === "budget" && (
                <section className="panel income-panel">
                  <div className="section-title">
                    <h2>Wpływy</h2>
                    <Button
                      tone="ghost"
                      onClick={() => setDialog({ type: "income" })}
                    >
                      <Plus size={17} />
                      Dodaj wpływ
                    </Button>
                  </div>
                  {state.incomes.filter((i) => i.period === period).length ? (
                    state.incomes
                      .filter((i) => i.period === period)
                      .map((inc) => (
                        <div className="income-row" key={inc.id}>
                          <span className="income-symbol">
                            <ArrowDownLeft size={19} />
                          </span>
                          <div className="row-name">
                            <strong>{inc.name}</strong>
                            <div className="row-meta">
                              <span>
                                {inc.received ? "Otrzymany" : "Planowany"}
                              </span>
                              <span>{prettyDate(inc.date)}</span>
                            </div>
                            <p className="row-note">
                              {inc.splits
                                .map(
                                  (s) =>
                                    `${destinations[s.destination]}: ${money(s.amount)}`,
                                )
                                .join(" · ")}
                            </p>
                          </div>
                          <Money value={inc.amount} />
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              aria-label={`Edytuj wpływ: ${inc.name}`}
                              onClick={() =>
                                setDialog({ type: "income", income: inc })
                              }
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Usuń wpływ: ${inc.name}`}
                              onClick={() =>
                                confirm(
                                  "Usunąć wpływ?",
                                  <p>
                                    Usunięcie „{inc.name}” cofnie również jego
                                    bezpośrednie wpłaty na oszczędności i spłaty
                                    zobowiązań.
                                  </p>,
                                  {
                                    type: "deleteIncome",
                                    incomeId: inc.id,
                                  },
                                  "Usuń wpływ",
                                  true,
                                )
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="inline-empty">
                      <ArrowDownLeft size={22} />
                      <p>
                        Dodaj wypłatę lub inny wpływ.
                        <small>
                          Ty decydujesz, jaka część zasili ten budżet.
                        </small>
                      </p>
                    </div>
                  )}
                </section>
              )}
              {page === "budget" && (
                <div className="fixed-shortcut">
                  <a href={`?view=fixed&period=${period}`}>
                    Edytuj subskrypcje i stałe zobowiązania{" "}
                    <ArrowRight size={16} />
                  </a>
                  <span>Jedna lista dla kolejnych miesięcy</span>
                </div>
              )}
              <section className="panel">
                <div className="section-title">
                  <div>
                    <h2>
                      {page === "home" ? "Wspólne wydatki" : "Wydatki i cele"}{" "}
                      <span className="count">{list.length}</span>
                    </h2>
                    <p>
                      {page === "home"
                        ? "Twoja część lub płatność ze wspólnego konta."
                        : "Zaznacz, gdy zapłacisz lub przekażesz środki."}
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      setDialog({
                        type: "expense",
                        shared: page === "home",
                      })
                    }
                  >
                    <Plus size={17} />
                    Dodaj wydatek
                  </Button>
                </div>
                <div className="list-toolbar">
                  <div className="filter-tabs" aria-label="Filtr pozycji">
                    {[
                      ["all", "Wszystkie"],
                      ["pending", "Do rozliczenia"],
                      ["done", "Rozdysponowane"],
                      ["fixed", "Stałe"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setFilter(value)}
                        className={filter === value ? "selected" : ""}
                        aria-pressed={filter === value}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="search">
                    <Search size={16} aria-hidden="true" />
                    <input
                      aria-label="Szukaj pozycji"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Szukaj"
                    />
                    {query && (
                      <button
                        className="icon-button"
                        aria-label="Wyczyść wyszukiwanie"
                        onClick={(e) => {
                          setQuery("");
                          (
                            e.currentTarget
                              .previousElementSibling as HTMLInputElement
                          )?.focus();
                        }}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>
                {list.length ? (
                  renderRows(list)
                ) : (
                  <Empty
                    title={
                      query || filter !== "all"
                        ? "Brak pasujących pozycji"
                        : "Rozpisz swój miesiąc"
                    }
                    icon={<ListChecks size={26} />}
                    action={
                      query || filter !== "all" ? (
                        <Button
                          tone="secondary"
                          onClick={() => {
                            setFilter("all");
                            setQuery("");
                          }}
                        >
                          Pokaż wszystkie
                        </Button>
                      ) : (
                        <Button
                          tone="secondary"
                          onClick={() =>
                            setDialog({
                              type: "expense",
                              shared: page === "home",
                            })
                          }
                        >
                          <Plus size={17} />
                          Dodaj pierwszy wydatek
                        </Button>
                      )
                    }
                  >
                    {query || filter !== "all"
                      ? "Zmień filtr lub wyczyść wyszukiwanie."
                      : "Stałe wydatki przejdą na kolejne okresy. Jednorazowe zostaną tylko tutaj."}
                  </Empty>
                )}
              </section>
              {page === "budget" && (
                <div className="budget-totals" aria-label="Podsumowanie planu">
                  <span>
                    Wpływy do budżetu <Money value={sum.income} />
                  </span>
                  <span>
                    Wydatki i cele <Money value={sum.planned} />
                  </span>
                  <strong className={sum.remaining < 0 ? "late-text" : ""}>
                    Pozostaje <Money value={sum.remaining} />
                  </strong>
                </div>
              )}
              {page === "home" && (
                <Ledger
                  state={state}
                  account="shared"
                  act={act}
                  confirm={confirm}
                />
              )}
            </div>
            <aside className="context-column">
              <section className="savings-aside">
                <div className="aside-icon">
                  <Leaf size={22} />
                </div>
                <h2>
                  {page === "home"
                    ? "Własna wpłata, jeden zapis."
                    : "Reszta pracuje na przyszłość."}
                </h2>
                <p>
                  {page === "home"
                    ? "Wybierz „Moja wpłata z budżetu”, a potem oznacz ją jako rozdysponowaną. Zapis obciąży Twój budżet i zasili wspólne konto."
                    : "Najpierw uzupełnij rezerwę, potem przeznacz pełne setki na obligacje."}
                </p>
                {page === "budget" && (
                  <>
                    <div className="summary-line">
                      <span>Rezerwa</span>
                      <Money value={balance.savings} />
                    </div>
                    <div className="summary-line">
                      <span>Cel rezerwy</span>
                      <Money value={state.settings.reserveTarget} />
                    </div>
                    <Button
                      tone="secondary"
                      disabled={sum!.remaining <= 0}
                      onClick={() => setDialog({ type: "allocate" })}
                    >
                      Zaplanuj nadwyżkę
                      <ArrowRight size={17} />
                    </Button>
                  </>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
