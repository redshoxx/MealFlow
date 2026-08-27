# MealFlow 1.1

MealFlow ist eine gemeinsame iPhone-/Android-App für Abendessen-Wochenplanung, Einkaufsliste mit Mengen und Einheiten sowie Rezeptsuche aus dem Internet.

## Plattformen

- iPhone: IPA für SideStore
- Android: installierbare APK
- Gemeinsame Cloud-Synchronisierung über Supabase
- Optimiert für iPhone 12, gleichzeitig responsiv für Android
- Keine Alexa-Integration

## Funktionen

- Wochenplan Montag bis Sonntag, bewusst nur für Abendessen
- Einkaufsliste mit Produkt, Menge und Einheit
- Einheiten u. a. Stk., Pkg., g, kg, ml, l, EL, TL, Bund und Dose
- iOS-artiger Mengen-/Einheiten-Picker
- Artikel abhaken und löschen
- Rezeptsuche aus dem Internet
- Rezeptdetails mit Zutaten und Mengen
- Rezeptzutaten direkt auf die Einkaufsliste übernehmen
- Rezept direkt in den Wochenplan übernehmen
- Supabase Auth + PostgreSQL + Realtime-Synchronisierung
- Lokaler Demo-Modus ohne Supabase

## Lokaler Start

Voraussetzung: Node.js 22+

```bash
npm install
npm run typecheck
npx expo start
```

Zum Testen kann Expo Go verwendet werden. Für die endgültige Installation sind die unten beschriebenen Builds vorgesehen.

## Supabase verbinden

1. Supabase-Projekt anlegen.
2. `supabase/schema.sql` im SQL Editor ausführen.
3. `.env.example` nach `.env` kopieren.
4. `EXPO_PUBLIC_SUPABASE_URL` und `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` eintragen.
5. Für die Rezeptsuche die Edge Function unter `supabase/functions/recipe-search` deployen.

Secrets für Edamam bleiben serverseitig und werden nicht in die Mobile-App geschrieben.

## Android APK

GitHub Actions führt bei jedem Push auf `main` automatisch den Workflow **Build Android APK** aus.

Das Ergebnis heißt:

`MealFlow-Android.apk`

Es liegt nach erfolgreichem Workflow als GitHub-Actions-Artefakt bereit.

Alternativ mit EAS:

```bash
npx eas-cli@latest build -p android --profile android-apk
```

## iPhone / SideStore

Der GitHub-Workflow **Build iOS IPA for SideStore** erzeugt auf einem macOS Runner eine unsignierte iPhone-App und verpackt sie als:

`MealFlow-SideStore.ipa`

Diese IPA ist für das anschließende Resigning durch SideStore gedacht. SideStore signiert sideloaded Apps mit dem persönlichen Apple-ID-Entwicklungszertifikat neu und installiert sie anschließend auf dem Gerät.

Installation:

1. Erfolgreichen GitHub Workflow öffnen.
2. Artefakt `MealFlow-SideStore-IPA` laden.
3. ZIP-Artefakt entpacken.
4. `MealFlow-SideStore.ipa` auf dem iPhone in SideStore öffnen/importieren.
5. SideStore übernimmt Signierung und Installation.

Bei einem kostenlosen Apple-ID-Entwicklungszertifikat gelten die normalen SideStore-/Apple-Beschränkungen, insbesondere die regelmäßige Erneuerung der Signierung.

## Wichtige Projektdateien

- `App.tsx` – Mobile UI und App-Logik
- `src/lib/cloud.ts` – Cloud-/Realtime-Zugriff
- `src/lib/supabase.ts` – Supabase Client
- `src/lib/recipes.ts` – Rezeptsuche
- `supabase/schema.sql` – Datenbankschema + RLS
- `supabase/functions/recipe-search` – geschützter Rezept-API-Proxy
- `.github/workflows/build-android-apk.yml` – APK Build
- `.github/workflows/build-ios-sidestore.yml` – SideStore IPA Build

## Sicherheit

- Kein Supabase Service Role Key in der App
- Rezept-API-Schlüssel nur serverseitig
- RLS auf den synchronisierten Tabellen
- `.env` wird nicht in Git committed
