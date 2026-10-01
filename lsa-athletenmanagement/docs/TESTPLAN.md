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

## Phase 3 – Performance

**Vorbereitung:** Eine Athlet:in (z. B. *Lena Berger*) mit Zugang, ein Trainer im Betreuungsteam, die Koordination und eine Person mit Rolle *Sportwissenschaft*.

### A. Tages-Check (als Athlet:in)
- [ ] Start zeigt „Tages-Check ausfüllen“. Alle sechs Fragen mit 1–5 beantworten, Schlaf, **Schmerzen = ja**, speichern.
- [ ] Meldung „1 Hinweis zur menschlichen Prüfung erzeugt“. Erneut speichern erzeugt keinen zweiten Hinweis.
- [ ] Zweites Speichern am selben Tag überschreibt den Tages-Check (kein Duplikat).
- [ ] Ohne Angabe bei einer Frage lässt sich nicht speichern.

### B. Hinweise & Eskalation
- [ ] Als Trainer (Testansicht): Cockpit zeigt „Schmerz gemeldet“ bei der Athlet:in, Hinweis in der Liste – **keine Diagnose**.
- [ ] Als Koordination: *Hinweise & Eskalation* → Stufe 2 setzen, Notiz → „Aktualisieren“. Als Trainer darf man den Hinweis ansehen, aber nicht bearbeiten.
- [ ] Stufe 5 (Akutprozess): der Hinweis verschwindet aus der Trainer-Sicht (nur Koordination/Medizin/Psychologie).
- [ ] „Abschließen“ verlangt eine Notiz.
- [ ] Sportwissenschaft sieht nur Performance-Hinweise (nicht „Schmerz“), Sportpsychologie nur Wohlbefinden/vertrauliche.
- [ ] Haken „vertrauliches Gespräch“ im Tages-Check → Hinweis erscheint **nur** bei der Sportpsychologie.

### C. Trainingserfassung (als Trainer)
- [ ] *Einheit planen*: Titel, Dauer, Athlet:innen wählen → Einheiten erscheinen in der Tabelle.
- [ ] Status „vollständig“, Dauer 90, RPE 6 speichern; bei „nicht teilgenommen“ ohne Grund erscheint eine Warnung (wird gespeichert, bleibt aber als Lücke sichtbar).
- [ ] RPE 11 oder Dauer 400 wird abgelehnt. Leere Felder bleiben leer (keine 0).
- [ ] Athlet:in kann die Session-RPE selbst nachtragen („Wie anstrengend war dein Training?“ im Tages-Check).
- [ ] Belastungssprung > +30 % gegenüber der Vorwoche erzeugt einen Hinweis für die Sportwissenschaft.

### D. Akte: Monitoring, Plan, Entscheidungen
- [ ] *Monitoring*: Heatmap der letzten 14 Tage (Lücken schraffiert), Belastungs-Diagramm, Einheitenliste.
- [ ] *Messwert erfassen*: Körpermasse 520 kg → gespeichert, aber **markiert** (nicht gelöscht). 10-m-Zeit mit Sprung > 10 % → markiert.
- [ ] *Entwicklungsplan*: Ausgangslage + langfristiges Ziel speichern, Jahresziele anlegen (4. Ziel im selben Bereich wird abgelehnt).
- [ ] Maßnahme ohne Verantwortliche/Prüftermin/Erfolgskriterium wird nicht gespeichert.
- [ ] Bei fälliger Maßnahme erscheint die Wirkungskontrolle; sie landet automatisch im *Entscheidungsprotokoll*.
- [ ] *Entscheidungen*: eigene Entscheidung dokumentieren, Ergebnis später nachtragen.
- [ ] Rollen: Sportmedizin kann Plan **lesen**, aber nicht ändern; Dual Career sieht kein Monitoring.

### E. Termine & Cockpits
- [ ] *Termine*: Wettkampf für die eigene Sportart anlegen. Trainer:innen anderer Sportarten sehen ihn nicht; „alle Sportarten“ dürfen nur Personen mit Vollzugriff wählen.
- [ ] Cockpits: Trainer (Gruppe heute), Koordination (fällige Wirkungskontrollen, Pläne mit Lücken), Sportwissenschaft (Belastung), Athlet:in (Woche, Ziele, Ansprechpersonen).

## Phase 4 – Medizin, Psychologie, Schule, Wochenbesprechung

**Vorbereitung:** Personen mit den Rollen *Sportmedizin*, *Physiotherapie*, *Sportpsychologie*, *Dual Career* (jeweils „Alle Athlet:innen“), dazu Trainer, Koordination und eine Athlet:in mit Zugang.

### A. Belastungsstatus und Verletzungsregister
- [ ] Als Sportmedizin: Akte → *Gesundheit* → Status **Orange** mit „Erlaubt“, „Nicht erlaubt“ und Kontrolltermin speichern. Ohne „Nicht erlaubt“ oder Kontrolltermin kommt eine Fehlermeldung.
- [ ] Verletzung erfassen (Region, Art, Diagnose …) – optional gleich den Belastungsstatus mitsetzen.
- [ ] Als Trainer: Cockpit zeigt die **Ampel**, Erlaubtes/Verbotenes und den Kontrolltermin – **keine Diagnose** (auch nicht im Reiter *Gesundheit*).
- [ ] Als Physiotherapie: sieht Diagnose und Reha-Stufen, aber **keine Medikation/Labor**; kann „Nächste Stufe“ klicken, aber den Status nicht ändern.
- [ ] *Verletzungsregister*: Liste aller Fälle, Ausfalltage; für Trainer, Koordination, Psychologie nicht erreichbar.
- [ ] „Abschließen“ setzt die Reha auf Stufe 6 (Belastungsstatus bleibt bewusst unverändert – Hinweis erscheint).
- [ ] Athlet:in sieht in „Meine Akte → Gesundheit“ den eigenen Status und die eigenen Fälle (ohne Medikation).
- [ ] Athletinnengesundheit: ohne erteilte Einwilligung („Daten & Einwilligungen“) keine Notiz möglich; nach Widerruf ist die Notiz ausgeblendet.

