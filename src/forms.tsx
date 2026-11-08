import { useState } from "react";
import { periodLabel } from "./format";
import { Plus, Trash2 } from "lucide-react";
import {
  currentPeriod,
  dueDate as recurringDueDate,
  parseMoney,
  periodBounds,
  money,
  today,
  shiftPeriod,
} from "../server/domain.mjs";
import {
  amountInput,
  Button,
  Editor,
  Field,
  Money,
  NoteField,
  positiveAmount,
  Select,
} from "./components";
import {
  categories,
  destinations,
  type Debt,
  type Category,
  type Income,
  type Row,
  type State,
} from "./types";

export type Act = (action: object) => Promise<void>;
type Base = { close: () => void; act: Act; state: State; period: string };
export function ExpenseForm({
  close,
  act,
  state,
  period,
  existing,
  shared = false,
  defaultDebtId,
  fixed = false,
  defaultCategory,
  transfer = false,
}: Base & {
  existing?: Row;
  shared?: boolean;
  defaultDebtId?: string;
  fixed?: boolean;
  defaultCategory?: string;
  transfer?: boolean;
}) {
  const [id] = useState(existing?.id || crypto.randomUUID());
  const [name, setName] = useState(
    existing?.name ||
      (transfer
        ? "Wpłata na wspólne konto"
        : defaultDebtId
          ? `Rata: ${state.obligations.find((d) => d.id === defaultDebtId)?.name || ""}`
          : ""),
  );
  const [amount, setAmount] = useState(
    existing ? amountInput(existing.amount) : "",
  );
  const [category, setCategory] = useState<Category>(
    existing?.category ||
      defaultCategory ||
      (defaultDebtId ? "raty" : shared ? "dom" : "osobiste"),
  );
  const source =
    existing?.source || (shared && !transfer ? "shared" : "personal");
  const kind =
    existing?.kind ||
    (transfer ? "sharedDeposit" : defaultDebtId ? "debt" : "expense");
  const debtId = existing?.debtId || defaultDebtId;
  const recurring = !!existing?.templateId || !!defaultDebtId || fixed;
  const scheduleForm = fixed || !!defaultDebtId;
  const scope = scheduleForm ? "future" : "one";
  const dueDate = existing?.dueDate || "";
  const templateDay = existing?.templateId
    ? [
        ...(state.recurring.find((t) => t.id === existing.templateId)
          ?.versions || []),
      ]
        .filter((v) => v.from <= period)
        .sort((a, b) => a.from.localeCompare(b.from))
        .at(-1)?.dueDay
    : undefined;
  const [paymentDay, setPaymentDay] = useState(
    templateDay
      ? String(templateDay)
      : existing?.dueDate?.slice(8).replace(/^0/, "") || "",
  );
  const [note, setNote] = useState(existing?.note || "");
  const household = existing?.household ?? shared;
  const [customCategory, setCustomCategory] = useState("");
  const categoryOptions = {
    ...categories,
    ...Object.fromEntries(
      [
        ...new Set([
          ...state.expenses.map((r) => r.category),
          ...state.recurring.flatMap((t) => t.versions.map((v) => v.category)),
        ]),
      ]
        .filter((v) => !categories[v])
        .map((v) => [v, v]),
    ),
  };
  const [dirty, setDirty] = useState(false);
  const change = (fn: () => void) => {
    setDirty(true);
    fn();
  };
  return (
    <Editor
      title={
        existing
          ? "Edytuj pozycję"
          : transfer
            ? "Wpłata na wspólne konto"
            : fixed
              ? "Dodaj stałą pozycję"
              : defaultDebtId
                ? "Zaplanuj ratę"
                : shared
                  ? "Dodaj wspólny wydatek"
                  : "Dodaj wydatek"
      }
      subtitle={
        scheduleForm
          ? `Od okresu ${periodLabel(period)} we wszystkich kolejnych. Wcześniejsza historia pozostaje bez zmian.`
          : `${periodLabel(period)} · ${source === "shared" ? "Wydatek ze wspólnego konta." : "Wydatek z Twojego budżetu."}`
      }
      close={close}
      dirty={dirty}
      onSubmit={async () => {
        if (
          scheduleForm &&
          paymentDay &&
          (!/^\d{1,2}$/.test(paymentDay) || +paymentDay < 1 || +paymentDay > 31)
        )
          throw new Error("Podaj dzień płatności od 1 do 31.");
        const effectiveDueDate = scheduleForm
          ? recurringDueDate(period, paymentDay ? +paymentDay : undefined)
          : dueDate;
        const row: Row = {
          id,
          period,
          name,
          amount: positiveAmount(amount),
          category: category === "__custom" ? customCategory.trim() : category,
          source,
          kind: source === "shared" ? "expense" : kind,
          note,
          household:
            source === "shared" || kind === "sharedDeposit" || household,
          ...(existing?.templateId ? { templateId: existing.templateId } : {}),
          ...(effectiveDueDate ? { dueDate: effectiveDueDate } : {}),
          ...(kind === "debt" && source === "personal" ? { debtId } : {}),
          ...(existing?.fundingAccount
            ? { fundingAccount: existing.fundingAccount }
            : {}),
        };
        await act({
          type: "saveExpense",
          row,
          recurring,
          scope,
          ...(scheduleForm && paymentDay ? { dueDay: +paymentDay } : {}),
        });
      }}
    >
      <Field
        label="Nazwa"
        value={name}
        required
        maxLength={120}
        autoFocus
        placeholder="Np. jedzenie, paliwo, zakupy"
        onChange={(e) => change(() => setName(e.target.value))}
      />
      <div className="form-grid">
        <Field
          label="Kwota (zł)"
          inputMode="decimal"
          required
          value={amount}
          placeholder="0,00"
          onChange={(e) => change(() => setAmount(e.target.value))}
        />
        <Select
          label="Kategoria"
          value={category}
          onChange={(v) => change(() => setCategory(v as Category))}
        >
          {Object.entries(categoryOptions).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
          <option value="__custom">Własna kategoria…</option>
        </Select>
      </div>
      {category === "__custom" && (
        <Field
          label="Nazwa własnej kategorii"
          required
          maxLength={60}
          value={customCategory}
          onChange={(e) => change(() => setCustomCategory(e.target.value))}
        />
      )}
      {scheduleForm && (
        <Field
          label="Dzień płatności w miesiącu (opcjonalnie)"
          inputMode="numeric"
          value={paymentDay}
          maxLength={2}
          placeholder="Np. 15"
          hint="Od 1 do 31. W krótszym miesiącu termin przypada na jego ostatni dzień."
          onChange={(e) => change(() => setPaymentDay(e.target.value))}
        />
      )}
      <NoteField value={note} onChange={(v) => change(() => setNote(v))} />
    </Editor>
  );
}

export function IncomeForm({
  close,
  act,
  state,
  period,
  existing,
}: Base & { existing?: Income }) {
  const [id] = useState(existing?.id || crypto.randomUUID());
  const bounds = periodBounds(period);
  const initialDate =
    period > currentPeriod()
      ? bounds.start
      : period === currentPeriod()
        ? today()
        : bounds.end;
  const [name, setName] = useState(existing?.name || "");
  const [amount, setAmount] = useState(
    existing ? amountInput(existing.amount) : "",
  );
  const [date, setDate] = useState(existing?.date || initialDate);
  const [received, setReceived] = useState(
    existing?.received ?? initialDate <= today(),
  );
  const [note, setNote] = useState(existing?.note || "");
  const [dirty, setDirty] = useState(false);
  const [splits, setSplits] = useState(
    existing?.splits.map((s) => ({ ...s, amount: amountInput(s.amount) })) || [
      {
        destination: "budget" as const,
        amount: "",
        debtId: undefined as string | undefined,
      },
    ],
  );
  const change = (fn: () => void) => {
    setDirty(true);
    fn();
  };
  const updateSplit = (i: number, values: Partial<(typeof splits)[number]>) =>
    change(() =>
      setSplits((prev) =>
        prev.map((s, j) => (j === i ? { ...s, ...values } : s)),
      ),
    );
  let splitTotal = 0;
  try {
    splitTotal = splits.reduce(
      (a, s) => a + (s.amount ? parseMoney(s.amount) : 0),
      0,
    );
  } catch {
    /* Incomplete amounts are validated on submit. */
  }
  return (
    <Editor
      title={existing ? "Edytuj wpływ" : "Dodaj wpływ"}
      subtitle="Wypłata, premia, prezent lub dodatkowa praca."
      close={close}
      dirty={dirty}
      onSubmit={async () => {
        await act({
          type: "saveIncome",
          income: {
            id,
            period,
            name,
            amount: positiveAmount(amount),
            date,
            received,
            note,
            splits: splits.map((s) => ({
              destination: s.destination,
              amount: positiveAmount(s.amount),
              ...(s.destination === "debt" ? { debtId: s.debtId || "" } : {}),
            })),
          },
        });
      }}
    >
      <Field
        label="Nazwa wpływu"
        value={name}
        required
        autoFocus
        placeholder="Np. wypłata"
        maxLength={120}
        onChange={(e) => change(() => setName(e.target.value))}
      />
      <div className="form-grid">
        <Field
          label="Cała kwota (zł)"
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) =>
            change(() => {
              setAmount(e.target.value);
              if (splits.length === 1)
                setSplits([{ ...splits[0], amount: e.target.value }]);
            })
          }
        />
        <Field
          label="Data wpływu"
          type="date"
          value={date}
          min={bounds.start}
          max={bounds.end}
          onChange={(e) =>
            change(() => {
              setDate(e.target.value);
              if (e.target.value > today()) setReceived(false);
            })
          }
        />
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          checked={received}
          disabled={date > today()}
          onChange={(e) => change(() => setReceived(e.target.checked))}
        />
        Wpływ już otrzymany
      </label>
      <div className="split-heading">
        <h3>Gdzie trafiają pieniądze?</h3>
        <Button
          type="button"
          tone="ghost"
          onClick={() =>
            change(() =>
              setSplits([
                ...splits,
                { destination: "budget", amount: "", debtId: undefined },
              ]),
            )
          }
        >
          <Plus size={16} />
          Podziel
        </Button>
      </div>
      {splits.map((s, i) => (
        <div className="split-row" key={i}>
          <div className="form-grid">
            <Select
              label={`Przeznaczenie ${i + 1}`}
              value={s.destination}
              onChange={(v) =>
                updateSplit(i, {
                  destination: v as typeof s.destination,
                  debtId: v === "debt" ? state.obligations[0]?.id : undefined,
                })
              }
            >
              {Object.entries(destinations).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </Select>
            <Field
              label={`Kwota części ${i + 1} (zł)`}
              value={s.amount}
              inputMode="decimal"
              required
              onChange={(e) => updateSplit(i, { amount: e.target.value })}
            />
          </div>
          {s.destination === "debt" && (
            <Select
              label="Spłacane zobowiązanie"
              value={s.debtId || ""}
              onChange={(v) => updateSplit(i, { debtId: v })}
            >
              <option value="">Wybierz zobowiązanie</option>
              {state.obligations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
          {splits.length > 1 && (
            <Button
              type="button"
              tone="ghost"
              onClick={() =>
                change(() => setSplits(splits.filter((_, j) => j !== i)))
              }
            >
              <Trash2 size={15} />
              Usuń część {i + 1}
            </Button>
          )}
        </div>
      ))}
      <p className="split-total">
        Razem przeznaczone <Money value={splitTotal} />
      </p>
      <NoteField value={note} onChange={(v) => change(() => setNote(v))} />
    </Editor>
  );
}

export function AccountForm({
  close,
  act,
  account,
  current,
  correction = false,
}: {
  close: () => void;
  act: Act;
  account: string;
  current: number;
  correction?: boolean;
}) {
  const [mode, setMode] = useState(correction ? "correction" : "deposit");
  const [amount, setAmount] = useState(correction ? amountInput(current) : "");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const change = (fn: () => void) => {
    setDirty(true);
    fn();
  };
  return (
    <Editor
      title={correction ? "Ustaw aktualne saldo" : "Zapisz ruch konta"}
      subtitle={`Obecne saldo: ${new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(current / 100)}`}
      close={close}
      dirty={dirty}
      onSubmit={async () => {
        if (mode === "correction") {
          const balance = parseMoney(amount);
          if (balance < 0) throw new Error("Saldo nie może być ujemne.");
          await act({
            type: "correctBalance",
            account,
            balance,
            date,
            note: note || "Korekta salda",
          });
        } else
          await act({
            type: "transaction",
            account,
            amount: positiveAmount(amount),
            kind: mode,
            date,
            note,
          });
      }}
    >
      {!correction && (
        <Select
          label="Rodzaj ruchu"
          value={mode}
          onChange={(v) => change(() => setMode(v))}
        >
          <option value="deposit">Wpłata spoza mojego budżetu</option>
          <option value="withdrawal">Wypłata z konta</option>
        </Select>
      )}
      <p className="hint">
        {correction
          ? "Podaj stan widoczny w banku. Różnica zapisze się w historii jako korekta, bez dodatkowego wydatku."
          : account === "shared"
            ? "Własną wpłatę z planu zaznacz w budżecie. Tutaj zapisz np. wpłatę Patryka lub wypłatę ze wspólnego konta."
            : account === "savings" && mode === "withdrawal"
              ? "Wypłata zasili Twój budżet w okresie wskazanej daty. Zakup dodaj jako pokryty z budżetu, aby nie liczyć tej wypłaty ponownie."
              : "Własną wpłatę z bieżącej wypłaty zaplanuj w budżecie. Tutaj zapisuj ruchy spoza niego."}
      </p>
      <Field
        label={mode === "correction" ? "Aktualne saldo (zł)" : "Kwota (zł)"}
        inputMode="decimal"
        required
        autoFocus
        value={amount}
        onChange={(e) => change(() => setAmount(e.target.value))}
      />
      <Field
        label="Data"
        type="date"
        value={date}
        max={today()}
        onChange={(e) => change(() => setDate(e.target.value))}
      />
      <NoteField
        label="Opis (opcjonalnie)"
        value={note}
        onChange={(v) => change(() => setNote(v))}
      />
    </Editor>
  );
}
export function DebtForm({
  close,
  act,
  existing,
  state,
  period,
}: {
  close: () => void;
  act: Act;
  existing?: Debt;
  state: State;
  period: string;
}) {
  const [id] = useState(existing?.id || crypto.randomUUID());
  const [name, setName] = useState(existing?.name || "");
  const [amount, setAmount] = useState(
    existing ? amountInput(existing.initial) : "",
  );
  const template = state.recurring.find((t) => t.id === existing?.templateId);
  const initialStart = period < currentPeriod() ? currentPeriod() : period;
  const version =
    template?.versions
      .filter((v) => v.from <= initialStart)
      .sort((a, b) => a.from.localeCompare(b.from))
      .at(-1) || template?.versions[0];
  const [installment, setInstallment] = useState(
    version ? amountInput(version.amount) : "",
  );
  const [day, setDay] = useState(version?.dueDay ? String(version.dueDay) : "");
  const [start, setStart] = useState(
    existing?.templateId &&
      state.settlements.some(
        (s) => s.row.id === `${existing.templateId}_${initialStart}`,
      )
      ? shiftPeriod(initialStart, 1)
      : initialStart,
  );
  const [paymentAccount, setPaymentAccount] = useState(
    existing?.paymentAccount || "",
  );
  const [paymentTitle, setPaymentTitle] = useState(
    existing?.paymentTitle || "",
  );
  const [scheduleDirty, setScheduleDirty] = useState(!existing?.templateId);
  const [dirty, setDirty] = useState(false);
  const change = (fn: () => void) => {
    setDirty(true);
    fn();
  };
  return (
    <Editor
      title={existing ? "Edytuj zobowiązanie" : "Dodaj zobowiązanie"}
      subtitle="Raty 0%. Harmonogram automatycznie trafi do miesięcznych planów."
      close={close}
      dirty={dirty}
      onSubmit={async () => {
        if (scheduleDirty && (!/^\d{1,2}$/.test(day) || +day < 1 || +day > 31))
          throw new Error("Podaj dzień płatności od 1 do 31.");
        await act({
          type: "saveDebt",
          debt: {
            id,
            name,
            initial: existing?.initial ?? positiveAmount(amount),
            paymentAccount,
            paymentTitle,
            ...(existing?.templateId
              ? { templateId: existing.templateId }
              : {}),
          },
          ...(scheduleDirty
            ? {
                schedule: {
                  amount: positiveAmount(installment),
                  day: +day,
                  start,
                },
              }
            : {}),
        });
      }}
    >
      <Field
        label="Nazwa zobowiązania"
        value={name}
        required
        autoFocus
        maxLength={120}
        onChange={(e) => change(() => setName(e.target.value))}
      />
      {!existing && (
        <Field
          label="Pełna kwota pozostała do spłaty (zł)"
          value={amount}
          inputMode="decimal"
          required
          onChange={(e) => change(() => setAmount(e.target.value))}
          hint="Przy nowym kredycie: cała kwota. Przy trwającym: aktualny pozostały dług."
        />
      )}
      <div className="form-grid">
        <Field
          label="Miesięczna rata (zł)"
          value={installment}
          inputMode="decimal"
          required
          onChange={(e) =>
            change(() => {
              setScheduleDirty(true);
              setInstallment(e.target.value);
            })
          }
        />
        <Field
          label="Dzień płatności w miesiącu"
          value={day}
          inputMode="numeric"
          maxLength={2}
          required
          hint="1–31. W krótszym miesiącu: ostatni dzień."
          onChange={(e) =>
            change(() => {
              setScheduleDirty(true);
              setDay(e.target.value);
            })
          }
        />
      </div>
      <Select
        label="Pierwsza rata / zmiana od okresu"
        value={start}
        onChange={(v) =>
          change(() => {
            setScheduleDirty(true);
            setStart(v);
          })
        }
      >
        {Array.from({ length: 4 }, (_, i) => shiftPeriod(currentPeriod(), i))
          .concat(start)
          .filter((p, i, a) => a.indexOf(p) === i)
          .sort()
          .map((p) => (
            <option value={p} key={p}>
              {periodLabel(p)}
            </option>
          ))}
      </Select>
      <Field
        label="Numer konta do spłaty (opcjonalnie)"
        value={paymentAccount}
        maxLength={80}
        autoComplete="off"
        onChange={(e) => change(() => setPaymentAccount(e.target.value))}
      />
      <Field
        label="Tytuł przelewu (opcjonalnie)"
        value={paymentTitle}
        maxLength={140}
        autoComplete="off"
        onChange={(e) => change(() => setPaymentTitle(e.target.value))}
      />
      <p className="hint">
        Zaznaczenie raty jako rozdysponowanej pomniejszy dług. Ostatnia rata
        dopasuje się do pozostałej kwoty. Dane przelewu służą do kopiowania;
        aplikacja nie wykonuje przelewów.
      </p>
    </Editor>
  );
}

export function OverpayForm({
  close,
  act,
  debt,
  current,
}: {
  close: () => void;
  act: Act;
  debt: Debt;
  current: number;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [source, setSource] = useState("budget");
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const change = (fn: () => void) => {
    setDirty(true);
    fn();
  };
  return (
    <Editor
      title={`Nadpłata: ${debt.name}`}
      subtitle={`Pozostało do spłaty: ${money(current)}`}
      close={close}
      dirty={dirty}
      onSubmit={async () => {
        await act({
          type: "overpayDebt",
          debtId: debt.id,
          amount: positiveAmount(amount),
          date,
          note,
          fromBudget: source === "budget",
        });
      }}
    >
      <Field
        label="Kwota nadpłaty (zł)"
        value={amount}
        inputMode="decimal"
        required
        autoFocus
        onChange={(e) => change(() => setAmount(e.target.value))}
      />
      <Field
        label="Data nadpłaty"
        type="date"
        value={date}
        required
        max={today()}
        onChange={(e) => change(() => setDate(e.target.value))}
      />
      <Select
        label="Jak uwzględnić nadpłatę?"
        value={source}
        onChange={(v) => change(() => setSource(v))}
      >
        <option value="budget">Dodaj do budżetu jako zapłacony wydatek</option>
        <option value="outside">
          Poza planem — pieniądze już rozliczone osobno
        </option>
      </Select>
      <p className="hint">
        {source === "budget"
          ? "W wybranym okresie pojawi się rozliczona nadpłata. Nie dopisuj jej drugi raz."
          : "Pomniejszymy dług bez dodatkowego wydatku w planie. Użyj, jeśli wydatek jest już ujęty osobno."}
      </p>
      <NoteField value={note} onChange={(v) => change(() => setNote(v))} />
    </Editor>
  );
}
export function TargetForm({
  close,
  act,
  value,
}: {
  close: () => void;
  act: Act;
  value: number;
}) {
  const [amount, setAmount] = useState(amountInput(value));
  return (
    <Editor
      title="Docelowa rezerwa"
      close={close}
      dirty={amount !== amountInput(value)}
      onSubmit={async () => {
        const reserveTarget = parseMoney(amount);
        if (reserveTarget < 0) throw new Error("Cel nie może być ujemny.");
        await act({ type: "settings", reserveTarget });
      }}
    >
      <Field
        label="Kwota na koncie oszczędnościowym (zł)"
        inputMode="decimal"
        required
        autoFocus
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <p className="hint">
        Nadwyżka najpierw uzupełni rezerwę do tej kwoty. Potem pełne setki
        przeznaczysz na obligacje.
      </p>
    </Editor>
  );
}
