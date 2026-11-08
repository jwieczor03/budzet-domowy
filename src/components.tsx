import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Info,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { money, parseMoney } from "../server/domain.mjs";

export function Money({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return <span className={`money ${className}`}>{money(value)}</span>;
}
export function Button({
  children,
  tone = "primary",
  busy,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={`button ${tone} ${className}`}
    >
      {busy && <LoaderCircle size={17} className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Alert({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="alert" role="alert">
      <CircleAlert size={19} aria-hidden="true" />
      <div>{children}</div>
      {action}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon || <Plus size={24} />}
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generated = useId();
  const fieldId = props.id || generated;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <input
        {...props}
        id={fieldId}
        aria-invalid={!!error || undefined}
        aria-describedby={error || hint ? `${fieldId}-help` : undefined}
      />
      {(error || hint) && (
        <small id={`${fieldId}-help`} className={error ? "field-error" : ""}>
          {error || hint}
        </small>
      )}
    </div>
  );
}
export function Select({
  label,
  value,
  onChange,
  children,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {children}
      </select>
    </div>
  );
}
export function NoteField({
  value,
  onChange,
  label = "Notatka (opcjonalnie)",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        className="resize-none"
        id={id}
        maxLength={1000}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  close,
  dirty = false,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  dirty?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [discard, setDiscard] = useState(false);
  const onClose = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else close();
  };
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    dialog
      .querySelector<HTMLInputElement>(
        "input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
      )
      ?.focus();
    if (!dialog.querySelector("input, select, textarea"))
      dialog.querySelector<HTMLButtonElement>("[data-initial-focus]")?.focus();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Zamknij"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {discard ? (
        <div className="discard">
          <h3>Odrzucić niezapisane zmiany?</h3>
          <p>Wpisane dane nie zostaną zapisane.</p>
          <div className="actions">
            <Button
              tone="secondary"
              autoFocus
              onClick={() => setDiscard(false)}
            >
              Wróć do formularza
            </Button>
            <Button tone="danger" onClick={close}>
              Odrzuć zmiany
            </Button>
          </div>
        </div>
      ) : (
        children
      )}
    </dialog>
  );
}
export function Editor({
  title,
  subtitle,
  close,
  dirty,
  onSubmit,
  children,
  submitLabel = "Zapisz",
  busy: externalBusy = false,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  dirty: boolean;
  onSubmit: () => Promise<void>;
  children: ReactNode;
  submitLabel?: string;
  busy?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    const firstEmpty = [
      ...(formRef.current?.querySelectorAll<HTMLInputElement>(
        "input[required]",
      ) || []),
    ].find((i) => !i.value.trim());
    if (firstEmpty) {
      firstEmpty.setAttribute("aria-invalid", "true");
      firstEmpty.focus();
      setError("Uzupełnij wymagane pola.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit();
      close();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Nie udało się zapisać. Spróbuj ponownie.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      close={close}
      dirty={dirty}
      busy={busy || externalBusy}
    >
      <form
        ref={formRef}
        noValidate
        onSubmit={submit}
        onInput={(e) =>
          (e.target as HTMLElement).removeAttribute("aria-invalid")
        }
      >
        <fieldset disabled={busy || externalBusy} className="form-body">
          {children}
        </fieldset>
        {error && (
          <div className="form-error">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="modal-foot">
          <Button
            type="button"
            tone="secondary"
            disabled={busy}
            onClick={() =>
              formRef.current
                ?.closest("dialog")
                ?.dispatchEvent(
                  new Event("cancel", { cancelable: true, bubbles: true }),
                )
            }
          >
            Anuluj
          </Button>
          <Button type="submit" busy={busy || externalBusy}>
            {submitLabel}
            <Check size={17} aria-hidden="true" />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function Confirm({
  title,
  children,
  close,
  perform,
  label = "Potwierdź",
  danger = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  perform: () => Promise<void>;
  label?: string;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={title} close={close} busy={busy}>
      <div className="form-body">
        {children}
        {error && <Alert>{error}</Alert>}
      </div>
      <div className="modal-foot">
        <Button
          tone="secondary"
          data-initial-focus
          autoFocus
          disabled={busy}
          onClick={close}
        >
          Anuluj
        </Button>
        <Button
          tone={danger ? "danger" : "primary"}
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await perform();
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {label}
          <ArrowRight size={17} aria-hidden="true" />
        </Button>
      </div>
    </Modal>
  );
}
export function amountInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}
export function positiveAmount(value: string) {
  const amount = parseMoney(value);
  if (amount <= 0) throw new Error("Podaj kwotę większą od zera.");
  return amount;
}

export function NoteTooltip({
  note,
  name,
  children,
  label,
}: {
  note: string;
  name: string;
  children?: ReactNode;
  label?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const clear = () => clearTimeout(timer.current);
  const show = () => {
    clear();
    timer.current = setTimeout(() => setOpen(true), 180);
  };
  const hide = () => {
    clear();
    if (!pinned) timer.current = setTimeout(() => setOpen(false), 150);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open || !trigger.current || !tip.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const size = tip.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        12,
        Math.min(rect.left, window.innerWidth - size.width - 12),
      ),
      top: Math.max(
        12,
        Math.min(rect.bottom + 6, window.innerHeight - size.height - 12),
      ),
    });
  }, [open, note]);
  useEffect(() => {
    if (!open) return;
    const dismiss = () => {
      clear();
      setOpen(false);
      setPinned(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        dismiss();
      }
    };
    const outside = (e: PointerEvent) => {
      if (
        !trigger.current?.contains(e.target as Node) &&
        !tip.current?.contains(e.target as Node)
      )
        dismiss();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open]);
  return (
    <span
      className="note-trigger"
      ref={trigger}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        className="note-button"
        aria-label={label || `Notatka: ${name}`}
        aria-describedby={open ? id : undefined}
        onFocus={() => {
          clear();
          setOpen(true);
        }}
        onBlur={() => {
          clear();
          setOpen(false);
          setPinned(false);
        }}
        onClick={() => {
          clear();
          setPinned(!pinned);
          setOpen(!pinned);
        }}
      >
        {children || <Info size={16} aria-hidden="true" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={tip}
            id={id}
            role="tooltip"
            className="note-tooltip"
            style={position}
            onMouseEnter={clear}
            onMouseLeave={hide}
          >
            {note}
          </div>,
          document.body,
        )}
    </span>
  );
}
