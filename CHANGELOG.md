# MealFlow Changelog

## 2.2.3

- Android Auto-Updater: prüft beim Start automatisch das offizielle MealFlow-Update-Manifest, lädt neue APKs direkt von GitHub Releases und öffnet anschließend den Android-Installer.
- Android-Einstellungen enthalten zusätzlich eine manuelle Aktion „Nach Updates suchen“.
- Android-System-/Gestenleiste kollidiert nicht mehr mit den wichtigsten unteren Formularen und Sheets; Safe-Area-Abstände gelten jetzt auch dort.
- Einstellungen und Haushaltsverwaltung respektieren auf iPhone und Android die obere und untere Safe Area.
- MHD kann auf Android und iPhone über eine native Datumsauswahl gesetzt und wieder entfernt werden.
- Haushaltsrechte verschärft: Standardmäßig darf nur der Haushaltsersteller neue Personen einladen.
- Der Haushaltsersteller kann einzelnen Mitgliedern das Recht „Neue Personen einladen“ geben oder wieder entziehen.
- Permanente Haushaltscodes werden nicht mehr zum Beitritt akzeptiert; neue geteilte Codes sind 14 Tage gültige Einmal-Einladungen.
- Android-Builds werden zusätzlich als GitHub Release veröffentlicht und erzeugen automatisch `android-update.json` für den In-App-Updater.
- Version 2.2.3, iOS Build 15, Android Version Code 15.

## 2.2.2

- Einkaufsliste: Löschgeste mit flüssigem Ausblenden und Zusammenklappen statt abruptem Entfernen.
- MHD-Warnungen für Produkte, die in den nächsten drei Tagen ablaufen.
- Produkte mit heutigem oder überschrittenem MHD werden deutlich rot hervorgehoben.
- Lokale iOS-/Android-Benachrichtigungen einige Tage vor dem MHD und am Ablaufdatum; dafür wird die Benachrichtigungsfreigabe des Geräts benötigt.
- Vorratsseite minimalistischer und auf Scannen, offene Einkäufe, MHD und vorhandene Produkte reduziert.
- Heute-Übersicht zeigt bis zu drei bald ablaufende Vorratsprodukte.
- Spracheingabe versteht strukturierte Angaben wie „2 Liter Milch“, „500 Gramm Nudeln“ oder „3 Packungen Joghurt“.
- Startbildschirm mit echtem Ladefortschritt von 0 bis 100 Prozent entlang der geladenen Datenphasen und kurzer Mindestanzeige.
- Vorrats-Realtime-Updates entprellt, parallele Refreshes verhindert und Datenabfragen begrenzt.
- Open-Food-Facts-Abrufe mit Timeout, Barcode-Validierung, HTTPS-Bildvalidierung und begrenzten Text-/Mengenwerten gehärtet.
- App-Version 2.2.2, iOS Build 14, Android Version Code 14.

## 2.2.1

- Kalorienseite aus der Hauptnavigation entfernt und durch den gemeinsamen Vorrat ersetzt.
- Erledigte Einkäufe erscheinen automatisch im Bereich „Nach dem Einkauf“.
- Gekaufte Produkte werden klar als „noch zu scannen“ oder bereits erfasst angezeigt.
- Barcode-Scanner erkennt Produkte über Open Food Facts und übernimmt Name, Marke und Bild.
- Gescannte Einkaufsprodukte werden dauerhaft als in den Vorrat übernommen markiert.
- Menge und Einheit werden beim Übernehmen festgelegt und können später bearbeitet werden.
- Optionales Mindesthaltbarkeitsdatum mit Hinweisen für bald fällige oder überschrittene MHDs.
- Produkte können jederzeit vollständig manuell und ohne Barcode angelegt werden.
- Vorratsprodukte können gesucht, bearbeitet und nach Verbrauch entfernt werden.
- Vorrat ist für alle Mitglieder des aktiven MealFlow-Haushalts synchronisiert.
- Startseiten-Einstellung „Kalorien“ wird automatisch auf „Vorrat“ migriert.
- App-Version 2.2.1, iOS Build 13, Android Version Code 13.

## 2.2.0

- Rezeptseite aus der Hauptnavigation entfernt und durch einen persönlichen Kalorienzähler ersetzt.
- Individuelle Ernährungseinträge und Tagesziele pro Benutzer mit eigener Supabase-RLS eingeführt; Haushaltsmitglieder sehen die Ernährungstage der anderen nicht.
- Professionelle Tagesübersicht mit verbleibenden Kalorien, Tagesziel und Makro-Fortschritt.
- Frühstück, Mittagessen, Abendessen und Snacks als übersichtliche getrennte Bereiche.
- Barcode-Scanner über expo-camera für EAN-13, EAN-8 und UPC-Barcodes.
- Produktdaten, Produktbilder und Nährwerte werden nach dem Scan über Open Food Facts geladen.
- Mengenänderung berechnet Kalorien, Eiweiß, Kohlenhydrate und Fett live auf die gewählte Portion um.
- Persönliche Kalorien- und Makroziele können direkt in der Kalorienansicht angepasst werden.
- Datumsnavigation ermöglicht das Anzeigen vergangener Ernährungstage.
- Startseiten-Einstellung „Rezepte“ wird automatisch auf „Kalorien“ migriert.
- Hinweis in der Oberfläche, dass Open-Food-Facts-Community-Daten unvollständig oder fehlerhaft sein können.
- App-Version 2.2.0, iOS Build 12, Android Version Code 12.

## 2.1.5

- Wochenplan auf die kommende Woche umgestellt und datumsbasiert gespeichert, damit Wochen nicht mehr kollidieren.
- Der gemeinsame Realtime-Wochenplan verwendet Haushalt + Datum als eindeutige Zuordnung.
- Bottom-Sheets leichter und flüssiger dargestellt; dunkler Schatten deutlich reduziert.
- Bottom-Sheets können über den Griff nach unten geschlossen werden.
- Rezept-Editor und Rezeptdetails respektieren die iPhone-Safe-Area vollständig.
- Schnellerer Start: Haushalt, Einkauf und Plan werden zuerst geladen; sekundäre Daten folgen danach.
- Schutz gegen veraltete parallele Ladevorgänge beim Haushaltswechsel.
- Cozy Mode als persönliche Designoption für warme Farben im hellen und dunklen Erscheinungsbild.
- App-Version 2.1.5, iOS Build 11, Android Version Code 11.

## 2.1.4

- Beliebte Internet-Rezepte ersetzen den festen AT/DE-Katalog in der Entdecken-Ansicht.
- „Unsere Rezepte“ ist ein vereinfachter 3-Schritte-Assistent mit einzeln hinzufügbaren Zutaten.
- iOS-Wischgeste zum Zurückgehen in Vollbild-Ansichten und im Rezept-Assistenten.
- Kompaktere Einkaufsliste mit „von …“ für den Ersteller und „erledigt von …“.
- Löschen in der Einkaufsliste per Wischgeste mit Rückgängig-Funktion.
- Produkt-Hinzufügen als iOS-artiges Bottom Sheet statt dauerhaftem Formular.
- Produktvorschläge während der Eingabe, z. B. „Mil…“ → „Milch“.
- Produkte per deutscher Spracherkennung hinzufügen.
- Erscheinungsbild: System, Hell oder Dunkel.
- Individuelle Einstellungen für Startseite, Haptik und Einkaufsliste.
- App-Version wird direkt aus der tatsächlichen App-Konfiguration angezeigt.
- Reduzierte Schatten und optimierte Sheet-/Formular-Darstellung.
- Performance-, TypeScript- und allgemeine Stabilitätsoptimierungen.
