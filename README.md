# nowestruktury.pl – jak to postawić (za darmo)

Strona to zwykłe pliki (HTML/JS). GitHub Pages je hostuje, a Supabase trzyma konta, wiki, forum, bibliotekę i zdjęcia.

| Plik | Co to |
|---|---|
| `index.html`, `dash.js` | intro, logowanie i main menu w stylu klasycznego dashboardu (kula 3D z twarzą, menu na łuku) |
| `xb3d.js` | wspólne elementy 3D: kopuła z siatką, poświaty |
| `face.png` | zdjęcie twarzy do kuli w menu |
| `tv.js` | telewizor 3D do apki YouTube |
| `game.html`, `game.js` | gra Lobby (ruch Source, bhop, podnoszenie przekąsek) |
| `wiki.html` | Wikipedia Bro (wiele wiki, każdy może tworzyć/edytować strony) |
| `forum.html` | Forum Bro (wątki, odpowiedzi, zdjęcia, linki) |
| `library.html` | Biblioteka Bro (linki do stron ze zdjęciem) |
| `youtube.html` | YouTube w telewizorze 3D |
| `shop.html` | Sklep – na razie pusty |
| `admin.html` | zakładanie kont (widzą tylko admini) |
| `common.js` | **tu wpisujesz dane Supabase** |
| `supabase.sql` | baza danych – wklejasz raz w Supabase |

## 1. Supabase (baza i konta)

1. Załóż konto na https://supabase.com → **New project** (region: Frankfurt lub inny w UE). Zapisz hasło bazy.
2. **SQL Editor** → wklej całą zawartość `supabase.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email**: wyłącz **Confirm email** (konta mają sztuczne e-maile, więc potwierdzenie i tak by nie doszło). Rejestracja (**Allow new users to sign up**) ma zostać **włączona**, bo przez nią panel admina zakłada konta. Ktoś obcy, kto zarejestruje się bezpośrednio przez API, nie dostanie dostępu do niczego, bo nie ma wpisu w tabeli `profiles`.
4. **Pierwszy admin** (tylko raz):
   - **Authentication → Users → Add user → Create new user**
     e-mail: `twojnick@users.nowestruktury.pl`, hasło: dowolne, zaznacz **Auto Confirm User**.
   - **SQL Editor** → uruchom (podmień nick w dwóch miejscach):
     ```sql
     insert into profiles (id, nick, is_admin)
     select id, 'twojnick', true from auth.users where email = 'twojnick@users.nowestruktury.pl';
     ```
5. **Project Settings → API**: skopiuj **Project URL** i klucz **anon public** do górnej części `common.js`.
6. **Authentication → URL Configuration → Site URL**: `https://nowestruktury.pl`.

Kolejne konta zakładasz już na stronie: bańka **Admin** → nick + hasło.

## 2. GitHub Pages (hosting)

1. Załóż konto na https://github.com → **New repository** (np. `nowestruktury`, **Public**).
2. **Add file → Upload files** → przeciągnij wszystkie pliki z tego folderu (razem z `CNAME`) → **Commit**.
3. **Settings → Pages → Source: Deploy from a branch → main / (root)** → Save.
4. Na tej samej stronie w **Custom domain** powinno być `nowestruktury.pl`. Gdy DNS zacznie działać (krok 3), zaznacz **Enforce HTTPS**.

## 3. Domena na hostido.pl

W panelu Hostido → domena → **Strefa DNS** (Zarządzaj DNS) ustaw:

| Typ | Nazwa | Wartość |
|---|---|---|
| A | `@` (nowestruktury.pl) | 185.199.108.153 |
| A | `@` | 185.199.109.153 |
| A | `@` | 185.199.110.153 |
| A | `@` | 185.199.111.153 |
| CNAME | `www` | `TWOJLOGIN.github.io` |

Usuń stare rekordy A dla `@`, jeśli wskazują gdzie indziej. Zmiana DNS może potrwać od kilku minut do 24 h.

## Ważne

- Konto bez wpisu w `profiles` nie ma dostępu do niczego. **Odbierz dostęp** w panelu admina usuwa ten wpis. Wpisy użytkownika zostają, tylko bez autora. Tego samego nicku nie da się potem założyć ponownie z panelu. Trzeba najpierw usunąć użytkownika w Supabase → Authentication → Users.
- Hasło zapomniane? Supabase → Authentication → Users → użytkownik → **Reset password** nie zadziała (sztuczny e-mail). Zamiast tego usuń go tam i załóż konto od nowa.
- Ekran logowania działa w przeglądarce. Pliki strony (np. sama gra) są publiczne dla kogoś, kto zna adres pliku. Wszystkie **dane** (wiki, forum, biblioteka, zdjęcia do wrzucania) są chronione przez Supabase.
- Darmowy Supabase usypia projekt po 7 dniach bez żadnego ruchu. Wtedy w panelu klikasz **Restore**.
- Dopóki `common.js` jest pusty, strona działa w **trybie podglądu** (menu, gra, YouTube bez logowania).

## Sterowanie w grze

WASD – ruch · Spacja (trzymaj) – skok / bunny hop · mysz – rozglądanie · E – podnieś · lewy przycisk / Q – rzuć · Esc – pauza.
Bhop: trzymaj spację, trzymaj tylko A albo D i płynnie skręcaj myszką w tę samą stronę. Prędkość rośnie powyżej 260.