### B. Psychologie (geschützter Bereich)
- [ ] Sportpsychologin legt eine Gesprächsnotiz an – Trainer, Koordination, Sportmedizin sehen sie **nicht**.
- [ ] „Hinweis freigeben“ geht nur mit gesetztem Haken „Athlet:in hat zugestimmt“; danach sieht der Trainer im Cockpit **nur den Hinweistext**.
- [ ] Hinweis „zurückziehen“ → verschwindet beim Trainer.
- [ ] Athlet:in: „Gespräch anfragen“ → bei Sportpsychologie erscheint die Anfrage (Cockpit) und ein vertraulicher Hinweis; sonst sieht sie niemand.

### C. Schule / Dual Career
- [ ] Dual Career trägt eine Prüfung ein, die 1–2 Tage um einen Wettkampf liegt → Hinweis „Spitzen liegen eng beieinander“; erscheint auch im Cockpit.
- [ ] Fehlstunden und Notentrend ändern → Trainer sieht nur Prüfungs- und Sporttermine (Stufe „Planung“), keine Noten.
- [ ] Sportmedizin und Physiotherapie haben keinen Zugriff auf Schule.

### D. Wochenbesprechung
- [ ] *Wochenbesprechung*: Agenda mit Veränderungen, Einschränkungen, Belastung der Woche, Schul- und Reisetermine, offenen Maßnahmen, Verantwortlichen.
- [ ] „Fälle mit Entscheidungsbedarf“ → „Beschluss“ → Entscheidung protokollieren → erscheint in der Akte unter *Entscheidungen*.
- [ ] Mehrere Sportarten: Auswahl oben rechts.

### E. Protokoll
- [ ] Im *Zugriffsprotokoll* stehen für Medizin/Psychologie/Schule die Öffnungen mit Ergebnis („nur Status“, „vollständig“, „nur freigegebene Hinweise“) und verweigerte Versuche.

## Phase 5 – Governance, Demodaten, Export

### A. Demodaten und Rundgang
- [ ] *System → Demodaten laden* (Passwort festlegen) → 10 Athlet:innen, 13 Demo-Zugänge (`demo.…`).
- [ ] *Systemkonzept → Rundgang in fünf Schritten*: Buttons öffnen die Testansicht der jeweiligen Demo-Person.
- [ ] *Demodaten entfernen* löscht nur die Demo-Daten; eigene Akten, Personen und Dokumente bleiben.

### B. Datenqualität (als „Performance Data“)
- [ ] Markierte Werte (z. B. Körpermasse 520 kg, Sprung > 10 %) → „Korrigieren“ mit Zahl und Begründung → Wert wird korrigiert, **Rohwert bleibt erhalten**; „bestätigen“ klärt ohne Änderung.
- [ ] Sportwissenschaft und Koordination sehen die Seite, dürfen aber nicht klären.
- [ ] Datenwörterbuch, Data Owner und Vollständigkeit je Athlet:in (nur IDs, keine Inhalte).

### C. Kennzahlen (als Geschäftsführung)
- [ ] Nur aggregierte Zahlen, **keine Namen**; Sportarten mit weniger als 5 Personen sind unterdrückt.
- [ ] Geschäftsführung hat keinen Zugriff auf Akten, Hinweise oder Datenqualität.

### D. Datenschutz & Audit (als Datenschutzbeauftragte)
- [ ] Umsetzungsstand abhaken, „Heute geprüft“ je Rolle, Aufbewahrungsfristen eintragen und speichern.
- [ ] Hinweis auf Personen mit **individuell angepassten Rechten**.
- [ ] Zugriffsprotokoll mit Filtern; Datenschutz sieht **keine Akteninhalte**.
- [ ] Athlet:in: *Daten & Einwilligungen → Auskunft anfordern* → Anfrage erscheint beim Datenschutz und lässt sich als erledigt markieren.

### E. Export / Auskunft
- [ ] Athlet:in: „Meine Daten herunterladen“ → JSON enthält nur eigene Daten (keine Gesprächsnotizen, keine Medikation).
- [ ] Koordination: Export enthält nur, was sie sehen darf; fehlende Bereiche stehen unter `nichtEnthalten`.
- [ ] Trainer: keine Exportfunktion.

### F. Safeguarding
- [ ] Athlet:in: „Vertrauliche Meldung“ (anonym) → erscheint nur beim Safeguarding Officer; im Protokoll steht „anonym“.
- [ ] Safeguarding Officer: Fall bearbeiten; „Zugriff im Schutzfall“ nur mit Begründung → minimale Akteninfo, Eintrag im Protokoll.
- [ ] Administration, Koordination, Medizin, Datenschutz haben **keinen** Zugriff auf die Fälle.

### G. Sicherung und Wiederherstellung
- [ ] *System → Jetzt Sicherung erstellen*, danach Daten ändern, Programm beenden, `RESTORE.bat` → Sicherung wählen → Stand ist wie zuvor; „vor-wiederherstellung_…“ liegt als Notkopie in `backups\`.
- [ ] Laufendes Programm: `RESTORE.bat` verweigert mit Hinweis.
