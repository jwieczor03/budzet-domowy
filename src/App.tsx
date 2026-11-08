import StartView from "./StartView";
import PatrykView from "./PatrykView";
import {
  PatrykIncomeForm,
  PatrykExpenseForm,
  PatrykSavingsForm,
} from "./PatrykForms";
import HouseholdView from "./HouseholdView";
import { HouseholdCostForm, SharedEntryForm } from "./HouseholdForms";
import GoalsView, { GoalGroupForm } from "./GoalsView";
import StatisticsView from "./StatisticsView";
import RecurringView from "./RecurringView";
import { DebtPaymentInfo } from "./DebtPaymentInfo";
import BudgetView from "./BudgetView";
import { Allocation, Ledger } from "./secondary";
import { prettyDate, periodLabel } from "./format";
import type { Dialog } from "./dialogs";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Home,
  Landmark,
  Leaf,
  ListChecks,
  LoaderCircle,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  UserRound,
  Wallet,
} from "lucide-react";
import {
  balances,
  currentPeriod,
  knownPeriods,
  money,
  overdueRows,
  savingsProposal,
  shiftPeriod,
  validateBackup,
} from "../server/domain.mjs";
import { ApiError, downloadBackup, getSnapshot, sendAction } from "./api";
import { Alert, Button, Confirm, Empty, Money } from "./components";
import {
  AccountForm,
  DebtForm,
  OverpayForm,
  ExpenseForm,
  IncomeForm,
  TargetForm,
} from "./forms";
import { accountNames, type Row, type Snapshot, type State } from "./types";

type Page =
  | "start"
  | "budget"
  | "fixed"
  | "home"
  | "savings"
  | "debts"
  | "patryk"
  | "settings"
  | "stats"
  | "goals"
  | "home-costs"
  | "home-stats"
  | "patryk-savings"
  | "patryk-stats";
const nav = [
  { id: "start" as const, label: "Start", icon: Home },
  { id: "budget" as const, label: "Mój budżet", icon: Wallet },
  { id: "fixed" as const, label: "Stałe i subskrypcje", icon: ListChecks },
  { id: "home" as const, label: "Dom", icon: Home },
  { id: "home-costs" as const, label: "Podział kosztów", icon: Home },
  { id: "home-stats" as const, label: "Statystyki konta", icon: Home },
  { id: "savings" as const, label: "Oszczędności", icon: Landmark },
  { id: "debts" as const, label: "Zobowiązania", icon: ListChecks },
  { id: "patryk" as const, label: "Patryk", icon: UserRound },
  {
    id: "patryk-savings" as const,
    label: "Oszczędności Patryka",
    icon: UserRound,
  },
  { id: "patryk-stats" as const, label: "Statystyki Patryka", icon: UserRound },
  { id: "goals" as const, label: "Cele i przelewy", icon: ListChecks },
  { id: "stats" as const, label: "Statystyki", icon: ListChecks },
  { id: "settings" as const, label: "Ustawienia", icon: Settings },
];
const personalPages = ["budget", "fixed", "debts", "savings", "goals", "stats"];
const homePages = ["home", "home-costs", "home-stats"];
const homeNav = [
  { id: "home" as const, label: "Wspólne konto" },
  { id: "home-costs" as const, label: "Podział kosztów" },
  { id: "home-stats" as const, label: "Statystyki konta" },
];
const patrykPages = ["patryk", "patryk-savings", "patryk-stats"];
const patrykNav = [
  { id: "patryk" as const, label: "Rozliczenie" },
  { id: "patryk-savings" as const, label: "Oszczędności" },
  { id: "patryk-stats" as const, label: "Statystyki" },
];
const mainNav = nav.filter((n) =>
  ["start", "budget", "home", "patryk", "settings"].includes(n.id),
);
const budgetNav = personalPages.map((id) => ({
  ...nav.find((n) => n.id === id)!,
  label: id === "budget" ? "Rozliczenie" : nav.find((n) => n.id === id)!.label,
}));
const titles: Record<Page, [string, string]> = {
  start: [
    "Finanse na pierwszy rzut oka",
    "Plan poprzedniego, bieżącego i następnego okresu oraz zapisane oszczędności.",
  ],
  "patryk-savings": [
    "Oszczędności Patryka",
    "Wpłaty, wypłaty i miesiące uzupełniane z opóźnieniem.",
  ],
  "patryk-stats": [
    "Statystyki Patryka",
    "Średnie wypłaty, wydatki i odkładane kwoty.",
  ],
  "home-costs": [
    "Podział kosztów",
    "Wspólne opłaty i udziały w domowym budżecie.",
  ],
  "home-stats": [
    "Statystyki wspólnego konta",
    "Wpływy, wydatki i zmiany salda z zapisanej historii.",
  ],
  goals: ["Cele i przelewy", "Sprawdź, ile powinno trafić na każdy cel."],
  stats: [
    "Statystyki",
    "Porównaj miesiące i zobacz, na co przeznaczasz pieniądze.",
  ],
  budget: ["Mój budżet", "Wpływy, wydatki i cele na wybrany okres."],
  fixed: [
    "Stałe i subskrypcje",
    "Edytuj raz. Zmiany trafią do kolejnych miesięcy.",
  ],
  home: ["Wspólne konto", "Saldo oraz ręcznie zapisywane wpływy i wydatki."],
  savings: [
    "Krok po kroku, na przyszłość.",
    "Jedna pula oszczędności. Dwa miejsca na Twoje pieniądze.",
  ],
  debts: [
    "Z każdym miesiącem bliżej zera.",
    "Pozostałe kwoty rat 0% i ręczne korekty po nadpłatach.",
  ],
  patryk: [
    "Jak idzie Patrykowi?",
    "Krótkie podsumowanie Waszego miesięcznego rozliczenia.",
  ],
  settings: [
    "Wszystko pod kontrolą.",
    "Twoje ustawienia, kopie zapasowe i historia zmian.",
  ],
};
function urlState() {
  const params = new URLSearchParams(window.location.search);
  const page = nav.some((n) => n.id === params.get("view"))
    ? (params.get("view") as Page)
    : "start";
  const value = params.get("period");
  return {
    page,
    period:
      value && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value)
        ? value
        : currentPeriod(),
  };
}

