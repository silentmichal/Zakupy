# Nasze zakupy

Wspólna lista zakupów Michała i Oli. Wpisz wspólne hasło, a następnie wybierz profil. W zakładce „Produkty” możesz wybrać produkt z katalogu, wpisać go ręcznie lub zapisać go we wspólnym katalogu. Przycisk „Wyczyść całą listę” usuwa pozycje widoczne w chwili kliknięcia, również te odhaczone. Oba profile korzystają z tej samej listy. Aplikacja synchronizuje widok po zapisie, po powrocie do karty i co 12 sekund, gdy karta jest widoczna.

Po dwóch odhaczeniach tego samego produktu aplikacja może podpowiedzieć go w sekcji „Często kupujecie”. Wyczyszczenie listy zachowuje wspólną historię zakupów. Sekcja „Przepisy z Cookidoo” dopasowuje produkty widoczne na liście do wybranych przepisów i otwiera oficjalną stronę przepisu.

Data utworzenia listy jest zapisywana po dodaniu pierwszego produktu do pustej listy. Historia pokazuje kupione produkty, profil osoby odhaczającej i czas odhaczenia. Gdy lista zostanie opróżniona, bieżący wpis trafia do historii z datą zakończenia. Daty wcześniejszych list pozostają nieznane.

Nad bieżącą listą widać datę i godzinę ostatniego dodania, a przy nowych produktach ich własny czas dodania. Odhaczanie i usuwanie pozycji z bieżącej listy nie zmienia czasu ostatniego dodania.

## Wdrożenie w Vercel

1. Zaimportuj repozytorium w Vercel.
2. Utwórz prywatny magazyn Vercel Blob i podłącz go do projektu. W środowisku produkcyjnym potrzebny jest `BLOB_READ_WRITE_TOKEN` z uprawnieniami do tego magazynu.
3. Ustaw `app_password` (wspólne hasło) i `SESSION_SECRET` (niezależny sekret sesji) jako zmienne środowiskowe dostępne dla Production.
4. Wdróż projekt w środowisku Production. Zmiana zmiennych wymaga nowego wdrożenia. Zmiana hasła lub sekretu sesji wyloguje oba profile.

Wygeneruj hasło poleceniem `openssl rand -hex 16` i zachowaj wynik w menedżerze haseł. Sekret sesji wygeneruj osobno poleceniem `openssl rand -hex 32`.

Do pracy lokalnej użyj `npm ci`, a następnie `npx vercel dev` po skonfigurowaniu zmiennych w `.env.local`. Do lokalnych operacji na danych podłącz osobny prywatny magazyn.
