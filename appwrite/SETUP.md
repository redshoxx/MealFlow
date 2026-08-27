# Appwrite Setup für MealFlow

MealFlow verwendet Appwrite Account, TablesDB und Realtime.

## 1. Projekt und Plattformen

Erstelle ein Appwrite-Cloud-Projekt und füge zwei Plattformen hinzu:

- Apple Bundle ID: `at.mealflow.app`
- Android Package: `at.mealflow.app`

Kopiere anschließend Endpoint und Project ID in `.env`.

## 2. Datenbank

Erstelle eine Datenbank mit der ID `mealflow`.

### Tabelle `shopping_items`

Aktiviere **Row security** und lege folgende Spalten an:

| Key | Typ | Erforderlich | Standard |
| --- | --- | --- | --- |
| `name` | varchar/string, 160 | ja | — |
| `amount` | float | ja | — |
| `unit` | varchar/string, 32 | ja | — |
| `done` | boolean | ja | `false` |

Tabellenberechtigung:

- CREATE: `users`

Keine globale READ/UPDATE/DELETE-Berechtigung vergeben. Bei Zeilen, die über den Client SDK erzeugt werden, vergibt Appwrite standardmäßig private Rechte an den Ersteller.

### Tabelle `meal_plan`

Aktiviere **Row security** und lege folgende Spalten an:

| Key | Typ | Erforderlich | Standard |
| --- | --- | --- | --- |
| `day` | varchar/string, 16 | ja | — |
| `meal` | varchar/string, 240 | nein | — |

Tabellenberechtigung:

- CREATE: `users`

Auch hier keine globale READ/UPDATE/DELETE-Berechtigung vergeben.

## 3. Umgebungsvariablen

`.env.example` nach `.env` kopieren und die Appwrite-Werte eintragen.

```env
EXPO_PUBLIC_APPWRITE_ENDPOINT=https://YOUR-REGION.cloud.appwrite.io/v1
EXPO_PUBLIC_APPWRITE_PROJECT_ID=YOUR_PROJECT_ID
EXPO_PUBLIC_APPWRITE_DATABASE_ID=mealflow
EXPO_PUBLIC_APPWRITE_SHOPPING_TABLE_ID=shopping_items
EXPO_PUBLIC_APPWRITE_MEAL_PLAN_TABLE_ID=meal_plan
EXPO_PUBLIC_APPWRITE_PLATFORM=at.mealflow.app
```

Diese Werte sind Client-Konfiguration und keine Appwrite API Keys. Einen Server/API-Key niemals in `EXPO_PUBLIC_*` speichern.

## 4. Synchronisierung

Melde dich auf iPhone und Android mit demselben MealFlow/Appwrite-Account an. Einkaufsliste und Wochenplan werden über Appwrite TablesDB gespeichert und über Realtime auf beide Geräte aktualisiert.