export default function App() {
  const initial = urlState();
  const [page, setPage] = useState<Page>(initial.page);
  const [period, setPeriod] = useState(initial.period);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const latest = useRef<Snapshot | undefined>(undefined);
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const sequence = useRef(0);
  const pending = useRef<{ body: string; id: string } | null>(null);
  const mutating = useRef(false);
  const dialogRevision = useRef<number | undefined>(undefined);
  const navigate = (nextPage: Page, nextPeriod = period) => {
    if (nextPage !== page) window.scrollTo({ top: 0 });
    setPage(nextPage);
    setPeriod(nextPeriod);
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextPage);
    url.searchParams.set("period", nextPeriod);
    window.history.pushState(null, "", url);
  };
  const refresh = useCallback(async () => {
    const seq = ++sequence.current;
    try {
      const next = await getSnapshot();
      if (sequence.current !== seq) return;
      latest.current = next;
      setSnapshot(next);
      setError("");
      setAuthError(false);
    } catch (e) {
      if (sequence.current !== seq) return;
      setError((e as Error).message);
      setAuthError(e instanceof ApiError && e.status === 401);
    } finally {
      if (sequence.current === seq) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const onPop = () => {
      const s = urlState();
      setPage(s.page);
      setPeriod(s.period);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [refresh]);
  useEffect(() => {
    document.title = `${nav.find((n) => n.id === page)?.label} — Budżet`;
  }, [page]);
  useEffect(() => {
    dialogRevision.current = dialog ? latest.current?.revision : undefined;
  }, [dialog]);
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible" && !mutating.current)
        void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [refresh]);
  const act = async (action: object) => {
    if (mutating.current || !latest.current)
      throw new Error("Poczekaj na zakończenie bieżącego zapisu.");
    mutating.current = true;
    setBusy(true);
    sequence.current++;
    const body = JSON.stringify(action);
    if (pending.current?.body !== body)
      pending.current = { body, id: crypto.randomUUID() };
    try {
      const result = await sendAction(
        dialogRevision.current ?? latest.current.revision,
        pending.current.id,
        action,
      );
      latest.current = result;
      setSnapshot(result);
      setError("");
      setAuthError(false);
      setStatus("Zapisano zmiany.");
      pending.current = null;
    } catch (e) {
      const reported =
        e instanceof ApiError && e.status === 409
          ? new ApiError(
              "Dane zmieniły się od otwarcia formularza. Zamknij go, odśwież dane i otwórz ponownie, aby sprawdzić aktualne wartości. Twoje zmiany nie nadpisały nowszego zapisu.",
              409,
            )
          : e;
      setError((reported as Error).message);
      setAuthError(reported instanceof ApiError && reported.status === 401);
      throw reported;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };
  const state = snapshot?.state;
  const balance = state
    ? (balances(state) as Record<string, number>)
    : { savings: 0, bonds: 0, shared: 0 };
  const periods = [
    ...new Set([
      currentPeriod(),
      shiftPeriod(currentPeriod(), 1),
      shiftPeriod(currentPeriod(), 2),
      shiftPeriod(currentPeriod(), 3),
      period,
      ...(state ? knownPeriods(state) : []),
    ]),
  ].sort();
  const late = state ? (overdueRows(state) as Row[]) : [];
  const proposal = state
    ? savingsProposal(state, period)
    : { reserve: 0, bonds: 0, remainder: 0 };
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
  const download = async () => {
    try {
      await downloadBackup();
      setStatus("Pobrano pełną kopię. Zapisz ją w swoim iCloud Drive.");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Plik jest za duży. Maksymalny rozmiar to 4 MB.");
      const backup = JSON.parse(await file.text());
      const restored = validateBackup(backup) as State;
      setDialog({
        type: "confirm",
        title: "Przywrócić pełną kopię?",
        body: (
          <>
            <p>
              Kopia z {prettyDate(backup.exportedAt.slice(0, 10))}:{" "}
              {restored.incomes.length} wpływów, {restored.recurring.length}{" "}
              stałych pozycji, {restored.settlements.length} rozliczeń.
            </p>
            <p>
              <strong>Obecne dane zostaną zastąpione.</strong> Przed kontynuacją
              możesz pobrać ich kopię.
            </p>
            <Button tone="secondary" onClick={() => void download()}>
              <Download size={17} />
              Pobierz obecne dane
            </Button>
          </>
        ),
        label: "Zastąp dane kopią",
        danger: true,
        perform: () => act({ type: "restore", backup }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nieprawidłowa kopia.");
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="?view=start"
          onClick={(e) => {
            e.preventDefault();
            navigate("start");
          }}
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            budżet<span className="brand-dot">.</span>
          </span>
        </a>
        <p className="sidebar-kicker">TWOJE PIENIĄDZE, PO SWOJEMU</p>
        <nav aria-label="Główna nawigacja">
          {mainNav.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`?view=${id}&period=${period}`}
              className={
                page === id ||
                (id === "budget" && personalPages.includes(page)) ||
                (id === "home" && homePages.includes(page)) ||
                (id === "patryk" && patrykPages.includes(page))
                  ? "active"
                  : ""
              }
              aria-current={
                page === id
                  ? "page"
                  : (id === "budget" && personalPages.includes(page)) ||
                      (id === "home" && homePages.includes(page)) ||
                      (id === "patryk" && patrykPages.includes(page))
                    ? "location"
                    : undefined
              }
              onClick={(e) => {
                e.preventDefault();
                navigate(id);
              }}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
              {id === "budget" && late.length > 0 && (
                <span
                  className="nav-count"
                  aria-label={`${late.length} zaległych pozycji`}
                >
                  {late.length}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="cycle-mark">
            <strong>10</strong>
            <ArrowRight size={22} />
            <strong>09</strong>
          </div>
          <p>
            Twój miesiąc zaczyna się
            <br />
            dziesiątego.
          </p>
          <div className="private-label">
            <ShieldCheck size={15} aria-hidden="true" />
            Prywatna przestrzeń
          </div>
        </div>
      </aside>
      <main id="main" className="main">
        <div className="topbar">
          <span className="topbar-label">MÓJ DOMOWY PLAN</span>
          <div className="topbar-actions">
            <span className="save-status" role="status">
              {busy ? (
                <>
                  <LoaderCircle size={14} className="spin" />
                  Zapisywanie
                </>
              ) : (
                <>
                  <CheckCheck size={15} />
                  {snapshot?.local
                    ? "Zapis lokalny"
                    : snapshot
                      ? "Zapis w chmurze"
                      : "Łączenie"}
                </>
              )}
            </span>
            <button
              className="icon-button"
              aria-label="Odśwież dane"
              title="Odśwież dane"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw size={17} />
            </button>
            <span className="avatar" aria-label="Tylko dla Ciebie">
              JA
            </span>
          </div>
        </div>
        {personalPages.includes(page) && (
          <nav className="budget-subnav" aria-label="Zakładki mojego budżetu">
            {budgetNav.map(({ id, label }) => (
              <a
                key={id}
                href={`?view=${id}&period=${period}`}
                aria-current={page === id ? "page" : undefined}
                className={page === id ? "active" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(id);
                }}
              >
                {label}
              </a>
            ))}
          </nav>
        )}
        {homePages.includes(page) && (
          <nav className="budget-subnav" aria-label="Zakładki budżetu Dom">
            {homeNav.map(({ id, label }) => (
              <a
                key={id}
                href={`?view=${id}&period=${period}`}
                aria-current={page === id ? "page" : undefined}
                className={page === id ? "active" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(id);
                }}
              >
                {label}
              </a>
            ))}
          </nav>
        )}
        {patrykPages.includes(page) && (
          <nav className="budget-subnav" aria-label="Zakładki Patryka">
            {patrykNav.map(({ id, label }) => (
              <a
                key={id}
                href={`?view=${id}&period=${period}`}
                aria-current={page === id ? "page" : undefined}
                className={page === id ? "active" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(id);
                }}
              >
                {label}
              </a>
            ))}
          </nav>
        )}
        <header className="page-heading">
          <div>
            <p className="eyebrow">
              {personalPages.includes(page)
                ? "Mój budżet"
                : patrykPages.includes(page)
                  ? "Patryk"
                  : homePages.includes(page)
                    ? "Dom"
                    : nav.find((n) => n.id === page)?.label}
            </p>
            <h1>{titles[page][0]}</h1>
            <p>{titles[page][1]}</p>
          </div>
          {[
            "budget",
            "fixed",
            "home-costs",
            "home-stats",
            "patryk",
            "patryk-savings",
            "patryk-stats",
            "stats",
            "goals",
          ].includes(page) && (
            <div className="period-picker">
              <button
                className="icon-button"
                aria-label="Poprzedni okres"
                onClick={() => navigate(page, shiftPeriod(period, -1))}
              >
                <ChevronLeft size={18} />
              </button>
              <label>
                <span className="sr-only">Okres budżetowy</span>
                <select
                  value={period}
                  onChange={(e) => navigate(page, e.target.value)}
                >
                  {periods.map((p) => (
                    <option key={p} value={p}>
                      {periodLabel(p)}
                    </option>
                  ))}
                </select>
                <small>
                  10.{period.slice(5)} – 09.{shiftPeriod(period, 1).slice(5)}
                </small>
              </label>
              <button
                className="icon-button"
                aria-label="Następny okres"
                disabled={period >= shiftPeriod(currentPeriod(), 3)}
                onClick={() => navigate(page, shiftPeriod(period, 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </header>
        {snapshot?.local && (
          <div className="local-notice">
            <ShieldCheck size={16} />
            Podgląd na tym Macu. Dane zapisują się lokalnie; synchronizacja
            urządzeń będzie dostępna po wdrożeniu.
          </div>
        )}
        {error && (
          <Alert
            action={
              <div className="alert-actions">
                <Button
                  tone="secondary"
                  onClick={() => void refresh()}
                  disabled={busy}
                >
                  Odśwież dane
                </Button>
                {authError && (
                  <a className="button secondary" href="/cdn-cgi/access/logout">
                    Zaloguj ponownie
                  </a>
                )}
              </div>
            }
          >
            {error}
          </Alert>
        )}
        <div className="sr-only" role="status" aria-live="polite">
          {status}
        </div>
        {loading ? (
          <div className="loading">
            <LoaderCircle className="spin" />
            <p>Otwieram Twój budżet…</p>
          </div>
        ) : !state ? (
          <Empty
            title="Nie udało się otworzyć budżetu"
            action={
              <Button onClick={() => void refresh()}>Spróbuj ponownie</Button>
            }
          >
            Sprawdź połączenie i dostęp do aplikacji.
          </Empty>
        ) : (
          <>
            {page === "start" && <StartView state={state} />}
            {page === "budget" && (
              <BudgetView
                key={`${page}-${period}`}
                state={state}
                period={period}
                household={false}
                busy={busy}
                open={setDialog}
                act={act}
              />
            )}
            {(page === "home" ||
              page === "home-costs" ||
              page === "home-stats") && (
              <HouseholdView
                state={state}
                period={period}
                page={page}
                busy={busy}
                open={setDialog}
                act={act}
                selectPeriod={(p) => navigate(page, p)}
              />
            )}
            {page === "goals" && (
              <GoalsView
                state={state}
                period={period}
                busy={busy}
                open={setDialog}
                act={act}
              />
            )}
            {page === "stats" && (
              <StatisticsView
                state={state}
                period={period}
                selectPeriod={(p) => navigate("stats", p)}
              />
            )}
            {page === "fixed" && (
              <RecurringView
                state={state}
                period={period}
                busy={busy}
                open={setDialog}
                act={act}
              />
            )}
            {page === "savings" && (
              <>
                <div className="savings-total">
                  <div>
                    <p>Łącznie na przyszłość</p>
                    <Money
                      value={balance.savings + balance.bonds}
                      className="large-money"
                    />
                    <span>Saldo po wpłatach, wypłatach i korektach</span>
                  </div>
                  <Leaf size={70} strokeWidth={1} aria-hidden="true" />
                </div>
                <div className="account-grid">
                  {["savings", "bonds"].map((account) => (
                    <section className="panel account-card" key={account}>
                      <div className="section-title">
                        <h2>{accountNames[account]}</h2>
                        <Landmark size={21} />
                      </div>
                      <Money value={balance[account]} className="large-money" />
                      {account === "savings" ? (
                        <>
                          <div className="summary-line">
                            <span>Cel rezerwy</span>
                            <Money value={state.settings.reserveTarget} />
                          </div>
                          <progress
                            value={Math.min(
                              balance.savings,
                              state.settings.reserveTarget,
                            )}
                            max={Math.max(state.settings.reserveTarget, 1)}
                            aria-label="Uzupełnienie rezerwy"
                          />
                          <Button
                            tone="ghost"
                            onClick={() => setDialog({ type: "target" })}
                          >
                            Zmień cel rezerwy
                          </Button>
                        </>
                      ) : (
                        <p className="hint">
                          Pełne setki na zakup. Odsetki możesz dopisać korektą
                          salda.
                        </p>
                      )}
                      <div className="actions">
                        <Button
                          tone="secondary"
                          onClick={() =>
                            setDialog({
                              type: "account",
                              account,
                              correction: true,
                            })
                          }
                        >
                          <SlidersHorizontal size={16} />
                          Ustaw saldo
                        </Button>
                        <Button
                          tone="secondary"
                          onClick={() =>
                            setDialog({ type: "account", account })
                          }
                        >
                          <Plus size={16} />
                          Zapisz ruch
                        </Button>
                      </div>
                    </section>
                  ))}
                </div>
                <Ledger
                  state={state}
                  account="savings"
                  act={act}
                  confirm={confirm}
                />
                <Ledger
                  state={state}
                  account="bonds"
                  act={act}
                  confirm={confirm}
                />
              </>
            )}
            {page === "debts" && (
              <>
                <div className="section-title standalone">
                  <div>
                    <p className="muted">Łącznie pozostało do spłaty</p>
                    <Money
                      value={state.obligations.reduce(
                        (a, d) => a + balance[`debt:${d.id}`],
                        0,
                      )}
                      className="large-money"
                    />
                  </div>
                  <Button onClick={() => setDialog({ type: "debt" })}>
                    <Plus size={17} />
                    Dodaj zobowiązanie
                  </Button>
                </div>
                {state.obligations.length ? (
                  <div className="account-grid">
                    {state.obligations.map((d) => (
                      <section className="panel account-card" key={d.id}>
                        <div className="section-title">
                          <h2>{d.name}</h2>
                          <span className="pill">
                            {balance[`debt:${d.id}`] === 0
                              ? "Spłacone"
                              : "Raty 0%"}
                          </span>
                        </div>
                        <Money
                          value={balance[`debt:${d.id}`]}
                          className="large-money"
                        />
                        <p className="hint">
                          Pozostało do spłaty · początkowo {money(d.initial)}
                        </p>
                        <progress
                          value={Math.max(
                            0,
                            d.initial - balance[`debt:${d.id}`],
                          )}
                          max={Math.max(d.initial, 1)}
                          aria-label={`Spłata: ${d.name}`}
                        />
                        <DebtPaymentInfo debt={d} state={state} />
                        <div className="actions">
                          <Button
                            tone="secondary"
                            disabled={balance[`debt:${d.id}`] <= 0}
                            onClick={() =>
                              setDialog({ type: "overpay", debt: d })
                            }
                          >
                            Dodaj nadpłatę
                          </Button>
                          <Button
                            tone="ghost"
                            onClick={() => setDialog({ type: "debt", debt: d })}
                          >
                            Edytuj ratę i dane
                          </Button>
                          <Button
                            tone="ghost"
                            onClick={() =>
                              setDialog({
                                type: "account",
                                account: `debt:${d.id}`,
                                correction: true,
                              })
                            }
                          >
                            <SlidersHorizontal size={16} />
                            Korekta salda
                          </Button>
                          {!d.templateId && (
                            <Button
                              tone="ghost"
                              onClick={() =>
                                setDialog({
                                  type: "expense",
                                  row: undefined,
                                  debtId: d.id,
                                })
                              }
                            >
                              Zaplanuj ratę
                              <ArrowRight size={16} />
                            </Button>
                          )}
                        </div>
                        <Ledger
                          state={state}
                          account={`debt:${d.id}`}
                          act={act}
                          confirm={confirm}
                          compact
                        />
                      </section>
                    ))}
                  </div>
                ) : (
                  <section className="panel">
                    <Empty
                      title="Każda rata ma tu swoje miejsce"
                      icon={<ListChecks size={27} />}
                      action={
                        <Button onClick={() => setDialog({ type: "debt" })}>
                          <Plus size={17} />
                          Dodaj zobowiązanie
                        </Button>
                      }
                    >
                      Wpisz bieżący dług. Rozliczone raty będą automatycznie
                      pomniejszać pozostałą kwotę.
                    </Empty>
                  </section>
                )}
              </>
            )}
            {(page === "patryk" ||
              page === "patryk-savings" ||
              page === "patryk-stats") && (
              <PatrykView
                state={state}
                period={period}
                page={page}
                busy={busy}
                open={setDialog}
                act={act}
                selectPeriod={(p) => navigate(page, p)}
              />
            )}
            {page === "settings" && (
              <>
                <section className="panel settings-panel">
                  <div className="section-title">
                    <div>
                      <h2>Kopia na wszelki wypadek</h2>
                      <p>
                        Po miesięcznym rozliczeniu pobierz plik i zapisz go w
                        iCloud Drive.
                      </p>
                    </div>
                    <ShieldCheck size={25} />
                  </div>
                  <div className="backup-options">
                    <div>
                      <Download size={25} />
                      <h3>Pobierz pełną kopię</h3>
                      <p>
                        Plan, historia, oszczędności, raty i ustawienia w jednym
                        pliku JSON.
                      </p>
                      <Button onClick={() => void download()}>
                        <Download size={17} />
                        Pobierz kopię
                      </Button>
                    </div>
                    <div>
                      <Upload size={25} />
                      <h3>Przywróć dane</h3>
                      <p>
                        Wczytaj wcześniej pobrany plik. Przed zastąpieniem
                        zobaczysz potwierdzenie.
                      </p>
                      <label className="button secondary file-label">
                        <Upload size={17} />
                        Wybierz kopię
                        <input
                          type="file"
                          accept="application/json,.json"
                          aria-label="Wybierz kopię do przywrócenia"
                          onChange={(e) => {
                            void importFile(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </section>
                <section className="panel settings-panel">
                  <div className="section-title">
                    <h2>Rezerwa na większe niespodzianki</h2>
                    <Button
                      tone="secondary"
                      onClick={() => setDialog({ type: "target" })}
                    >
                      Zmień kwotę
                    </Button>
                  </div>
                  <Money
                    value={state.settings.reserveTarget}
                    className="large-money"
                  />
                  <p className="hint">
                    Do tej kwoty najpierw uzupełniasz konto oszczędnościowe.
                    Kolejne pełne setki planujesz na obligacje.
                  </p>
                </section>
                <section className="panel settings-panel">
                  <h2>Historia zmian</h2>
                  {state.audit.length ? (
                    <ol className="audit-list">
                      {[...state.audit]
                        .reverse()
                        .slice(0, 30)
                        .map((event) => (
                          <li key={event.id}>
                            <span className="audit-dot" />
                            <div>
                              {event.label}
                              <small>
                                {new Intl.DateTimeFormat("pl-PL", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                  timeZone: "Europe/Warsaw",
                                }).format(new Date(event.at))}
                              </small>
                            </div>
                          </li>
                        ))}
                    </ol>
                  ) : (
                    <p className="hint">
                      Tu pojawią się zapisy i korekty. Pełna historia znajduje
                      się też w kopii danych.
                    </p>
                  )}
                </section>
              </>
            )}
            {dialog?.type === "expense" && (
              <ExpenseForm
                key={dialog.row?.id || "new"}
                close={() => setDialog(null)}
                act={act}
                state={state}
                period={dialog.row?.period || period}
                existing={dialog.row}
                shared={dialog.shared}
                defaultDebtId={dialog.debtId}
                fixed={dialog.fixed}
                transfer={dialog.transfer}
                defaultCategory={dialog.category}
              />
            )}
            {dialog?.type === "sharedEntry" && (
              <SharedEntryForm
                close={() => setDialog(null)}
                act={act}
                kind={dialog.kind}
              />
            )}
            {dialog?.type === "householdCost" && (
              <HouseholdCostForm
                close={() => setDialog(null)}
                act={act}
                state={state}
                period={period}
                existing={dialog.cost}
                templateId={dialog.templateId}
              />
            )}
            {dialog?.type === "goalGroup" && (
              <GoalGroupForm
                state={state}
                period={period}
                existing={dialog.group}
                close={() => setDialog(null)}
                act={act}
              />
            )}
            {dialog?.type === "income" && (
              <IncomeForm
                close={() => setDialog(null)}
                act={act}
                state={state}
                period={period}
                existing={dialog.income}
              />
            )}
            {dialog?.type === "account" && (
              <AccountForm
                close={() => setDialog(null)}
                act={act}
                account={dialog.account}
                current={balance[dialog.account]}
                correction={dialog.correction}
              />
            )}
            {dialog?.type === "overpay" && (
              <OverpayForm
                close={() => setDialog(null)}
                act={act}
                debt={dialog.debt}
                current={balance[`debt:${dialog.debt.id}`]}
              />
            )}
            {dialog?.type === "debt" && (
              <DebtForm
                close={() => setDialog(null)}
                act={act}
                state={state}
                period={period}
                existing={dialog.debt}
              />
            )}
            {dialog?.type === "patryk" && (
              <PatrykIncomeForm
                state={state}
                period={period}
                close={() => setDialog(null)}
                act={act}
              />
            )}
            {dialog?.type === "patrykExpense" && (
              <PatrykExpenseForm
                state={state}
                period={period}
                existing={dialog.row}
                close={() => setDialog(null)}
                act={act}
              />
            )}
            {dialog?.type === "patrykSavings" && (
              <PatrykSavingsForm
                state={state}
                period={period}
                kind={dialog.kind}
                close={() => setDialog(null)}
                act={act}
              />
            )}
            {dialog?.type === "target" && (
              <TargetForm
                close={() => setDialog(null)}
                act={act}
                value={state.settings.reserveTarget}
              />
            )}
            {dialog?.type === "confirm" && (
              <Confirm
                title={dialog.title}
                close={() => setDialog(null)}
                perform={dialog.perform}
                label={dialog.label}
                danger={dialog.danger}
              >
                {dialog.body}
              </Confirm>
            )}
            {dialog?.type === "allocate" && (
              <Allocation
                proposal={proposal}
                close={() => setDialog(null)}
                act={act}
                period={period}
              />
            )}
          </>
        )}
        <footer className="footer">
          <span>
            budżet. <span>Mały plan na większy spokój.</span>
          </span>
          <button onClick={() => void download()} disabled={!snapshot || busy}>
            <Download size={15} />
            Pobierz kopię
          </button>
        </footer>
      </main>
    </div>
  );
}
