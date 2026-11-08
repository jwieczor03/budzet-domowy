import { useState } from "react";
import {
  currentPeriod,
  money,
  parseMoney,
  patrykSavingsBalance,
  shiftPeriod,
  today,
} from "../server/domain.mjs";
import {
  amountInput,
  Editor,
  Field,
  NoteField,
  positiveAmount,
  Select,
} from "./components";
import { patrykPeriod } from "./patryk";
import type { PatrykExpense, State } from "./types";
import type { Act } from "./forms";
import { periodLabel } from "./format";
export function PatrykIncomeForm({
  state,
  period,
  close,
  act,
}: {
  state: State;
  period: string;
  close: () => void;
  act: Act;
}) {
  const data = patrykPeriod(state, period),
    [amount, setAmount] = useState(
      data.income === null ? "" : amountInput(data.income),
    ),
    [note, setNote] = useState(data.month?.note || data.legacy?.note || "");
  return (
    <Editor
      title="Wypłata Patryka"
      subtitle={`${periodLabel(period)} · Wpisz całą wypłatę z tego okresu. Kwota nie będzie kopiowana na kolejne miesiące.`}
      close={close}
      dirty={
        amount !== (data.income === null ? "" : amountInput(data.income)) ||
        note !== (data.month?.note || data.legacy?.note || "")
      }
      onSubmit={async () => {
        const income = parseMoney(amount);
        if (income < 0) throw new Error("Wypłata nie może być ujemna.");
        await act({ type: "savePatrykIncome", period, income, note });
      }}
    >
      <Field
        label="Wypłata (zł)"
        value={amount}
        required
        inputMode="decimal"
        autoFocus
        onChange={(e) => setAmount(e.target.value)}
      />
      <NoteField value={note} onChange={setNote} />
    </Editor>
  );
}
export function PatrykExpenseForm({
  state,
  period,
  existing,
  close,
  act,
}: {
  state: State;
  period: string;
  existing?: PatrykExpense;
  close: () => void;
  act: Act;
}) {
  const [id] = useState(existing?.id || crypto.randomUUID()),
    [name, setName] = useState(existing?.name || ""),
    [amount, setAmount] = useState(
      existing ? amountInput(existing.amount) : "",
    ),
    [recurring, setRecurring] = useState(!!existing?.templateId);
  const [dirty, setDirty] = useState(false),
    change = (fn: () => void) => {
      setDirty(true);
      fn();
    };
  return (
    <Editor
      title={existing ? "Edytuj wydatek Patryka" : "Dodaj wydatek Patryka"}
      subtitle={`${periodLabel(period)} · Stała pozycja powtarza się, a jej zmiana obowiązuje od wybranego okresu dalej.`}
      close={close}
      dirty={dirty}
      onSubmit={async () => {
        await act({
          type: "savePatrykExpense",
          recurring,
          row: {
            id,
            period,
            name,
            amount: positiveAmount(amount),
            ...(existing?.templateId
              ? { templateId: existing.templateId }
              : {}),
          },
        });
      }}
    >
      <Field
        label="Tytuł"
        value={name}
        required
        maxLength={120}
        autoFocus
        onChange={(e) => change(() => setName(e.target.value))}
      />
      <Field
        label="Kwota (zł)"
        value={amount}
        required
        inputMode="decimal"
        onChange={(e) => change(() => setAmount(e.target.value))}
      />
      <label className="check-label">
        <input
          type="checkbox"
          checked={recurring}
          disabled={!!existing?.templateId}
          onChange={(e) => change(() => setRecurring(e.target.checked))}
        />
        Przenoś na kolejne miesiące
      </label>
      {existing?.templateId && (
        <p className="hint">
          Aby zakończyć powtarzanie, użyj „Zakończ” przy pozycji na liście.
        </p>
      )}
      {patrykPeriod(state, period).useLegacy && (
        <p className="hint">
          Po zapisaniu w tym okresie użyjemy listy: części Patryka z Domu i
          dodane wydatki. Stare łączne podsumowanie pozostanie zachowane w
          danych.
        </p>
      )}
    </Editor>
  );
}
export function PatrykSavingsForm({
  state,
  period,
  kind,
  close,
  act,
}: {
  state: State;
  period: string;
  kind: "deposit" | "withdrawal" | "correction";
  close: () => void;
  act: Act;
}) {
  const balance = patrykSavingsBalance(state),
    [amount, setAmount] = useState(
      kind === "correction" ? amountInput(balance) : "",
    ),
    [assigned, setAssigned] = useState(
      period > currentPeriod() ? currentPeriod() : period,
    ),
    [date, setDate] = useState(today()),
    [note, setNote] = useState(""),
    [dirty, setDirty] = useState(false),
    change = (fn: () => void) => {
      setDirty(true);
      fn();
    };
  const openingPeriod =
    state.patrykSavingsOpeningPeriod ||
    [...state.patryk]
      .filter((p) => p.period <= currentPeriod())
      .sort((a, b) => a.period.localeCompare(b.period))
      .at(-1)?.period;
  const [alreadyIncluded, setAlreadyIncluded] = useState(
    !!openingPeriod && assigned <= openingPeriod,
  );
  const periods = [
    ...new Set([
      assigned,
      ...Array.from({ length: 24 }, (_, i) => shiftPeriod(currentPeriod(), -i)),
    ]),
  ]
    .sort()
    .reverse();
  return (
    <Editor
      title={
        kind === "correction"
          ? "Ustaw saldo oszczędności Patryka"
          : kind === "deposit"
            ? "Wpłata na oszczędności Patryka"
            : "Wypłata z oszczędności Patryka"
      }
      subtitle={`Aktualny stan: ${money(balance)}. Dane informacyjne, bez wpływu na Twój budżet.`}
      close={close}
      dirty={dirty}
      onSubmit={async () => {
        if (kind === "correction") {
          const target = parseMoney(amount);
          if (target < 0) throw new Error("Saldo nie może być ujemne.");
          await act({
            type: "patrykCorrectSavings",
            period: assigned,
            date,
            balance: target,
            note,
          });
        } else
          await act({
            type: "patrykMovement",
            period: assigned,
            date,
            kind,
            alreadyIncluded,
            amount: positiveAmount(amount),
            note,
          });
      }}
    >
      <Field
        label={kind === "correction" ? "Aktualne saldo (zł)" : "Kwota (zł)"}
        value={amount}
        required
        inputMode="decimal"
        autoFocus
        onChange={(e) => change(() => setAmount(e.target.value))}
      />
      <Select
        label="Którego miesiąca dotyczy?"
        value={assigned}
        onChange={(v) =>
          change(() => {
            setAssigned(v);
            setAlreadyIncluded(!!openingPeriod && v <= openingPeriod);
          })
        }
      >
        {periods.map((p) => (
          <option key={p} value={p}>
            {periodLabel(p)}
          </option>
        ))}
      </Select>
      <Field
        label="Data wpisywanego ruchu"
        type="date"
        value={date}
        required
        max={today()}
        onChange={(e) => change(() => setDate(e.target.value))}
      />
      <p className="hint">
        Możesz uzupełnić listopad w grudniu — wybierz listopad powyżej. Korekta
        salda nie liczy się jako odłożone pieniądze. Po dodaniu ruchu ponownie
        oznacz miesiąc jako uzupełniony.
      </p>
      {kind !== "correction" && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={alreadyIncluded}
            onChange={(e) => change(() => setAlreadyIncluded(e.target.checked))}
          />
          Historyczny ruch już uwzględniony w obecnym saldzie — dopisz tylko do
          historii i średniej
        </label>
      )}
      <NoteField value={note} onChange={(v) => change(() => setNote(v))} />
    </Editor>
  );
}
