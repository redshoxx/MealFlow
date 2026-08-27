# MealFlow Changelog

## 2.2.0

- Rezeptseite aus der Hauptnavigation entfernt und durch einen persönlichen Kalorienzähler ersetzt.
- Individuelle Ernährungseinträge und Tagesziele pro Benutzer mit eigener Supabase-RLS eingeführt.
- Professionelle Tagesübersicht mit verbleibenden Kalorien, Tagesziel und Makro-Fortschritt.
- Frühstück, Mittagessen, Abendessen und Snacks als übersichtliche getrennte Bereiche.
- Barcode-Scanner über expo-camera für EAN-13, EAN-8 und UPC-Barcodes.
- Produktdaten, Produktbilder und Nährwerte werden nach dem Scan über Open Food Facts geladen.
- Mengenänderung berechnet Kalorien, Eiweiß, Kohlenhydrate und Fett live auf die gewählte Portion um.
- Persönliche Kalorien- und Makroziele können direkt in der Kalorienansicht angepasst werden.
- Datumsnavigation ermöglicht das Anzeigen vergangener Ernährungstage.
- Startseiten-Einstellung „Rezepte“ wird automatisch auf „Kalorien“ migriert.
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

## 2.1.3

- Wochenplan als übersichtliches Abendessen-Dashboard überarbeitet.
- Datumsbereich, Planungsfortschritt, Heute-Hervorhebung und größere Tageskarten.

## 2.1.2

- Web-Rezeptsuche bevorzugt das Originalbild der gefundenen Rezeptseite.
- Originalbilder werden aus Schema.org `Recipe`, Open Graph, Twitter Cards und `image_src` erkannt.
- Falls ein Originalbild nicht geladen werden kann, verwendet die App automatisch das Suchmaschinen-Vorschaubild.
- Wenn weder Original- noch Vorschaubild verfügbar ist, erscheint der professionelle Rezept-Platzhalter.
- Originalbilder werden sowohl in der Rezeptübersicht als auch in der großen Detailansicht verwendet.
- Sichere serverseitige Bild-Metadatenauflösung mit Zeit- und Größenlimits.

## 2.1.1

- Rezeptsuche auf offene Web-Suche mit fortlaufendem Nachladen erweitert.
- Serper/Google-Suche mit optionalem Brave-Fallback.

## 2.1.0

- Gemeinsame Haushalte, Einladungen, Realtime-Einkaufsliste und gemeinsamer Wochenplan.
- Erweiterte Rezeptfunktionen und Kochverlauf.
