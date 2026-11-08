import { useState } from "react";
import { Copy } from "lucide-react";
import { Button, Field, Money } from "./components";
import { currentPeriod } from "../server/domain.mjs";
import type { Debt, State } from "./types";
export function DebtPaymentInfo({ debt, state }: { debt: Debt; state: State }) {
  const [message, setMessage] = useState("");
  const versions = state.recurring
    .find((t) => t.id === debt.templateId)
    ?.versions.slice()
    .sort((a, b) => a.from.localeCompare(b.from));
  const version =
    versions?.filter((v) => v.from <= currentPeriod()).at(-1) || versions?.[0];
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`Skopiowano ${label}.`);
    } catch {
      setMessage(
        "Nie udało się skopiować. Zaznacz tekst w polu i skopiuj ręcznie.",
      );
    }
  };
  return (
    <div className="debt-payment-info">
      {version && !version.stopped && (
        <div className="summary-line">
          <span>
            Rata: <Money value={version.amount} />
          </span>
          <span>
            {version.dueDay
              ? `${version.dueDay}. dzień miesiąca`
              : "Bez terminu"}
          </span>
        </div>
      )}
      {[
        [debt.paymentAccount, "Numer konta", "numer konta"],
        [debt.paymentTitle, "Tytuł przelewu", "tytuł przelewu"],
      ].map(
        ([value, label, copyLabel]) =>
          value && (
            <div className="copy-payment-field" key={label}>
              <Field label={label!} value={value} readOnly />
              <Button
                tone="ghost"
                onClick={() => void copy(value, copyLabel!)}
                aria-label={`Kopiuj ${copyLabel}`}
              >
                <Copy size={16} />
                Kopiuj
              </Button>
            </div>
          ),
      )}
      <p className="hint" role="status">
        {message}
      </p>
    </div>
  );
}
