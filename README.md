# MealFlow 2.3.3

MealFlow ist eine deutschsprachige Haushalts-App für **iPhone, Android und Web**. Alle Plattformen verwenden denselben Supabase-Account und dieselben Realtime-Daten.

## Hauptbereiche

- **Heute** – heutige Planung und Schnellübersicht
- **4-Wochen-Plan** – aktuelle Kalenderwoche plus drei weitere Wochen; pro Tag Abendessen + „Für Saskia“
- **Einkauf** – gemeinsame Realtime-Einkaufsliste, automatische Lidl-orientierte Sortierung und Einkaufsmodus
- **Notizen** – private Notizen; einzelne Notizen können gezielt mit Haushaltsmitgliedern geteilt werden
- **Haushalt & Einstellungen** – Mitglieder, Einladungsrechte, Darstellung, Cozy Mode und Neutral Dark Mode

## Web-Version

**Produktion:** https://mealflow-blush.vercel.app

Die Browser-App liegt in `App.web.tsx`. Expo/Metro verwendet sie automatisch für die Web-Plattform, während iOS und Android weiterhin `App.tsx` verwenden.

Die Web-Oberfläche ist responsiv:

- Desktop: feste linke Navigation und breite Inhaltsbereiche
- Tablet/kleine Browserfenster: kompakteres Layout
- Mobile Browser: Bottom-Navigation ähnlich der App

Web und Mobile teilen Supabase Auth, PostgreSQL, RLS und Realtime. Dadurch erscheinen Änderungen an Einkauf, Haushalt, Wochenplan oder Notizen geräteübergreifend.

### Web lokal starten

```bash
npm ci
npm run web
```

### Produktions-Build

```bash
npm run typecheck
npm run build:web
```

Der statische SPA-Build wird nach `dist/` exportiert.

### Vercel

`vercel.json` ist für den Web-Build vorbereitet:

- Build Command: `npm run build:web`
- Output Directory: `dist`

Der GitHub-Workflow `.github/workflows/build-web.yml` führt bei Web-relevanten Änderungen TypeScript-Prüfung und Expo-Web-Export aus und stellt `MealFlow-Web` als Build-Artefakt bereit.

## Supabase & Sicherheit

Die Clients verwenden nur die öffentliche Supabase-Konfiguration (`EXPO_PUBLIC_SUPABASE_URL` und Publishable Key). Secret-/Service-Role-Keys gehören niemals in iOS-, Android- oder Web-Clients.

Zugriffe werden über Supabase RLS geregelt. Gemeinsame Haushaltsdaten bleiben an den aktiven Haushalt gebunden; persönliche Notizen sind standardmäßig privat und nur explizit freigegebene Notizen können von anderen Haushaltsmitgliedern gelesen werden.

## Native Builds

- Android: `.github/workflows/build-android-apk.yml` → signierte APK
- iOS: `.github/workflows/build-ios-sidestore.yml` → SideStore-IPA
- Web: `.github/workflows/build-web.yml` → `dist/` / `MealFlow-Web`

Die sichtbare App-Version wird direkt aus `app.json` gelesen.
