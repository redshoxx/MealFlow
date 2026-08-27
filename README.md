# MealFlow 1.3

MealFlow ist eine gemeinsame iPhone-/Android-App für Abendessen-Wochenplanung, Einkaufsliste mit Mengen und Einheiten sowie Rezeptsuche aus dem Internet.

## Plattformen

- iPhone: IPA für SideStore
- Android: signierte, installierbare APK
- Gemeinsame Cloud-Synchronisierung über Supabase
- Supabase Auth + PostgreSQL + Realtime
- Optimiert für iPhone 12 und responsiv für Android
- Keine Alexa-Integration

## Funktionen

- Wochenplan Montag bis Sonntag, bewusst nur für Abendessen
- Einkaufsliste mit Produkt, Menge und Einheit
- Einheiten u. a. Stk., Pkg., g, kg, ml, l, EL, TL, Bund und Dose
- iOS-artiger Mengen-/Einheiten-Picker
- Artikel abhaken und löschen
- Rezeptsuche aus dem Internet über TheMealDB
- Rezeptdetails mit Zutaten
- Rezeptzutaten direkt auf die Einkaufsliste übernehmen
- Rezept direkt in den Wochenplan übernehmen
- Supabase E-Mail-/Passwort-Login
- Realtime-Synchronisierung zwischen iPhone und Android

## Supabase

Das aktuell verbundene Supabase-Projekt wird über `EXPO_PUBLIC_SUPABASE_URL` und `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` angesprochen.

Die Tabellen `shopping_items` und `meal_plan` sind mit Row Level Security geschützt. Jeder Benutzer sieht und verändert nur Datensätze, deren `owner_id` seiner Supabase-User-ID entspricht.

Die Migration liegt unter:

`supabase/migrations/202608271210_create_mealflow_core.sql`

Wichtig: Ein `SUPABASE_SECRET_KEY` gehört niemals in die Mobile-App, `.env.example`, GitHub Actions oder das Repository.

## Lokaler Start

Voraussetzung: Node.js 22+

```bash
npm install
npm run typecheck
npx expo start
```

## Android APK

Der Workflow **Build Android APK** erzeugt eine signierte Sideload-APK und verifiziert die APK-Signatur.

Ergebnis: `MealFlow-Android.apk`

## iPhone / SideStore

Der Workflow **Build iOS IPA for SideStore** erstellt eine IPA für die Installation über SideStore.

Ergebnis: `MealFlow-SideStore.ipa`

## Wichtige Projektdateien

- `App.tsx` – Mobile UI und App-Logik
- `src/lib/supabase.ts` – Supabase Client und Auth-Session
- `src/lib/cloud.ts` – PostgreSQL-Datenzugriff für Einkaufsliste und Wochenplan
- `src/lib/recipes.ts` – Internet-Rezeptsuche
- `supabase/migrations/202608271210_create_mealflow_core.sql` – Datenbankschema, RLS und Realtime
- `.github/workflows/build-android-apk.yml` – APK Build
- `.github/workflows/build-ios-sidestore.yml` – SideStore IPA Build

## Sicherheit

- Nur der öffentliche Supabase Publishable Key wird im Mobile-Client verwendet
- Kein Secret Key im Repository
- Row Level Security ist für beide Tabellen aktiviert
- Datenzugriffe sind an `auth.uid()` gebunden
