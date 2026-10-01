# Kurzanleitung

## 1. Erster Start
1. `START.bat` doppelklicken (Windows). Beim ersten Mal fragt das Programm, ob es Node.js (ca. 30 MB, portabel) laden soll – mit **J** bestätigen.
2. Der Browser öffnet **http://localhost:8420**. Ersteinrichtung: Name der Organisation, Ihr Name, Benutzername, Passwort (mind. 10 Zeichen).
3. Das schwarze Fenster offen lassen. Beenden: Fenster schließen oder `Strg+C`.

Tipp: Für den ersten Eindruck unter **System → Demodaten laden** (fiktive Athlet:innen und je eine Person pro Rolle). Sie lassen sich später mit einem Klick wieder entfernen.

## 2. Typischer Ablauf
| Wer | Was | Wo |
|---|---|---|
| Administration | Personen anlegen, Rolle und Athletenbereich festlegen, Einzelrechte anpassen | Personen & Rechte |
| Koordination (oder Administration) | Athlet:in aufnehmen, Betreuungsteam zuordnen, Zugang für die Athlet:in anlegen | Athlet:innen |
| Athlet:in | täglich Tages-Check; Einwilligungen; vertrauliche Meldungen | Tages-Check, Meine Akte |
| Trainer:in | Einheiten planen/erfassen, Plan und Ziele pflegen, Termine | Trainingserfassung, Akte |
| Sportmedizin | Belastungsstatus (Ampel), Verletzungsregister | Akte → Gesundheit, Verletzungsregister |
| Sportpsychologie | Gesprächsnotizen, Handlungshinweise (mit Zustimmung) | Akte → Wohlbefinden & Psychologie |
| Dual Career | Prüfungen, Schulstatus | Akte → Schule |
| Datenschutz | Rechteprüfung, Fristen, Protokoll | Datenschutz & Audit |

## 3. Rechte verstehen
* Eine **Rolle** ist eine Vorlage (siehe *Systemkonzept → Berechtigungsmatrix*).
* **Athletenbereich**: wen die Person überhaupt sieht – alle, bestimmte Sportarten und/oder einzeln zugeordnete Akten (Betreuungsteam).
* **Einzelrechte**: je Reiter (z. B. Gesundheit: nur Ampel / Reha / vollständig) und je Funktion lässt sich die Vorlage ändern; Abweichungen sind orange markiert und stehen im Protokoll.
* **Testansicht** (Personen & Rechte → Person → „Testansicht als diese Person“): Sie sehen die Anwendung mit genau deren Rechten. Zum Prüfen von Rechten das beste Werkzeug.

**Wichtig:** Die Rolle *Systemadministration* sieht bewusst **keine** Gesundheits- oder psychologischen Inhalte (Datenminimierung). Möchten Sie solche Inhalte selbst erfassen, nutzen Sie die Testansicht als Sportmedizin/Sportpsychologie – oder geben sich in *Personen & Rechte → Ihre Person* ausdrücklich ein Einzelrecht (wird protokolliert). Für den Echtbetrieb sollte diese Trennung bleiben.

## 4. Sichern und Wiederherstellen
* **System → Jetzt Sicherung erstellen** (Datenbank + Dokumente). Zusätzlich sichert das Programm beim Start täglich die Datenbank.
* Wiederherstellen: Programm beenden, `RESTORE.bat` starten, Sicherung wählen, `WIEDERHERSTELLEN` eingeben. Der aktuelle Stand wird vorher selbst gesichert.
* Umzug auf einen anderen Rechner: gesamten Ordner `C:\LSA-Athletenmanagement\daten` kopieren.

## 5. Häufige Fragen
* **Passwort vergessen?** Administration → Personen & Rechte → Person → „Passwort zurücksetzen“. Hat die Administration selbst das Passwort vergessen, hilft nur eine Wiederherstellung aus einer Sicherung, die vor der Änderung liegt – bitte das Passwort sicher aufbewahren.
* **„Port belegt“?** Das Programm nimmt automatisch den nächsten freien Port (8421 …); die Adresse steht im Fenster.
* **Von anderen Geräten zugreifen?** Standardmäßig nicht möglich (nur `localhost`). Das ist Absicht. Für Tests im Netzwerk siehe `config.example.json` (`bindAddress`, `allowedHosts`) – nur in vertrauenswürdigen Netzen und mit Bedacht, da keine Verschlüsselung (HTTPS) eingebaut ist.
* **Update auf neuere Version:** Neuen Programmordner an die Stelle des alten kopieren (`config.json` ggf. behalten). Die Datenbank wird beim Start automatisch angepasst; die Daten liegen getrennt im Datenordner.
