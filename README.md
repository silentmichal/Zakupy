# Nasze zakupy

Wspólna lista zakupów Michała i Oli. Wybierz profil, wpisz wspólne hasło, a następnie dodawaj i odhaczaj produkty. Oba profile korzystają z tej samej listy. Aplikacja synchronizuje widok po zapisie, po powrocie do karty i co 12 sekund, gdy karta jest widoczna.

## Wdrożenie w Vercel

1. Zaimportuj repozytorium w Vercel.
2. Utwórz prywatny magazyn Vercel Blob i podłącz go do projektu. W środowisku produkcyjnym potrzebny jest `BLOB_READ_WRITE_TOKEN` z uprawnieniami do tego magazynu.
3. Ustaw `HOUSEHOLD_PASSWORD_SHA256` (64-znakowy skrót SHA-256 losowego hasła) i `SESSION_SECRET` (niezależny sekret sesji).
4. Wdróż projekt w środowisku Production. Zmiana zmiennych wymaga nowego wdrożenia. Zmiana sekretu sesji wyloguje oba profile.

Wygeneruj hasło poleceniem `openssl rand -hex 16` i zachowaj wynik w menedżerze haseł. Aby obliczyć skrót bez wpisywania hasła do historii w terminalu Bash, wykonaj `read -rs SHOPPING_PASSWORD; printf '%s' "$SHOPPING_PASSWORD" | openssl dgst -sha256; unset SHOPPING_PASSWORD` i wklej hasło po uruchomieniu polecenia. Sekret sesji wygeneruj osobno poleceniem `openssl rand -hex 32`.

Do pracy lokalnej użyj `npm ci`, a następnie `npx vercel dev` po skonfigurowaniu zmiennych w `.env.local`. Do lokalnych operacji na danych podłącz osobny prywatny magazyn.
