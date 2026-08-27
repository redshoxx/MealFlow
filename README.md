# MealFlow 1.2

MealFlow ist eine gemeinsame iPhone-/Android-App für Abendessen-Wochenplanung, Einkaufsliste mit Mengen und Einheiten sowie Rezeptsuche aus dem Internet.

## Plattformen

- iPhone: IPA für SideStore
- Android: signierte, installierbare APK
- Gemeinsame Cloud-Synchronisierung über Appwrite
- Appwrite Account + TablesDB + Realtime
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
- Appwrite E-Mail-/Passwort-Login
- Realtime-Synchronisierung zwischen iPhone und Android
- Lokaler Demo-Modus, solange Appwrite nicht konfiguriert ist

## Appwrite

Die App verwendet den offiziellen React-Native-Appwrite-SDK.

Die vollständige Einrichtung steht in `appwrite/SETUP.md`.

Kurzfassung:

1. Appwrite-Projekt erstellen.
2. Apple- und Android-Plattform mit `at.mealflow.app` hinzufügen.
3. Datenbank `mealflow` erstellen.
4. Tabellen `shopping_items` und `meal_plan` gemäß `appwrite/SETUP.md` anlegen.
5. Row security aktivieren und nur CREATE für authentifizierte Benutzer auf Tabellenebene erlauben.
6. `.env.example` nach `.env` kopieren und Endpoint/IDs einsetzen.

Die `EXPO_PUBLIC_APPWRITE_*` Werte sind öffentliche Client-Konfiguration. **Keinen Appwrite API Key in die Mobile-App eintragen.**

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

Der Workflow **Build iOS IPA for SideStore** erstellt eine unsignierte App und verpackt sie als `MealFlow-SideStore.ipa`.

SideStore signiert die IPA beim Import mit dem persönlichen Apple-ID-Entwicklungszertifikat neu.

## Wichtige Projektdateien

- `App.tsx` – Mobile UI und App-Logik
- `src/lib/appwrite.ts` – Appwrite Client, Account und Realtime
- `src/lib/cloud.ts` – TablesDB-Zugriff und Synchronisierung
- `src/lib/recipes.ts` – Internet-Rezeptsuche
- `appwrite/SETUP.md` – Appwrite-Datenbank- und Berechtigungssetup
- `.github/workflows/build-android-apk.yml` – APK Build
- `.github/workflows/build-ios-sidestore.yml` – SideStore IPA Build

## Sicherheit

- Kein Appwrite API Key im Client
- Private Row-Permissions pro Benutzer
- Keine globale READ/UPDATE/DELETE-Freigabe
- `.env` wird nicht committed
