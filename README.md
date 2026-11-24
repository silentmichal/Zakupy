# Nasze zakupy

Wspólna lista zakupów Michała i Oli. Wpisz wspólne hasło, a następnie wybierz profil. Produkt możesz wpisać ręcznie lub wybrać z katalogu. Przycisk „Wyczyść całą listę” usuwa pozycje widoczne w chwili kliknięcia, również te odhaczone. Oba profile korzystają z tej samej listy. Aplikacja synchronizuje widok po zapisie, po powrocie do karty i co 12 sekund, gdy karta jest widoczna.

## Wdrożenie w Vercel

1. Zaimportuj repozytorium w Vercel.
2. Utwórz prywatny magazyn Vercel Blob i podłącz go do projektu. W środowisku produkcyjnym potrzebny jest `BLOB_READ_WRITE_TOKEN` z uprawnieniami do tego magazynu.
3. Ustaw `app_password` (wspólne hasło) i `SESSION_SECRET` (niezależny sekret sesji) jako zmienne środowiskowe dostępne dla Production.
4. Wdróż projekt w środowisku Production. Zmiana zmiennych wymaga nowego wdrożenia. Zmiana hasła lub sekretu sesji wyloguje oba profile.

Wygeneruj hasło poleceniem `openssl rand -hex 16` i zachowaj wynik w menedżerze haseł. Sekret sesji wygeneruj osobno poleceniem `openssl rand -hex 32`.

Do pracy lokalnej użyj `npm ci`, a następnie `npx vercel dev` po skonfigurowaniu zmiennych w `.env.local`. Do lokalnych operacji na danych podłącz osobny prywatny magazyn.
