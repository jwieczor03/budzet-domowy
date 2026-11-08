import { useState } from "react";
import {
  currentPeriod,
  parseMoney,
  rowsForPeriod,
  shiftPeriod,
  today,
} from "../server/domain.mjs";
import {
  Editor,
  Field,
  Money,
  NoteField,
  positiveAmount,
  Select,
  amountInput,
} from "./components";
import { categories, type HouseholdCost, type State } from "./types";
import type { Act } from "./forms";
import { periodLabel } from "./format";
export function SharedEntryForm({
  close,
  act,
  kind,
}: {
  close: () => void;
  act: Act;
  kind: "deposit" | "withdrawal";
}) {
  const [name, setName] = useState(""),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(today()),
    [note, setNote] = useState("");
  return (
    <Editor
      title={
        kind === "deposit"
          ? "Dodaj wpływ na wspólne konto"
          : "Dodaj wydatek ze wspólnego konta"
      }
      subtitle="Zapis historyczny. Saldo wspólnego konta zmieni się od razu, bez dodawania pozycji do własnego budżetu."
      close={close}
      dirty={!!name || !!amount || !!note || date !== today()}
      onSubmit={async () => {
        await act({
          type: "transaction",
          account: "shared",
          kind,
          name,
          amount: positiveAmount(amount),
          date,
          note,
        });
      }}
    >
      <Field
        label="Nazwa"
        value={name}
        required
        autoFocus
        maxLength={120}
        placeholder={
          kind === "deposit" ? "Np. wpłata Patryka" : "Np. naprawa pralki"
        }
        onChange={(e) => setName(e.target.value)}
      />
      <Field
        label="Kwota (zł)"
        value={amount}
        required
        inputMode="decimal"
        onChange={(e) => setAmount(e.target.value)}
      />
      <Field
        label="Data"
        type="date"
        value={date}
        max={today()}
        required
        onChange={(e) => setDate(e.target.value)}
      />
      <NoteField value={note} onChange={setNote} />
    </Editor>
  );
}
export function HouseholdCostForm({
  state,
  period,
  close,
  act,
  existing,
  templateId: initialTemplate,
}: {
  state: State;
  period: string;
  close: () => void;
  act: Act;
  existing?: HouseholdCost;
  templateId?: string;
}) {
  const [id] = useState(existing?.id || crypto.randomUUID());
  const base =
    existing?.versions
      .filter((v) => v.from <= period)
      .sort((a, b) => a.from.localeCompare(b.from))
      .at(-1) || existing?.versions[0];
  const linked = state.recurring.find(
    (t) => t.id === (existing?.templateId || initialTemplate),
  );
  const linkedVersion = linked?.versions
    .filter((v) => v.from <= period)
    .sort((a, b) => a.from.localeCompare(b.from))
    .at(-1);
  const monthlyRow = rowsForPeriod(state, period).find(
    (r) => r.templateId === (existing?.templateId || initialTemplate),
  );
  const [templateId, setTemplateId] = useState(
    existing?.templateId || initialTemplate || "",
  );
  const [name, setName] = useState(base?.name || linkedVersion?.name || ""),
    [own, setOwn] = useState(
      monthlyRow
        ? amountInput(monthlyRow.amount)
        : base
          ? amountInput(base.own)
          : linkedVersion
            ? amountInput(linkedVersion.amount)
            : "",
    ),
    [partner, setPartner] = useState(base ? amountInput(base.partner) : "");
  const [category, setCategory] = useState(
      base?.category || linkedVersion?.category || "dom",
    ),
    [note, setNote] = useState(base?.note || linkedVersion?.note || ""),
    [cycle, setCycle] = useState(String(base?.everyMonths || 1));
  const [from, setFrom] = useState(period),
    [day, setDay] = useState(
      base?.dueDay
        ? String(base.dueDay)
        : linkedVersion?.dueDay
          ? String(linkedVersion.dueDay)
          : "",
    );
  const [estimated, setEstimated] = useState(base?.estimated ?? true),
    [dirty, setDirty] = useState(false),
    [scope, setScope] = useState("future");
  const change = (fn: () => void) => {
    setDirty(true);
    fn();
  };
  const choices = state.recurring.filter(
    (t) =>
      !state.householdCosts?.some((c) => c.templateId === t.id) &&
      t.versions.every(
        (v) => v.source === "personal" && v.kind === "expense" && !v.stopped,
      ),
  );
  let preview = 0;
  try {
    preview = parseMoney(own || "0") + parseMoney(partner || "0");
  } catch {
    /* Input validation happens on save. */
  }
  return (
    <Editor
      title={existing ? "Edytuj podział kosztu" : "Dodaj wspólny koszt"}
      subtitle="Twoja część pojawi się w Twoich stałych pozycjach i planach. To podział kosztu, niezależny od historii wspólnego konta."
      close={close}
      dirty={dirty}
      onSubmit={async () => {
        if (day && (!/^\d{1,2}$/.test(day) || +day < 1 || +day > 31))
          throw new Error("Podaj dzień płatności od 1 do 31.");
        const my = parseMoney(own),
          his = parseMoney(partner);
        if (my < 0 || his < 0 || my + his <= 0)
          throw new Error("Wpisz nieujemne części i dodatnią sumę.");
        const anchor = base && +cycle === base.everyMonths ? base.anchor : from;
        await act({
          type: "saveHouseholdCost",
          id,
          ...(templateId ? { templateId } : {}),
          scope,
          version: {
            from,
            name,
            own: my,
            partner: his,
            category,
            note,
            everyMonths: +cycle,
            anchor,
            ...(day ? { dueDay: +day } : {}),
            estimated,
            stopped: false,
          },
        });
      }}
    >
      {!existing && (
        <Select
          label="Moja pozycja w stałych"
          value={templateId}
          onChange={(value) =>
            change(() => {
              setTemplateId(value);
              const version = state.recurring
                .find((t) => t.id === value)
                ?.versions.filter((v) => v.from <= from)
                .sort((a, b) => a.from.localeCompare(b.from))
                .at(-1);
              if (version) {
                setName(version.name);
                setOwn(
                  amountInput(
                    rowsForPeriod(state, period).find(
                      (r) => r.templateId === value,
                    )?.amount ?? version.amount,
                  ),
                );
                setCategory(version.category);
                setNote(version.note);
                setDay(version.dueDay ? String(version.dueDay) : "");
              }
            })
          }
        >
          <option value="">Utwórz nową pozycję</option>
          {choices.map((t) => (
            <option value={t.id} key={t.id}>
              {t.versions.at(-1)?.name}
            </option>
          ))}
        </Select>
      )}
      <Field
        label="Nazwa kosztu"
        value={name}
        required
        autoFocus
        maxLength={120}
        onChange={(e) => change(() => setName(e.target.value))}
      />
      <div className="form-grid">
        <Field
          label="Moja część (zł)"
          value={own}
          required
          inputMode="decimal"
          onChange={(e) => change(() => setOwn(e.target.value))}
        />
        <Field
          label="Część Patryka (zł)"
          value={partner}
          required
          inputMode="decimal"
          onChange={(e) => change(() => setPartner(e.target.value))}
        />
      </div>
      <div className="summary-line">
        <span>Pełna kwota</span>
        <Money value={preview} />
      </div>
      <Select
        label="Jak często płacimy?"
        value={cycle}
        onChange={(v) => change(() => setCycle(v))}
      >
        <option value="1">Co miesiąc</option>
        <option value="2">Co dwa miesiące</option>
      </Select>
      <Select
        label={existing ? "Zmiana od okresu" : "Pierwsza opłata w okresie"}
        value={from}
        onChange={(v) => change(() => setFrom(v))}
      >
        {[
          ...new Set([
            period,
            ...Array.from({ length: 4 }, (_, i) =>
              shiftPeriod(currentPeriod(), i),
            ),
          ]),
        ]
          .sort()
          .map((p) => (
            <option key={p} value={p}>
              {periodLabel(p)}
            </option>
          ))}
      </Select>
      {existing && (
        <Select
          label="Zakres zmiany"
          value={scope}
          onChange={(v) => change(() => setScope(v))}
        >
          <option value="future">Od tego okresu we wszystkich kolejnych</option>
          <option value="one">
            Tylko ten rachunek — potem wróć do wcześniejszego planu
          </option>
        </Select>
      )}
      <Field
        label="Dzień płatności (opcjonalnie)"
        value={day}
        inputMode="numeric"
        maxLength={2}
        onChange={(e) => change(() => setDay(e.target.value))}
      />
      <Select
        label="Kategoria"
        value={category}
        onChange={(v) => change(() => setCategory(v))}
      >
        {Object.entries({
          ...categories,
          [category]: categories[category] || category,
        }).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <label className="check-label">
        <input
          type="checkbox"
          checked={estimated}
          onChange={(e) => change(() => setEstimated(e.target.checked))}
        />
        Kwota szacowana — poprawię po otrzymaniu rachunku
      </label>
      <NoteField value={note} onChange={(v) => change(() => setNote(v))} />
    </Editor>
  );
}
