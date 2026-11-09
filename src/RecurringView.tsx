import { Fragment } from "react";
import { isSharedSubscription } from "./SubscriptionSummary";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  currentPeriod,
  rowsForPeriod,
  shiftPeriod,
} from "../server/domain.mjs";
import { Button, Empty, Money, NoteTooltip } from "./components";
import { categories, type State, type Row } from "./types";
import type { Dialog } from "./dialogs";
import type { Act } from "./forms";
import { periodLabel } from "./format";

export default function RecurringView({
  state,
  period,
  busy,
  open,
  act,
}: {
  state: State;
  period: string;
  busy: boolean;
  open: (dialog: Dialog) => void;
  act: Act;
}) {
  // The catalogue shows template values, independently of monthly exceptions and paid snapshots.
  const catalogue = {
    ...state,
    expenses: [],
    settlements: [],
    obligations: [],
  };
  const rows = rowsForPeriod(catalogue, period);
  const effectiveRow = (row: Row) => {
    let effective = row.period < currentPeriod() ? currentPeriod() : row.period;
    while (
      state.settlements.some(
        (s) => s.row.id === `${row.templateId}_${effective}`,
      )
    )
      effective = shiftPeriod(effective, 1);
    return rowsForPeriod(catalogue, effective).find(
      (r) => r.templateId === row.templateId,
    );
  };
  const stop = (row: Row) =>
    open({
      type: "confirm",
      title: "Zakończyć stałą pozycję?",
      body: (
        <p>
          „{row.name}” zniknie od okresu {periodLabel(row.period)} we wszystkich
          kolejnych miesiącach. Wcześniejsza historia pozostanie zachowana.
        </p>
      ),
      label: "Zakończ pozycję",
      danger: true,
      perform: () =>
        act({
          type: "deleteExpense",
          rowId: row.id,
          period: row.period,
          scope: "future",
        }),
    });
  return (
    <div className="recurring-catalogue">
      <p className="catalogue-help">
        Listy obowiązujące od okresu <strong>{periodLabel(period)}</strong>.
        Zmieniaj tu kwoty, dodawaj i kończ stałe pozycje. Rozliczone miesiące
        pozostają bez zmian.
      </p>
      <div className="recurring-columns">
        {[
          ["subskrypcje", "Subskrypcje"],
          ["other", "Stałe zobowiązania"],
        ].map(([group, title]) => {
          const list = rows.filter((r) =>
            group === "subskrypcje"
              ? r.category === "subskrypcje"
              : r.category !== "subskrypcje",
          );
          if (group === "subskrypcje")
            list.sort(
              (a, b) =>
                Number(isSharedSubscription(a)) -
                Number(isSharedSubscription(b)),
            );
          return (
            <section className="panel" key={group}>
              <div className="section-title">
                <h2>
                  {title} <span className="count">{list.length}</span>
                </h2>
                <Button
                  tone="ghost"
                  onClick={() =>
                    open({
                      type: "expense",
                      fixed: true,
                      category: group === "subskrypcje" ? "subskrypcje" : "dom",
                    })
                  }
                >
                  <Plus size={17} />
                  Dodaj
                </Button>
              </div>
              {list.length ? (
                <div className="expense-list">
                  {list.map((row, index) => {
                    const target = effectiveRow(row);
                    const sharedCost = state.householdCosts?.find(
                      (c) => c.templateId === row.templateId,
                    );
                    const paymentDay = state.recurring
                      .find((t) => t.id === row.templateId)
                      ?.versions.filter((v) => v.from <= period)
                      .sort((a, b) => a.from.localeCompare(b.from))
                      .at(-1)?.dueDay;
                    return (
                      <Fragment key={row.id}>
                        {group === "subskrypcje" &&
                          (index === 0 ||
                            isSharedSubscription(list[index - 1]) !==
                              isSharedSubscription(row)) && (
                            <h3 className="subscription-catalogue-heading">
                              {isSharedSubscription(row)
                                ? "Wspólne"
                                : "Prywatne"}
                              <Money
                                value={list
                                  .filter(
                                    (r) =>
                                      isSharedSubscription(r) ===
                                      isSharedSubscription(row),
                                  )
                                  .reduce((sum, r) => sum + r.amount, 0)}
                              />
                            </h3>
                          )}
                        <div className="catalogue-row">
                          <div className="row-name">
                            <div className="row-title">
                              <strong>{row.name}</strong>
                              {row.note && (
                                <NoteTooltip name={row.name} note={row.note} />
                              )}
                            </div>
                            <div className="row-meta">
                              <span>
                                {categories[row.category] || row.category}
                              </span>
                              <span>
                                {paymentDay
                                  ? `Płatność: ${paymentDay}. dzień miesiąca`
                                  : "Dzień płatności nieustalony"}
                              </span>
                              {row.source === "shared" && (
                                <span>Ze wspólnego konta</span>
                              )}
                            </div>
                            {target && target.period !== period && (
                              <p className="row-note">
                                Zmiany od: {periodLabel(target.period)}
                              </p>
                            )}
                          </div>
                          <Money value={row.amount} />
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              disabled={busy || (!target && !sharedCost)}
                              aria-label={`Edytuj stałą pozycję: ${row.name}`}
                              title={
                                target
                                  ? `Edytuj od ${periodLabel(target.period)}`
                                  : "Pozycja zakończona w kolejnych okresach"
                              }
                              onClick={() =>
                                sharedCost
                                  ? open({
                                      type: "householdCost",
                                      cost: sharedCost,
                                    })
                                  : target &&
                                    open({
                                      type: "expense",
                                      row: target,
                                      fixed: true,
                                    })
                              }
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button"
                              disabled={busy || !target || !!sharedCost}
                              title={
                                sharedCost
                                  ? "Zakończ w Dom → Podział kosztów"
                                  : undefined
                              }
                              aria-label={`Zakończ stałą pozycję: ${row.name}`}
                              onClick={() => target && stop(target)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  title={
                    group === "subskrypcje"
                      ? "Dodaj swoje subskrypcje"
                      : "Dodaj stałe zobowiązania"
                  }
                >
                  Wpisz nazwę i miesięczną kwotę. Pozycja pojawi się w kolejnych
                  okresach.
                </Empty>
              )}
              <div className="catalogue-total">
                <span>Razem na okres</span>
                <Money
                  value={list.reduce((total, row) => total + row.amount, 0)}
                />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
