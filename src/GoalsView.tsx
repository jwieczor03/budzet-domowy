import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { rowsForPeriod } from "../server/domain.mjs";
import { Button, Editor, Empty, Field, Money } from "./components";
import { periodLabel } from "./format";
import { goalKey, goalMember, periodGoals } from "./goals";
import type { GoalGroup, GoalMember, State } from "./types";
import type { Dialog } from "./dialogs";
import type { Act } from "./forms";

export function GoalGroupForm({
  state,
  period,
  existing,
  close,
  act,
}: {
  state: State;
  period: string;
  existing?: GoalGroup;
  close: () => void;
  act: Act;
}) {
  const [id] = useState(existing?.id || crypto.randomUUID());
  const [name, setName] = useState(existing?.name || "");
  const [members, setMembers] = useState<GoalMember[]>(existing?.members || []);
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const options = rowsForPeriod(state, period)
    .filter((r) => r.source === "personal")
    .map((row) => ({
      key: goalKey(goalMember(row)),
      member: goalMember(row),
      name: row.name,
      amount: row.amount,
      current: true,
    }));
  for (const member of existing?.members || [])
    if (!options.some((o) => o.key === goalKey(member))) {
      const template = state.recurring.find((t) => t.id === member.ref);
      const row =
        state.expenses.find((r) => r.id === member.ref) ||
        state.settlements.find((s) => s.row.id === member.ref)?.row;
      options.push({
        key: goalKey(member),
        member,
        name:
          member.type === "template"
            ? template?.versions.at(-1)?.name || member.ref
            : row?.name || member.ref,
        amount: 0,
        current: false,
      });
    }
  const visible = options.filter((o) =>
    o.name.toLocaleLowerCase("pl").includes(query.toLocaleLowerCase("pl")),
  );
  const selected = new Set(members.map(goalKey));
  return (
    <Editor
      title={existing ? "Edytuj grupę" : "Dodaj grupę"}
      subtitle="Grupowanie nie zmienia kwot ani płatności. Stała pozycja pozostanie w grupie w kolejnych miesiącach."
      close={close}
      dirty={dirty}
      onSubmit={async () => {
        await act({ type: "saveGoalGroup", group: { id, name, members } });
      }}
    >
      <Field
        label="Nazwa grupy"
        value={name}
        required
        maxLength={120}
        autoFocus
        placeholder="Np. Ogólne"
        onChange={(e) => {
          setDirty(true);
          setName(e.target.value);
        }}
      />
      <Field
        label="Szukaj pozycji do przypisania"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <fieldset className="goal-options">
        <legend>Pozycje w grupie · {periodLabel(period)}</legend>
        {visible.length ? (
          visible.map((option) => {
            const other = (state.goalGroups || []).find(
              (g) =>
                g.id !== id && g.members.some((m) => goalKey(m) === option.key),
            );
            return (
              <label className="goal-option" key={option.key}>
                <input
                  type="checkbox"
                  checked={selected.has(option.key)}
                  onChange={(e) => {
                    setDirty(true);
                    setMembers(
                      e.target.checked
                        ? [...members, option.member]
                        : members.filter((m) => goalKey(m) !== option.key),
                    );
                  }}
                />
                <span>
                  <strong>{option.name}</strong>
                  {!option.current && (
                    <small>Nie występuje w wybranym okresie</small>
                  )}
                  {other && (
                    <small>
                      Teraz: {other.name}. Zaznaczenie przeniesie tutaj.
                    </small>
                  )}
                </span>
                {option.current && <Money value={option.amount} />}
              </label>
            );
          })
        ) : (
          <p className="hint">
            {query
              ? "Brak pasujących pozycji."
              : "Najpierw dodaj wydatki do rozliczenia. Grupę możesz zapisać pustą."}
          </p>
        )}
      </fieldset>
      <p className="hint">
        Jedna pozycja należy do jednej grupy. Zmiana przypisania dotyczy
        wszystkich okresów; kwoty zawsze wynikają z planu danego miesiąca.
      </p>
    </Editor>
  );
}

export default function GoalsView({
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
  const result = periodGoals(state, period);
  return (
    <div className="goals-view">
      <div className="section-title standalone">
        <p className="hint">
          Porównaj poniższe kwoty z celami w banku po wykonaniu przelewów. To
          suma przypisanych pozycji w planie tego okresu — bez pozostałości z
          poprzedniego miesiąca i bez odejmowania bieżących zakupów.
        </p>
        <Button disabled={busy} onClick={() => open({ type: "goalGroup" })}>
          <Plus size={17} />
          Dodaj grupę
        </Button>
      </div>
      {result.groups.length ? (
        <>
          <div className="goal-grid">
            {result.groups.map((group) => (
              <section className="panel" key={group.id}>
                <div className="section-title">
                  <h2>{group.name}</h2>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      disabled={busy}
                      aria-label={`Edytuj grupę: ${group.name}`}
                      onClick={() => open({ type: "goalGroup", group })}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={busy}
                      aria-label={`Usuń grupę: ${group.name}`}
                      onClick={() =>
                        open({
                          type: "confirm",
                          title: "Usunąć grupę?",
                          body: (
                            <p>
                              Grupa „{group.name}” zostanie usunięta we
                              wszystkich okresach. Wydatki pozostaną w budżecie
                              i trafią do pozycji nieprzypisanych.
                            </p>
                          ),
                          label: "Usuń grupę",
                          danger: true,
                          perform: () =>
                            act({ type: "deleteGoalGroup", groupId: group.id }),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="goal-expected">
                  <span>Powinno być na celu</span>
                  <Money value={group.total} />
                </div>
                {group.items.length ? (
                  <ul className="goal-items">
                    {group.items.map((row) => (
                      <li key={row.id}>
                        <span>{row.name}</span>
                        <Money value={row.amount} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="goal-empty">
                    Brak przypisanych pozycji w tym okresie.
                  </p>
                )}
              </section>
            ))}
          </div>
          <div className="budget-totals">
            <strong>
              Łącznie w grupach <Money value={result.total} />
            </strong>
          </div>
        </>
      ) : (
        <section className="panel">
          <Empty
            title="Zbierz przelewy w grupy"
            action={
              <Button onClick={() => open({ type: "goalGroup" })}>
                Dodaj pierwszą grupę
              </Button>
            }
          >
            Np. Subskrypcje, Jedzenie wspólne, Jedzenie osobiste, Ogólne i
            Wydatki niezaplanowane. Kwoty będą sumowane z przypisanych wydatków.
          </Empty>
        </section>
      )}
      {result.unassigned.length > 0 && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>
                Pozycje bez grupy{" "}
                <span className="count">{result.unassigned.length}</span>
              </h2>
              <p>
                Nie zwiększają żadnego celu. Mogą pozostać tutaj, np. raty
                opłacane bezpośrednio.
              </p>
            </div>
          </div>
          <ul className="goal-items">
            {result.unassigned.map((row) => (
              <li key={row.id}>
                <span>{row.name}</span>
                <Money value={row.amount} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
