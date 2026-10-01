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

## Phase 2 – Athlet:innen-Akten

**Vorbereitung:** Zwei Trainer:innen anlegen (z. B. *Markus Huber* – Sportart Leichtathletik, *Petra Wagner* – Schwimmen), außerdem *Sabine Kern* (Performance-Koordination, alle Athlet:innen) und *Dr. Eva Lang* (Sportmedizin, alle).

### A. Akte anlegen
- [ ] Als Koordination (oder Administration): *Athlet:innen → + Athlet:in aufnehmen*, alle Felder ausfüllen → Akte erhält die ID `LSA-0001`.
- [ ] Eine zweite Akte in der anderen Sportart anlegen (`LSA-0002`).
- [ ] Zukünftiges Geburtsdatum bzw. unbekannte Sportart wird mit verständlicher Meldung abgelehnt.
- [ ] *Bearbeiten* am Stammdatenblatt → Änderung speichern → im Zugriffsprotokoll steht „Stammdaten geändert“ mit den geänderten Feldnamen.

### B. Betreuungsteam und Athletenbereich
- [ ] *Team bearbeiten*: Trainer:in zuordnen (Funktion wird passend vorgeschlagen).
- [ ] Als Trainer (Testansicht oder Login): sieht nur Akten der eigenen Sportart – die Akte der anderen Sportart ist weder in der Liste noch per Adresse erreichbar.
- [ ] Trainer:in der *anderen* Sportart zusätzlich dem Team einer Akte zuordnen → sieht nun genau diese eine Akte. Wieder entfernen → Zugriff weg.

### C. Reiter und Sperren
- [ ] Administration: Reiter *Gesundheit*, *Psychologie*, *Schule* … zeigen 🔒 und eine Begründung; der Versuch steht im Protokoll.
- [ ] Trainer: *Gesundheit* zeigt Stufe „nur Belastungsstatus“, *Wohlbefinden & Psychologie* „nur freigegebene Hinweise“, *Daten & Einwilligungen* ist gesperrt.
- [ ] Sportmedizin: Gesundheit vollständig; Psychologie nur freigegebene Hinweise.

### D. Dokumente und Notizen
- [ ] In *Überblick* eine Notiz anlegen, danach eine PDF/ein Bild hochladen (Text + Datei zusammen geht auch).
- [ ] Datei liegt im Datenordner unter `dokumente\LSA-0001\` mit zufälligem Namen; Download funktioniert, Bilder erscheinen als Vorschau.
- [ ] Eine `.exe` oder eine umbenannte Textdatei als `.png` wird abgelehnt.
- [ ] Sportmedizin legt unter *Gesundheit* einen Eintrag an → der Trainer sieht ihn **nicht**; Sportpsychologie-Einträge sieht nur die Psychologie.
- [ ] „Für Athlet:in sichtbar“ ankreuzen → die Athlet:in sieht genau diesen Eintrag.

### E. Zugang der Athlet:in
- [ ] In der Akte *Zugang anlegen* → vorläufiges Passwort wird einmalig angezeigt.
- [ ] Mit diesem Login anmelden: Passwortwechsel, danach nur „Meine Akte“; fremde Akten per Adresse (`#/athleten/LSA-0002`) nicht erreichbar.
- [ ] Unter *Daten & Einwilligungen*: freiwillige Zwecke selbst erteilen/widerrufen; „Tägliches Monitoring“ lässt sich nicht selbst ändern.
- [ ] Koordination dokumentiert eine Papier-Einwilligung („Ändern …“ → durch Erziehungsberechtigte).

### F. Austritt und Löschung
- [ ] Status *ausgetreten* setzen → Zugang der Athlet:in ist beendet, die Checkliste erscheint, für Trainer ist die Akte unsichtbar.
- [ ] *Akte löschen* verlangt die Athleten-ID; danach sind Akte, Einwilligungen und der Ordner unter `dokumente\` weg; das Protokoll hält die Löschung fest.
- [ ] Programm beenden/neu starten → alles ist noch da (Datenbank im Datenordner).
