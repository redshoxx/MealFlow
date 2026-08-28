# MealFlow 2.2.9

MealFlow ist eine deutschsprachige iPhone-/Android-App für gemeinsame Abendessenplanung, Einkauf und Rezepte. Die App ist auf iPhone 12 optimiert, nutzt Supabase für Auth/PostgreSQL/Realtime und wird als SideStore-IPA sowie signierte Android-APK gebaut.

## Neu in 2.2.9

### Budget statt Vorrat
- eigener Hauptbereich **Budget** anstelle des bisherigen Vorrats
- Kostenschätzung für die aktuell offene Einkaufsliste
- haushaltsweit speicherbare Produktpreise mit Einheiten
- Monatsbudget mit grün/orange/roter Budget-Ampel
- Anzeige von geschätzt ausgegeben, geplant und verbleibendem Budget
- lokaler Fallback, falls die neue Budget-Migration noch nicht auf Supabase eingespielt wurde

## Neu in 2.1

### Gemeinsame Haushalte
- jeder Account startet mit einem privaten Haushalt
- gemeinsame Einkaufsliste, Wochenplan und eigene Rezepte über `household_id`
- Mitglieder und Rollen (`owner`, `admin`, `member`)
- Beitritt per Haushaltscode
- E-Mail-Einladungen mit 14 Tage gültigem Einladungscode
- aktiver Haushalt wird pro Profil gespeichert
- bestehende Einzeluser-Daten werden beim Upgrade automatisch in den persönlichen Haushalt übernommen
- bei erledigten Einkaufsartikeln werden `completed_by` und `completed_at` gespeichert; die App zeigt den Namen der Person an
- alle Haushaltsdaten bleiben durch Supabase RLS getrennt

### Rezeptsuche für AT/DE
- TheMealDB als externe Quelle
- zusätzliche eigene `recipe_catalog`-Datenbank mit österreichischen/deutschen Startgerichten
- Filter nach maximaler Zeit, vegetarisch und vorhandener Zutat
- Schalter „Nicht wieder diese Woche“ blendet bereits geplante Gerichte aus
- Kochverlauf über `meal_history`; auf Rezeptkarten wird „zuletzt gekocht“ angezeigt
- saisonale Quick-Search-Begriffe, u. a. Schnitzel, Knödel, Eintopf, Ofengemüse, Kürbis und Eierschwammerl

### Neues App-Icon
Das App-Icon wird deterministisch aus `scripts/generate-app-icon.cjs` erzeugt und über `app.config.js` in iOS und Android eingebunden. Dadurch liegt kein manuell gepflegtes Binär-Asset im Repository und beide Plattformen erhalten dasselbe Markenbild.

## Navigation
- **Heute** – heutiges Abendessen, Haushalt, offene Einkäufe und „Als gekocht markieren“
- **Woche** – Montag bis Sonntag, nur Abendessen
- **Einkauf** – gemeinsame Realtime-Liste mit Menge, Einheit und „erledigt von …“
- **Rezepte** – AT/DE-Katalog, Online-Suche, Filter und gemeinsame eigene Rezepte
- **Konto & Einstellungen** – Haushalt, Mitglieder, Einladen und Profil

## Supabase
Die Mobile-App verwendet ausschließlich `EXPO_PUBLIC_SUPABASE_URL` und den Publishable Key. Secret-/Service-Role-Keys gehören niemals in die App.

Migrationen:
- `supabase/migrations/202608271210_create_mealflow_core.sql`
- `supabase/migrations/202608271245_add_custom_recipes.sql`
- `supabase/migrations/202608271315_mealflow_2_1_households_recipes_history.sql`

RLS ist für Haushalte, Profile, Mitglieder, Einladungen, Einkauf, Wochenplan, eigene Rezepte und Kochverlauf aktiviert.

## Lokaler Start
```bash
npm install
npm run typecheck
npx expo start
```

## Builds
- Android: `.github/workflows/build-android-apk.yml` → signierte `MealFlow-Android.apk`
- iOS: `.github/workflows/build-ios-sidestore.yml` → `MealFlow-SideStore.ipa`
- SideStore Source: `https://raw.githubusercontent.com/redshoxx/MealFlow/main/source.json`

Der iOS-Workflow veröffentlicht neue Builds automatisch als GitHub Release und aktualisiert `source.json`, damit SideStore neue Versionen als Update erkennt.
