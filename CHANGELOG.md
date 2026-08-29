# MealFlow Changelog

## 2.2.9

- Einkaufsliste wird automatisch in Lidl-orientierten Bereichen gruppiert und innerhalb der Bereiche alphabetisch sortiert.
- Bestehende und neu angelegte Produkte werden ohne manuelle Kategorie anhand ihres Namens einsortiert.
- Startpfad beschleunigt: Nach dem Haushalt blockieren Einkauf und Wochenplan den ersten nutzbaren Bildschirm höchstens noch kurz und laden andernfalls im Hintergrund weiter.
- Hintergrundabfragen und Retry-Zeiten wurden verkürzt, ohne den Start bei langsamer Verbindung wieder zu blockieren.
- Neuer eigener Bereich „Budget“ ersetzt den bisherigen Vorrat in der Hauptnavigation.
- Die offene Einkaufsliste erhält eine geschätzte Gesamtsumme auf Basis gespeicherter Produktpreise.
- Produktpreise können direkt im Budget-Bereich pro Einheit gepflegt und für zukünftige Einkäufe wiederverwendet werden.
- Gramm- und Milliliter-Mengen werden für Preisberechnungen automatisch auf kg bzw. Liter umgerechnet.
- Neue Budget-Ampel für das monatliche Lebensmittelbudget: grün, orange oder rot abhängig von den geschätzten Ausgaben inklusive aktuellem Einkauf.
- Budget zeigt Monatsbudget, geschätzt ausgegeben, geplanten Einkauf und voraussichtlich verbleibenden Betrag.
- Preis- und Budgetdaten werden nach der neuen Supabase-Migration haushaltsweit synchronisiert; bis dahin funktioniert der Bereich mit lokalem Fallback.
- Vorrat, MHD-Karten und Vorrats-Realtime-Ladevorgänge wurden aus der aktiven App-Navigation entfernt.
- Version 2.2.9, iOS Build 23, Android Version Code 23.

## 2.2.8

- Produkte in der Einkaufsliste können direkt über das kleine Stift-Symbol bearbeitet werden.
- Name, Menge und Einheit lassen sich im bestehenden iPhone-artigen Bottom-Sheet ändern.
- Änderungen werden optimistisch angezeigt und bei einem Serverfehler sauber zurückgesetzt.
- Einkaufsliste wird stabil paginiert geladen, sodass auch größere Listen vollständig ankommen.
- Fehler beim optionalen Laden von Mitgliedsnamen können die Produktliste nicht mehr ausblenden.
- Veraltete Realtime-Antworten werden ignoriert, damit neuere Listenzustände nicht überschrieben werden.
- Fehlgeschlagene Startabfragen der Einkaufsliste erhalten automatisch einen Hintergrund-Retry.
- Version 2.2.8, iOS Build 21, Android Version Code 21.

## 2.2.7

- Start-Deadlock endgültig behoben: Ein Fehler kann MealFlow nicht mehr in einen endlosen Ladebildschirm zurückführen.
- Kritische Startabfragen haben feste Timeouts und brechen kontrolliert mit einer Wiederholen-Seite ab.
- Einkauf, Wochenplan und Vorrat laden unabhängig voneinander; einzelne Fehler blockieren die App nicht mehr vollständig.
- Sekundäre Daten werden nach dem Kernstart im Hintergrund ergänzt.
- Sitzungsprüfung ist gegen Hängen abgesichert.
- Realtime-Ereignisse werden 180 ms gebündelt, wodurch doppelte Supabase-Abfragen bei schnellen Änderungen reduziert werden.
- Hintergrund-Reloads besitzen ebenfalls Timeouts und können sich nicht unbegrenzt aufstauen.
- Version 2.2.7, iOS Build 20, Android Version Code 20.

## 2.2.6 Hotfix Build 19

- Endlos-Ladefehler behoben: ein fehlgeschlagener Haushalts-Start kann die App nicht mehr dauerhaft im Loader festhalten.
- Startabfragen besitzen jetzt Zeitlimits und eine Fehleransicht mit „Erneut laden“.
- Haushalt, Einkauf, Wochenplan und Vorrat bilden den schnellen Kernstart; Rezepte, Verlauf und Einladungen laden danach im Hintergrund.
- Einzelne langsame Nebendaten blockieren den App-Start nicht mehr.
- Anmeldung besitzt ebenfalls ein Zeitlimit statt eines möglichen unendlichen Prüfstatus.
- Performance des Startvorgangs verbessert und unnötige feste Wartezeit reduziert.
- Sichtbare Version bleibt 2.2.6; iOS Build 19, Android Version Code 19.

## 2.2.6

- Einkaufsliste: Produkt-Hinzufügen ist jetzt ein einzelner schwebender Plus-Button unten rechts.
- Haushaltsersteller können andere Mitglieder mit Bestätigung aus dem Haushalt entfernen.
- Entfernen von Mitgliedern ist zusätzlich serverseitig über eine geschützte Supabase-RPC abgesichert.
- Haushaltsseite berücksichtigt Statusleiste, Notch und Dynamic Island auf iPhone sowie Android-Statusleisten explizit.
- Version 2.2.6, iOS Build 18, Android Version Code 18.

## 2.2.5

- Wochenplan unterstützt jetzt zwei getrennte Gerichte pro Tag.
- Das erste Feld bleibt das normale gemeinsame Abendessen.
- Das zweite Feld ist dauerhaft mit „Für Saskia“ gekennzeichnet.
- Beide Gerichte können unabhängig voneinander gespeichert, geändert und entfernt werden.
- Wochenübersicht zeigt den Fortschritt jetzt für 14 mögliche Gerichte statt 7 Tage.
- Realtime-Synchronisierung wurde auf beide Gerichte pro Datum erweitert.
- Version 2.2.5, iOS Build 17, Android Version Code 17.

## 2.2.4

- Absturz beim Löschen von Produkten in der Einkaufsliste behoben.
- Die instabile Swipe-/Animated-Löschung wurde vollständig entfernt.
- Offene und erledigte Produkte haben jetzt rechts einen kleinen Papierkorb-Button.
- Rückgängig-Funktion nach dem Löschen bleibt erhalten.
- Version 2.2.4, iOS Build 16, Android Version Code 16.

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
- „Unsere Rezepte“ ist ein vereinfachter 3-Schritte-Assistent mit einzeln hinzuzufügenden Zutaten.
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
