# Ochrona danych

## Granice zaufania

Przeglądarka, JSON importu, nagłówki żądania i pola formularzy są nieufne. Aktywa: prywatne dane finansowe i ich integralność. Aplikacja rejestruje przepływy; nie wykonuje przelewów bankowych i nie przechowuje danych logowania do banków.

W produkcji Access stoi przed całą aplikacją. Worker dodatkowo weryfikuje podpis RS256 tokenu Access przez zaufany JWKS, issuer, audience, daty i dokładny adres właściciela. Zwykły nagłówek email nie jest dowodem tożsamości. Brak konfiguracji zamyka dostęp. JWT sprawdzamy bezpośrednio, ponieważ Static Assets może nie propagować ctx.access. Klucze JWKS pobierane wyłącznie z zadanej domeny cloudflareaccess.com.

## Ochrona zapisu

POST wymaga zgodnego Origin, własnego nagłówka i Content-Type JSON; brak CORS. Zod sprawdza ścisłe schematy oraz referencje i reguły domeny. Limit wejścia 4 MB także podczas strumieniowania. SQL parametryzowany. Rewizje i atomowy compare-and-swap chronią przed utratą zmian, klucze operacji i hash danych przed podwójnym zapisem. Kwoty w groszach. React koduje tekst użytkownika. CSP bez zewnętrznych skryptów, nagłówki ochronne i no-store dla danych. Brak tokenów lub finansów w localStorage, cache serwisowym i telemetrii.

## Lokalny podgląd

scripts/dev.mjs nasłuchuje tylko na 127.0.0.1; lokalny adapter jawnie ustawia LOCAL_DEVELOPMENT. Ten parametr nie jest zapisany w konfiguracji Cloudflare. Trybu lokalnego nie wystawiamy tunelem. Lokalny plik SQLite i kopie nie są commitowane. Podgląd nie udaje synchronizacji w chmurze.

## Przed publikacją

Ustawić dokładny OWNER_EMAIL, ACCESS_TEAM_DOMAIN i ACCESS_AUD. Utworzyć Access Free, IdP Google i politykę jednego adresu; chronić Worker ze wszystkimi adresami, wyłączyć preview URLs. Bez płatnych dodatków. Sprawdzić: anonimowe API 401/403, inne konto odmowa, własne konto poprawny zapis, poprawne aud/issuer, eksport i odtworzenie. Uruchomić pnpm audit, testy i build. Nie publikować danych przy nieukończonej ochronie.

## Kopie i aktualizacje

Pełny JSON po rozliczeniu, ręcznie zapisany do iCloud Drive; zawiera poufne dane, więc pozostaje na prywatnym koncie użytkownika. Import jest walidowany i wymaga potwierdzenia zastąpienia. D1 Free Time Travel 7 dni to dodatkowa ochrona. Co jakiś czas sprawdzić odtworzenie oraz aktualizacje zależności. Dane przechowywane do decyzji użytkownika. Przeniesienie do innego hostingu jest możliwe z kopią i kodem.

## Utrzymanie

Brak gwarancji dostępności darmowych planów. Access i limit wejścia ograniczają nadużycia, limity Free zatrzymują operacje. W aplikacji nie ma publicznych webhooków, publicznego uploadu ani rejestracji. Nie włączamy płatnych narzędzi monitorujących. Baza to nie E2EE: dostawca infrastruktury pozostaje stroną zaufaną.
