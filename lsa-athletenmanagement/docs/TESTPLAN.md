# Testplan

Zu jeder Phase gibt es eine kurze Durchlauf-Liste. Haken setzen, was funktioniert – und notieren, was nicht.

## Phase 1 – Fundament, Benutzer & Rechte

**Vorbereitung:** `START.bat` starten, Browser auf http://localhost:8420.

### A. Ersteinrichtung und Datenspeicher
- [ ] Beim ersten Aufruf erscheint „Willkommen / Ersteinrichtung“ (kein Standardpasswort).
- [ ] Mit zu kurzem Passwort (< 10 Zeichen) kommt eine verständliche Fehlermeldung.
- [ ] Nach der Einrichtung sind Sie als *Systemadministration* angemeldet.
- [ ] Im Explorer existiert `C:\LSA-Athletenmanagement\daten\` mit `lsa.sqlite`, `dokumente`, `backups`, `logs`.
- [ ] *System* zeigt denselben Datenordner an.

### B. Personen anlegen
- [ ] *Personen & Rechte → + Person anlegen*: Name eingeben → Benutzername wird vorgeschlagen.
- [ ] Rolle *Trainer:in* wählen, Sportart *Leichtathletik* ankreuzen → speichern → vorläufiges Passwort wird einmalig angezeigt.
- [ ] Zweite Person anlegen: *Sportmedizin* mit „Alle Athlet:innen“.
- [ ] Doppelter Benutzername wird abgelehnt.

### C. Rechte je Person
- [ ] Beim Trainer unter „Zugriff auf die Reiter“ *Gesundheit* auf „fachlich erforderlich (Reha)“ ändern → Zeile wird orange, Hinweis „geändert“ erscheint; speichern.
- [ ] In der Personenliste steht beim Trainer „individuell angepasst (1)“.
- [ ] Rolle wechseln → Rechte springen auf die Vorlage der neuen Rolle zurück.
- [ ] Funktion „Kennzahlen (aggregiert)“ einzeln zuschalten und speichern.

### D. Anmeldung als andere Person
- [ ] *Testansicht als diese Person*: oranger Balken oben, Navigation zeigt nur, was die Person darf.
- [ ] *Meine Rechte* zeigt die Reiter-Stufen dieser Person.
- [ ] *Testansicht beenden* bringt Sie zurück.
- [ ] Abmelden → als Trainer mit vorläufigem Passwort anmelden → Passwortwechsel wird erzwungen → danach Start.
- [ ] Als Trainer sind *Personen & Rechte*, *System* und *Zugriffsprotokoll* nicht sichtbar (und per Adresse `#/users` nicht erreichbar).

### E. Schutz und Protokoll
- [ ] 5× falsches Passwort → Konto gesperrt; Administration kann in der Person die Sperre aufheben.
- [ ] *Zugriffsprotokoll* zeigt Anmeldungen, Rechteänderungen, verweigerte Versuche (rot).
- [ ] Person deaktivieren → laufende Anmeldung endet sofort, neue Anmeldung wird verweigert.
- [ ] Die letzte Administration lässt sich weder deaktivieren noch entrechten.

### F. Sicherung
- [ ] *System → Jetzt Sicherung erstellen* → Eintrag in der Liste, Ordner unter `…\daten\backups\` vorhanden.
- [ ] Programm beenden und neu starten → alle Personen und Rechte sind noch da.
