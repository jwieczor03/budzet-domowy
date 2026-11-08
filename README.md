# Budżet domowy

Prywatny planer budżetu osobistego i domowego po polsku. React, TypeScript i Vite; backend Cloudflare Workers z bazą D1. Lokalny podgląd zapisuje dane w SQLite.

## Funkcje

- Planowanie w okresach od 10. do 9. dnia miesiąca, stałe pozycje i subskrypcje.
- Rozdysponowanie wypłaty, jednorazowe wpływy i wydatki, cele oraz notatki.
- Zobowiązania, raty 0%, nadpłaty i informacje do przelewów.
- Konto oszczędnościowe, obligacje, wpłaty, wypłaty i korekty.
- Podział wspólnych kosztów i historia wspólnego konta.
- Informacyjny budżet drugiej osoby, oszczędności i statystyki.
- Start z podglądem trzech okresów oraz eksport i import pełnej kopii JSON.

Oznaczenie pozycji jako rozdysponowanej oznacza przekazanie pieniędzy na dany cel lub opłacenie raty. Aplikacja nie wykonuje przelewów bankowych.

## Uruchomienie lokalne

Wymagany Node.js 24 i pnpm w wersji wskazanej w `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm preview
```

Otwórz `http://127.0.0.1:5173/`. Dane zapisują się w `.local/budget.sqlite`; nowa instalacja zaczyna od pustego budżetu. Opcjonalna zmienna `BUDGET_LOCAL_DB` wybiera inny plik dla `pnpm preview`.

```sh
BUDGET_LOCAL_DB=.local/moj-budzet.sqlite pnpm preview
```

Tryb deweloperski z odświeżaniem widoku: `pnpm dev`. Używa domyślnej bazy `.local/budget.sqlite`. Nie uruchamiaj go równocześnie z podglądem na tym samym porcie.

## Kontrola zmian

```sh
pnpm test
pnpm typecheck
pnpm format:check
pnpm build
```

## Wdrożenie

Konfiguracja w `wrangler.jsonc` stanowi szablon; aplikacja nie jest automatycznie wdrażana przez publikację tego repozytorium.

1. Utwórz bazę Cloudflare D1 i uzupełnij jej identyfikator.
2. Skonfiguruj Cloudflare Access przed całą aplikacją, ograniczając dostęp do wybranej tożsamości.
3. Uzupełnij `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` i `OWNER_EMAIL` dla weryfikacji po stronie serwera.
4. Zastosuj migracje poleceniem `pnpm db:remote` i wdróż przez `pnpm deploy`.
5. Zweryfikuj odrzucanie nieautoryzowanych żądań, zapis danych i odtworzenie kopii przed użyciem rzeczywistych danych.

Bez wymaganej konfiguracji uwierzytelnienia dostęp produkcyjny jest zamknięty. Wyjątek dla lokalnego podglądu ograniczono do loopback; lokalnego serwera nie należy wystawiać publicznie. Szczegóły: [SECURITY.md](SECURITY.md).

## Dane i dokumentacja

Repozytorium zawiera kod, migracje i testy. Lokalne bazy, eksporty, zrzuty ekranu oraz sekrety nie są częścią repozytorium. Pełną kopię danych można pobrać z aplikacji; kopie zawierają prywatne informacje finansowe i należy je przechowywać poza publicznym repozytorium.

- [Specyfikacja](SPECYFIKACJA.md)
- [Zasady interakcji](UX-CONTRACT.md)
- [Projekt interfejsu](DESIGN.md)
- [Bezpieczeństwo](SECURITY.md)
