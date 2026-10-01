# Metriken

> **Diese Datei wird aus der Metrik-Registry erzeugt** (`pnpm docs:metrics`). Nicht von Hand ändern.

## Grundlagen und Konventionen

- `g = 9,80665 m/s²`. Nettokraft = Gesamtkraft − Körpergewicht(N); BW = (m_Körper + m_Last)·g aus dem Wiegen (Session-Masse).
- Beschleunigung `a = (F − BW)/m`. Geschwindigkeit `v = ∫a dt`, Trapezregel, **je Rep neu ab Bewegungsbeginn** (`v(Onset) = 0`).
  Weg `s = ∫v dt`, Netto-Impuls `J = ∫(F − BW) dt`. Verifiziert gegen die Referenz-Exporte (Fehler ≤ 5·10⁻⁶).
- Bewegungsbeginn: Beginn des letzten **anhaltenden** (≥ 4 ms) Laufs mit `|F − BW| > 20 N` vor dem Abheben, Onset = Sample davor.
- Abheben/Landung: Gesamtkraft unter/über 20 N, linear interpoliert (Sub-Sample). Flugphase 80 ms … 1,2 s.
- Phasen (CMJ): **Entlastung** (Onset → v_min) · **Exzentrische Bremsung** (v_min → v = 0) · **Konzentrisch** (v = 0 → Takeoff) · **Flug** · **Landung**.
  Die Brems-RFD nutzt das Intervall minimale Kraft → v = 0.
- Standard-Sprunghöhe: Impuls-Momentum `h = v_TO²/(2g)`; zusätzlich Flugzeit `g·t²/8` und Imp-Dis.
- **Asymmetrie** `(größere − kleinere Seite)/größere Seite · 100`, vorzeichenbehaftet: `+` = rechts höher, `−` = links höher.
- Einheiten in der Datenbank immer metrisch (cm, s, m/s, N, N·s, W, N/s, %); die Anzeige rechnet konfigurierbar um.

## Testtypen und Familien

| Typ | Familie | einbeinig | Last | Auto-Detect |
| --- | --- | --- | --- | --- |
| `cmj` – Gegenbewegungssprung (CMJ) | cmj |  |  | ja |
| `loaded_cmj` – CMJ mit Zusatzlast | cmj |  | ja | ja |
| `abalakov` – Abalakov-Sprung | cmj |  |  | nein |
| `sj` – Squat Jump (SJ) | sj |  |  | ja |
| `loaded_sj` – SJ mit Zusatzlast | sj |  | ja | ja |
| `cmrj` – CMJ-Rebound-Sprung (CMRJ) | cmrj |  |  | ja |
| `dj` – Drop Jump (DJ) | dj |  |  | ja |
| `hop` – Hop-Test | hop |  |  | ja |
| `sl_jump` – Einbeiniger Sprung | cmj | ja |  | ja |
| `sl_cmrj` – Einbeiniger CMRJ | cmrj | ja |  | ja |
| `sl_dj` – Einbeiniger Drop Jump | dj | ja |  | ja |
| `sl_hop` – Einbeiniger Hop-Test | hop | ja |  | ja |
| `sl_hop_return` – Einbeiniger Hop und Zurück | hop | ja |  | ja |
| `land_hold` – Landen und Halten | landing |  |  | ja |
| `sl_land_hold` – Einbeiniges Landen und Halten | landing | ja |  | ja |
| `isometric` – Isometrie (generisch) | isometric |  |  | nein |
| `imtp` – Isometric Mid-Thigh Pull (IMTP) | isometric |  |  | nein |
| `iso_squat` – Isometrische Kniebeuge | isometric |  |  | nein |
| `shoulder_iso_i` – Schulter-ISO „I“ | isometric |  |  | nein |
| `shoulder_iso_y` – Schulter-ISO „Y“ | isometric |  |  | nein |
| `shoulder_iso_t` – Schulter-ISO „T“ | isometric |  |  | nein |
| `quiet_stand` – Ruhiger Stand | balance |  |  | nein |
| `sl_stand` – Einbeiniger Stand | balance | ja |  | nein |
| `sl_range_of_stability` – Einbeiniger Stabilitätsbereich | balance | ja |  | nein |

## CMJ-Familie (CMJ, Loaded CMJ, Abalakov, Single Leg Jump)

| Schlüssel | Bezeichnung | Einheit | Phase | Formel / Definition |
| --- | --- | --- | --- | --- |
| `body_weight` | Körpergewicht (System) / Body Weight (system) | N | overall | Gewichtskraft des Systems (Körper + externe Last) aus dem Wiegen. — `BW = (m_Körper + m_Last) · g,  g = 9,80665 m/s²` |
| `jump_height_impmom` | Sprunghöhe (Imp-Mom) / Jump Height (Imp-Mom) | cm | overall | Standard-Sprunghöhe aus der Abheb-Geschwindigkeit (Impuls-Momentum-Methode). — `h = v_TO² / (2g),  v_TO = ∫(F − BW)/m dt von Onset bis Takeoff (Trapezregel, v(Onset)=0)` |
| `jump_height_flight` | Sprunghöhe (Flugzeit) / Jump Height (Flight Time) | cm | flight | Sprunghöhe aus der Flugzeit unter Annahme gleicher Abheb- und Landehöhe. — `h = g · t_Flug² / 8` |
| `jump_height_impdis` | Sprunghöhe (Imp-Dis) / Jump Height (Imp-Dis) | cm | overall | Maximale COM-Höhe über der Ausgangsposition: Verschiebung bei Takeoff plus ballistischer Anteil. — `s_TO + v_TO² / (2g),  s_TO = ∫v dt von Onset bis Takeoff` |
| `takeoff_velocity` | Abhebegeschwindigkeit / Take-off Velocity | m/s | concentric | Geschwindigkeit des Körperschwerpunkts beim Abheben. — `v_TO = v(t_Takeoff)` |
| `flight_time` | Flugzeit / Flight Time | s | flight | Dauer zwischen Abheben und Landung (Kraft < 20 N, linear interpolierte Schwellenkreuzung). — `t_Flug = t_Landung − t_Takeoff` |
| `contraction_time` | Kontraktionszeit / Contraction Time | s | overall | Dauer von Bewegungsbeginn bis Abheben. — `t_Kontraktion = t_Takeoff − t_Onset` |
| `eccentric_duration` | Exzentrische Dauer / Eccentric Duration | s | eccentric | Dauer von Bewegungsbeginn bis Geschwindigkeits-Nulldurchgang (tiefster Punkt). — `t_exz = t(v=0) − t_Onset` |
| `concentric_duration` | Konzentrische Dauer / Concentric Duration | s | concentric | Dauer von v = 0 bis Abheben. — `t_konz = t_Takeoff − t(v=0)` |
| `unweighting_duration` | Entlastungsdauer / Unweighting Duration | s | unweighting | Dauer von Bewegungsbeginn bis zur maximalen Abwärtsgeschwindigkeit. — `t_Entl = t(v_min) − t_Onset` |
| `eccentric_decel_duration` | Exzentrische Bremsdauer / Eccentric Deceleration Duration | s | braking | Dauer von maximaler Abwärtsgeschwindigkeit bis v = 0. — `t_Brems = t(v=0) − t(v_min)` |
| `rsi_modified` | RSI-modified / RSI-modified | m/s | overall | Reaktivkraft-Index (modifiziert): Sprunghöhe (Flugzeit) / Kontraktionszeit. — `RSI_mod = h_Flug / t_Kontraktion` |
| `concentric_impulse` | Konzentrischer Impuls / Concentric Impulse | N·s | concentric | Netto-Impuls (über Körpergewicht) in der konzentrischen Phase; entspricht m·v_TO. — `J_konz = ∫(F − BW) dt von v=0 bis Takeoff` |
| `concentric_impulse_rel` | Konzentrischer Impuls (rel.) / Concentric Impulse (rel.) | N·s/kg | concentric | Konzentrischer Netto-Impuls bezogen auf die Körpermasse. — `J_konz / m_Körper` |
| `concentric_impulse_100ms` | Konzentrischer Impuls (erste 100 ms) / Concentric Impulse (first 100 ms) | N·s | concentric | Netto-Impuls in den ersten 100 ms der konzentrischen Phase. — `J_100 = ∫(F − BW) dt über [t(v=0), t(v=0) + 100 ms]` |
| `concentric_peak_force` | Konzentrische Spitzenkraft / Concentric Peak Force | N | concentric | Maximale Gesamtkraft in der konzentrischen Phase. — `max F(t), t ∈ [t(v=0), t_Takeoff]` |
| `takeoff_peak_force` | Takeoff-Spitzenkraft / Takeoff Peak Force | N | concentric | Spitzenkraft der Abdruckphase (entspricht der konzentrischen Spitzenkraft; separat für die Asymmetrie). — `max F(t), t ∈ [t(v=0), t_Takeoff]` |
| `concentric_mean_force` | Konzentrische Mittelkraft / Concentric Mean Force | N | concentric | Zeitlicher Mittelwert der Gesamtkraft in der konzentrischen Phase. — `(1/T) ∫F dt über [t(v=0), t_Takeoff]` |
| `concentric_peak_velocity` | Konzentrische Spitzengeschwindigkeit / Concentric Peak Velocity | m/s | concentric | Maximale Aufwärtsgeschwindigkeit des COM vor dem Abheben. — `max v(t), t ∈ [t(v=0), t_Takeoff]` |
| `peak_power` | Spitzenleistung / Peak Power | W | concentric | Maximale Leistung P = F·v in der konzentrischen Phase. — `P(t) = F(t) · v(t);  max P(t), t ∈ [t(v=0), t_Takeoff]` |
| `peak_power_rel` | Spitzenleistung / KM / Peak Power / BM | W/kg | concentric | Spitzenleistung bezogen auf die Körpermasse. — `P_max / m_Körper` |
| `concentric_mean_power` | Konzentrische Mittelleistung / Concentric Mean Power | W | concentric | Mittelwert von F·v über die konzentrische Phase. — `mean(F(t) · v(t)), t ∈ [t(v=0), t_Takeoff]` |
| `concentric_rfd` | Konzentrische RFD (Mittel) / Concentric RFD (mean) | N/s | concentric | Mittlere Kraftanstiegsrate von v = 0 bis zur konzentrischen Spitzenkraft. — `(F_peak − F(v=0)) / (t_peak − t(v=0))` |
| `concentric_rfd_max` | Konzentrische Max-RFD (50 ms) / Concentric Max RFD (50 ms) | N/s | concentric | Größter Kraftanstieg in einem 50-ms-Fenster innerhalb der konzentrischen Phase. — `max_t [F(t + 50 ms) − F(t)] / 0,05 s` |
| `eccentric_mean_force` | Exzentrische Mittelkraft / Eccentric Mean Force | N | eccentric | Mittelkraft von Bewegungsbeginn bis v = 0. — `(1/T) ∫F dt über [t_Onset, t(v=0)]` |
| `eccentric_peak_force` | Exzentrische Spitzenkraft / Eccentric Peak Force | N | eccentric | Maximale Kraft zwischen Bewegungsbeginn und v = 0. — `max F(t), t ∈ [t_Onset, t(v=0)]` |
| `eccentric_peak_velocity` | Exzentrische Spitzengeschwindigkeit / Eccentric Peak Velocity | m/s | eccentric | Maximale Abwärtsgeschwindigkeit (negativ = nach unten). — `min v(t), t ∈ [t_Onset, t(v=0)]` |
| `eccentric_decel_impulse` | Exzentrischer Brems-Impuls / Eccentric Deceleration Impulse | N·s | braking | Netto-Impuls von maximaler Abwärtsgeschwindigkeit bis v = 0 (entspricht m·\|v_min\|). — `∫(F − BW) dt über [t(v_min), t(v=0)]` |
| `eccentric_decel_rfd` | Exzentrische Brems-RFD / Eccentric Deceleration RFD | N/s | braking | Mittlere Kraftanstiegsrate von maximaler Abwärtsgeschwindigkeit bis v = 0. — `(F(v=0) − F(v_min)) / (t(v=0) − t(v_min))` |
| `braking_rfd` | Brems-RFD / Braking RFD | N/s | braking | Mittlere Kraftanstiegsrate von der minimalen Kraft (Ende der Entlastung) bis v = 0. — `(F(v=0) − F_min) / (t(v=0) − t(F_min))` |
| `countermovement_depth` | Gegenbewegungstiefe / Countermovement Depth | cm | eccentric | Vertikale COM-Verschiebung bis zum tiefsten Punkt (negativ = nach unten). — `s(t(v=0)) = ∫v dt von Onset bis v=0` |
| `force_at_zero_velocity` | Kraft bei Nullgeschwindigkeit / Force at Zero Velocity | N | eccentric | Gesamtkraft im tiefsten Punkt der Gegenbewegung. — `F(t(v=0))` |
| `peak_landing_force` | Landungs-Spitzenkraft / Peak Landing Force | N | landing | Maximale Gesamtkraft nach der Landung (500-ms-Fenster). — `max F(t), t ∈ [t_Landung, t_Landung + 500 ms]` |
| `landing_rfd` | Landungs-RFD / Landing RFD | N/s | landing | Mittlere Kraftanstiegsrate vom Erstkontakt bis zur Landungs-Spitzenkraft. — `(F_peak,Landung − F(t_Landung)) / (t_peak − t_Landung)` |
| `asym_concentric_mean_force` | Asymmetrie konz. Mittelkraft / Concentric Mean Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der konzentrischen Mittelkraft. — `Mittelkraft je Platte über [t(v=0), t_Takeoff]. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_eccentric_mean_force` | Asymmetrie exz. Mittelkraft / Eccentric Mean Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der exzentrischen Mittelkraft. — `Mittelkraft je Platte über [t_Onset, t(v=0)]. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_concentric_impulse` | Asymmetrie konz. Impuls / Concentric Impulse Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie des konzentrischen Netto-Impulses. — `Netto-Impuls je Platte: ∫(F_Platte − Anteil_Ruhe·BW) dt über die konzentrische Phase. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_takeoff_peak_force` | Asymmetrie Takeoff-Spitzenkraft / Takeoff Peak Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Spitzenkraft in der Abdruckphase. — `Spitzenkraft je Platte über die konzentrische Phase. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_peak_landing_force` | Asymmetrie Landungs-Spitzenkraft / Peak Landing Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Spitzenkraft nach der Landung. — `Spitzenkraft je Platte im Landefenster. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |

## Squat-Jump-Familie (SJ, Loaded SJ)

| Schlüssel | Bezeichnung | Einheit | Phase | Formel / Definition |
| --- | --- | --- | --- | --- |
| `body_weight` | Körpergewicht (System) / Body Weight (system) | N | overall | Gewichtskraft des Systems (Körper + externe Last) aus dem Wiegen. — `BW = (m_Körper + m_Last) · g,  g = 9,80665 m/s²` |
| `jump_height_impmom` | Sprunghöhe (Imp-Mom) / Jump Height (Imp-Mom) | cm | overall | Standard-Sprunghöhe aus der Abheb-Geschwindigkeit (Impuls-Momentum-Methode). — `h = v_TO² / (2g),  v_TO = ∫(F − BW)/m dt von Onset bis Takeoff (Trapezregel, v(Onset)=0)` |
| `jump_height_flight` | Sprunghöhe (Flugzeit) / Jump Height (Flight Time) | cm | flight | Sprunghöhe aus der Flugzeit unter Annahme gleicher Abheb- und Landehöhe. — `h = g · t_Flug² / 8` |
| `takeoff_velocity` | Abhebegeschwindigkeit / Take-off Velocity | m/s | concentric | Geschwindigkeit des Körperschwerpunkts beim Abheben. — `v_TO = v(t_Takeoff)` |
| `flight_time` | Flugzeit / Flight Time | s | flight | Dauer zwischen Abheben und Landung (Kraft < 20 N, linear interpolierte Schwellenkreuzung). — `t_Flug = t_Landung − t_Takeoff` |
| `contraction_time` | Kontraktionszeit / Contraction Time | s | overall | Dauer von Bewegungsbeginn bis Abheben. — `t_Kontraktion = t_Takeoff − t_Onset` |
| `concentric_duration` | Konzentrische Dauer / Concentric Duration | s | concentric | Dauer von v = 0 bis Abheben. — `t_konz = t_Takeoff − t(v=0)` |
| `rsi_modified` | RSI-modified / RSI-modified | m/s | overall | Reaktivkraft-Index (modifiziert): Sprunghöhe (Flugzeit) / Kontraktionszeit. — `RSI_mod = h_Flug / t_Kontraktion` |
| `concentric_impulse` | Konzentrischer Impuls / Concentric Impulse | N·s | concentric | Netto-Impuls (über Körpergewicht) in der konzentrischen Phase; entspricht m·v_TO. — `J_konz = ∫(F − BW) dt von v=0 bis Takeoff` |
| `concentric_impulse_rel` | Konzentrischer Impuls (rel.) / Concentric Impulse (rel.) | N·s/kg | concentric | Konzentrischer Netto-Impuls bezogen auf die Körpermasse. — `J_konz / m_Körper` |
| `concentric_impulse_100ms` | Konzentrischer Impuls (erste 100 ms) / Concentric Impulse (first 100 ms) | N·s | concentric | Netto-Impuls in den ersten 100 ms der konzentrischen Phase. — `J_100 = ∫(F − BW) dt über [t(v=0), t(v=0) + 100 ms]` |
| `concentric_peak_force` | Konzentrische Spitzenkraft / Concentric Peak Force | N | concentric | Maximale Gesamtkraft in der konzentrischen Phase. — `max F(t), t ∈ [t(v=0), t_Takeoff]` |
| `takeoff_peak_force` | Takeoff-Spitzenkraft / Takeoff Peak Force | N | concentric | Spitzenkraft der Abdruckphase (entspricht der konzentrischen Spitzenkraft; separat für die Asymmetrie). — `max F(t), t ∈ [t(v=0), t_Takeoff]` |
| `concentric_mean_force` | Konzentrische Mittelkraft / Concentric Mean Force | N | concentric | Zeitlicher Mittelwert der Gesamtkraft in der konzentrischen Phase. — `(1/T) ∫F dt über [t(v=0), t_Takeoff]` |
| `concentric_peak_velocity` | Konzentrische Spitzengeschwindigkeit / Concentric Peak Velocity | m/s | concentric | Maximale Aufwärtsgeschwindigkeit des COM vor dem Abheben. — `max v(t), t ∈ [t(v=0), t_Takeoff]` |
| `peak_power` | Spitzenleistung / Peak Power | W | concentric | Maximale Leistung P = F·v in der konzentrischen Phase. — `P(t) = F(t) · v(t);  max P(t), t ∈ [t(v=0), t_Takeoff]` |
| `peak_power_rel` | Spitzenleistung / KM / Peak Power / BM | W/kg | concentric | Spitzenleistung bezogen auf die Körpermasse. — `P_max / m_Körper` |
| `concentric_mean_power` | Konzentrische Mittelleistung / Concentric Mean Power | W | concentric | Mittelwert von F·v über die konzentrische Phase. — `mean(F(t) · v(t)), t ∈ [t(v=0), t_Takeoff]` |
| `concentric_rfd` | Konzentrische RFD (Mittel) / Concentric RFD (mean) | N/s | concentric | Mittlere Kraftanstiegsrate von v = 0 bis zur konzentrischen Spitzenkraft. — `(F_peak − F(v=0)) / (t_peak − t(v=0))` |
| `concentric_rfd_max` | Konzentrische Max-RFD (50 ms) / Concentric Max RFD (50 ms) | N/s | concentric | Größter Kraftanstieg in einem 50-ms-Fenster innerhalb der konzentrischen Phase. — `max_t [F(t + 50 ms) − F(t)] / 0,05 s` |
| `peak_landing_force` | Landungs-Spitzenkraft / Peak Landing Force | N | landing | Maximale Gesamtkraft nach der Landung (500-ms-Fenster). — `max F(t), t ∈ [t_Landung, t_Landung + 500 ms]` |
| `landing_rfd` | Landungs-RFD / Landing RFD | N/s | landing | Mittlere Kraftanstiegsrate vom Erstkontakt bis zur Landungs-Spitzenkraft. — `(F_peak,Landung − F(t_Landung)) / (t_peak − t_Landung)` |
| `asym_concentric_mean_force` | Asymmetrie konz. Mittelkraft / Concentric Mean Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der konzentrischen Mittelkraft. — `Mittelkraft je Platte über [t(v=0), t_Takeoff]. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_concentric_impulse` | Asymmetrie konz. Impuls / Concentric Impulse Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie des konzentrischen Netto-Impulses. — `Netto-Impuls je Platte: ∫(F_Platte − Anteil_Ruhe·BW) dt über die konzentrische Phase. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_takeoff_peak_force` | Asymmetrie Takeoff-Spitzenkraft / Takeoff Peak Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Spitzenkraft in der Abdruckphase. — `Spitzenkraft je Platte über die konzentrische Phase. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_peak_landing_force` | Asymmetrie Landungs-Spitzenkraft / Peak Landing Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Spitzenkraft nach der Landung. — `Spitzenkraft je Platte im Landefenster. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |

## CMRJ-Familie (CMRJ, SL CMRJ)

| Schlüssel | Bezeichnung | Einheit | Phase | Formel / Definition |
| --- | --- | --- | --- | --- |
| `body_weight` | Körpergewicht (System) / Body Weight (system) | N | overall | Gewichtskraft des Systems (Körper + externe Last) aus dem Wiegen. — `BW = (m_Körper + m_Last) · g,  g = 9,80665 m/s²` |
| `jump_height_impmom` | Sprunghöhe (Imp-Mom) / Jump Height (Imp-Mom) | cm | overall | Standard-Sprunghöhe aus der Abheb-Geschwindigkeit (Impuls-Momentum-Methode). — `h = v_TO² / (2g),  v_TO = ∫(F − BW)/m dt von Onset bis Takeoff (Trapezregel, v(Onset)=0)` |
| `jump_height_flight` | Sprunghöhe (Flugzeit) / Jump Height (Flight Time) | cm | flight | Sprunghöhe aus der Flugzeit unter Annahme gleicher Abheb- und Landehöhe. — `h = g · t_Flug² / 8` |
| `jump_height_impdis` | Sprunghöhe (Imp-Dis) / Jump Height (Imp-Dis) | cm | overall | Maximale COM-Höhe über der Ausgangsposition: Verschiebung bei Takeoff plus ballistischer Anteil. — `s_TO + v_TO² / (2g),  s_TO = ∫v dt von Onset bis Takeoff` |
| `takeoff_velocity` | Abhebegeschwindigkeit / Take-off Velocity | m/s | concentric | Geschwindigkeit des Körperschwerpunkts beim Abheben. — `v_TO = v(t_Takeoff)` |
| `flight_time` | Flugzeit / Flight Time | s | flight | Dauer zwischen Abheben und Landung (Kraft < 20 N, linear interpolierte Schwellenkreuzung). — `t_Flug = t_Landung − t_Takeoff` |
| `contraction_time` | Kontraktionszeit / Contraction Time | s | overall | Dauer von Bewegungsbeginn bis Abheben. — `t_Kontraktion = t_Takeoff − t_Onset` |
| `eccentric_duration` | Exzentrische Dauer / Eccentric Duration | s | eccentric | Dauer von Bewegungsbeginn bis Geschwindigkeits-Nulldurchgang (tiefster Punkt). — `t_exz = t(v=0) − t_Onset` |
| `concentric_duration` | Konzentrische Dauer / Concentric Duration | s | concentric | Dauer von v = 0 bis Abheben. — `t_konz = t_Takeoff − t(v=0)` |
| `unweighting_duration` | Entlastungsdauer / Unweighting Duration | s | unweighting | Dauer von Bewegungsbeginn bis zur maximalen Abwärtsgeschwindigkeit. — `t_Entl = t(v_min) − t_Onset` |
| `eccentric_decel_duration` | Exzentrische Bremsdauer / Eccentric Deceleration Duration | s | braking | Dauer von maximaler Abwärtsgeschwindigkeit bis v = 0. — `t_Brems = t(v=0) − t(v_min)` |
| `rsi_modified` | RSI-modified / RSI-modified | m/s | overall | Reaktivkraft-Index (modifiziert): Sprunghöhe (Flugzeit) / Kontraktionszeit. — `RSI_mod = h_Flug / t_Kontraktion` |
| `concentric_impulse` | Konzentrischer Impuls / Concentric Impulse | N·s | concentric | Netto-Impuls (über Körpergewicht) in der konzentrischen Phase; entspricht m·v_TO. — `J_konz = ∫(F − BW) dt von v=0 bis Takeoff` |
| `concentric_impulse_rel` | Konzentrischer Impuls (rel.) / Concentric Impulse (rel.) | N·s/kg | concentric | Konzentrischer Netto-Impuls bezogen auf die Körpermasse. — `J_konz / m_Körper` |
| `concentric_impulse_100ms` | Konzentrischer Impuls (erste 100 ms) / Concentric Impulse (first 100 ms) | N·s | concentric | Netto-Impuls in den ersten 100 ms der konzentrischen Phase. — `J_100 = ∫(F − BW) dt über [t(v=0), t(v=0) + 100 ms]` |
| `concentric_peak_force` | Konzentrische Spitzenkraft / Concentric Peak Force | N | concentric | Maximale Gesamtkraft in der konzentrischen Phase. — `max F(t), t ∈ [t(v=0), t_Takeoff]` |
| `takeoff_peak_force` | Takeoff-Spitzenkraft / Takeoff Peak Force | N | concentric | Spitzenkraft der Abdruckphase (entspricht der konzentrischen Spitzenkraft; separat für die Asymmetrie). — `max F(t), t ∈ [t(v=0), t_Takeoff]` |
| `concentric_mean_force` | Konzentrische Mittelkraft / Concentric Mean Force | N | concentric | Zeitlicher Mittelwert der Gesamtkraft in der konzentrischen Phase. — `(1/T) ∫F dt über [t(v=0), t_Takeoff]` |
| `concentric_peak_velocity` | Konzentrische Spitzengeschwindigkeit / Concentric Peak Velocity | m/s | concentric | Maximale Aufwärtsgeschwindigkeit des COM vor dem Abheben. — `max v(t), t ∈ [t(v=0), t_Takeoff]` |
| `peak_power` | Spitzenleistung / Peak Power | W | concentric | Maximale Leistung P = F·v in der konzentrischen Phase. — `P(t) = F(t) · v(t);  max P(t), t ∈ [t(v=0), t_Takeoff]` |
| `peak_power_rel` | Spitzenleistung / KM / Peak Power / BM | W/kg | concentric | Spitzenleistung bezogen auf die Körpermasse. — `P_max / m_Körper` |
| `concentric_mean_power` | Konzentrische Mittelleistung / Concentric Mean Power | W | concentric | Mittelwert von F·v über die konzentrische Phase. — `mean(F(t) · v(t)), t ∈ [t(v=0), t_Takeoff]` |
| `concentric_rfd` | Konzentrische RFD (Mittel) / Concentric RFD (mean) | N/s | concentric | Mittlere Kraftanstiegsrate von v = 0 bis zur konzentrischen Spitzenkraft. — `(F_peak − F(v=0)) / (t_peak − t(v=0))` |
| `concentric_rfd_max` | Konzentrische Max-RFD (50 ms) / Concentric Max RFD (50 ms) | N/s | concentric | Größter Kraftanstieg in einem 50-ms-Fenster innerhalb der konzentrischen Phase. — `max_t [F(t + 50 ms) − F(t)] / 0,05 s` |
| `eccentric_mean_force` | Exzentrische Mittelkraft / Eccentric Mean Force | N | eccentric | Mittelkraft von Bewegungsbeginn bis v = 0. — `(1/T) ∫F dt über [t_Onset, t(v=0)]` |
| `eccentric_peak_force` | Exzentrische Spitzenkraft / Eccentric Peak Force | N | eccentric | Maximale Kraft zwischen Bewegungsbeginn und v = 0. — `max F(t), t ∈ [t_Onset, t(v=0)]` |
| `eccentric_peak_velocity` | Exzentrische Spitzengeschwindigkeit / Eccentric Peak Velocity | m/s | eccentric | Maximale Abwärtsgeschwindigkeit (negativ = nach unten). — `min v(t), t ∈ [t_Onset, t(v=0)]` |
| `eccentric_decel_impulse` | Exzentrischer Brems-Impuls / Eccentric Deceleration Impulse | N·s | braking | Netto-Impuls von maximaler Abwärtsgeschwindigkeit bis v = 0 (entspricht m·\|v_min\|). — `∫(F − BW) dt über [t(v_min), t(v=0)]` |
| `eccentric_decel_rfd` | Exzentrische Brems-RFD / Eccentric Deceleration RFD | N/s | braking | Mittlere Kraftanstiegsrate von maximaler Abwärtsgeschwindigkeit bis v = 0. — `(F(v=0) − F(v_min)) / (t(v=0) − t(v_min))` |
| `braking_rfd` | Brems-RFD / Braking RFD | N/s | braking | Mittlere Kraftanstiegsrate von der minimalen Kraft (Ende der Entlastung) bis v = 0. — `(F(v=0) − F_min) / (t(v=0) − t(F_min))` |
| `countermovement_depth` | Gegenbewegungstiefe / Countermovement Depth | cm | eccentric | Vertikale COM-Verschiebung bis zum tiefsten Punkt (negativ = nach unten). — `s(t(v=0)) = ∫v dt von Onset bis v=0` |
| `force_at_zero_velocity` | Kraft bei Nullgeschwindigkeit / Force at Zero Velocity | N | eccentric | Gesamtkraft im tiefsten Punkt der Gegenbewegung. — `F(t(v=0))` |
| `peak_landing_force` | Landungs-Spitzenkraft / Peak Landing Force | N | landing | Maximale Gesamtkraft nach der Landung (500-ms-Fenster). — `max F(t), t ∈ [t_Landung, t_Landung + 500 ms]` |
| `landing_rfd` | Landungs-RFD / Landing RFD | N/s | landing | Mittlere Kraftanstiegsrate vom Erstkontakt bis zur Landungs-Spitzenkraft. — `(F_peak,Landung − F(t_Landung)) / (t_peak − t_Landung)` |
| `rebound_contact_time` | Rebound-Kontaktzeit / Rebound Contact Time | s | rebound | Bodenkontaktzeit des Rebound-Sprungs (Landung → erneutes Abheben). — `t_Kontakt = t_Takeoff,2 − t_Landung,1` |
| `rebound_flight_time` | Rebound-Flugzeit / Rebound Flight Time | s | rebound | Flugzeit des Rebound-Sprungs. — `t_Landung,2 − t_Takeoff,2` |
| `rebound_jump_height` | Rebound-Sprunghöhe / Rebound Jump Height | cm | rebound | Sprunghöhe des Rebound-Sprungs aus der Flugzeit. — `h = g · t_Flug,2² / 8` |
| `rebound_rsi` | Rebound-RSI / Rebound RSI | m/s | rebound | Reaktivkraft-Index des Rebounds: Sprunghöhe (Flugzeit) / Kontaktzeit. — `RSI = h_Flug,2 / t_Kontakt` |
| `rebound_peak_force` | Rebound-Spitzenkraft / Rebound Peak Force | N | rebound | Maximale Kraft im Rebound-Kontakt. — `max F(t), t ∈ [t_Landung,1, t_Takeoff,2]` |
| `asym_concentric_mean_force` | Asymmetrie konz. Mittelkraft / Concentric Mean Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der konzentrischen Mittelkraft. — `Mittelkraft je Platte über [t(v=0), t_Takeoff]. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_eccentric_mean_force` | Asymmetrie exz. Mittelkraft / Eccentric Mean Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der exzentrischen Mittelkraft. — `Mittelkraft je Platte über [t_Onset, t(v=0)]. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_concentric_impulse` | Asymmetrie konz. Impuls / Concentric Impulse Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie des konzentrischen Netto-Impulses. — `Netto-Impuls je Platte: ∫(F_Platte − Anteil_Ruhe·BW) dt über die konzentrische Phase. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_takeoff_peak_force` | Asymmetrie Takeoff-Spitzenkraft / Takeoff Peak Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Spitzenkraft in der Abdruckphase. — `Spitzenkraft je Platte über die konzentrische Phase. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_peak_landing_force` | Asymmetrie Landungs-Spitzenkraft / Peak Landing Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Spitzenkraft nach der Landung. — `Spitzenkraft je Platte im Landefenster. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |

## Drop-Jump-Familie (DJ, SL DJ)

| Schlüssel | Bezeichnung | Einheit | Phase | Formel / Definition |
| --- | --- | --- | --- | --- |
| `body_weight` | Körpergewicht (System) / Body Weight (system) | N | overall | Gewichtskraft des Systems (Körper + externe Last) aus dem Wiegen. — `BW = (m_Körper + m_Last) · g,  g = 9,80665 m/s²` |
| `jump_height_flight` | Sprunghöhe (Flugzeit) / Jump Height (Flight Time) | cm | flight | Sprunghöhe aus der Flugzeit unter Annahme gleicher Abheb- und Landehöhe. — `h = g · t_Flug² / 8` |
| `flight_time` | Flugzeit / Flight Time | s | flight | Dauer zwischen Abheben und Landung (Kraft < 20 N, linear interpolierte Schwellenkreuzung). — `t_Flug = t_Landung − t_Takeoff` |
| `eccentric_duration` | Exzentrische Dauer / Eccentric Duration | s | eccentric | Dauer von Bewegungsbeginn bis Geschwindigkeits-Nulldurchgang (tiefster Punkt). — `t_exz = t(v=0) − t_Onset` |
| `concentric_duration` | Konzentrische Dauer / Concentric Duration | s | concentric | Dauer von v = 0 bis Abheben. — `t_konz = t_Takeoff − t(v=0)` |
| `concentric_impulse` | Konzentrischer Impuls / Concentric Impulse | N·s | concentric | Netto-Impuls (über Körpergewicht) in der konzentrischen Phase; entspricht m·v_TO. — `J_konz = ∫(F − BW) dt von v=0 bis Takeoff` |
| `concentric_impulse_rel` | Konzentrischer Impuls (rel.) / Concentric Impulse (rel.) | N·s/kg | concentric | Konzentrischer Netto-Impuls bezogen auf die Körpermasse. — `J_konz / m_Körper` |
| `concentric_impulse_100ms` | Konzentrischer Impuls (erste 100 ms) / Concentric Impulse (first 100 ms) | N·s | concentric | Netto-Impuls in den ersten 100 ms der konzentrischen Phase. — `J_100 = ∫(F − BW) dt über [t(v=0), t(v=0) + 100 ms]` |
| `concentric_peak_force` | Konzentrische Spitzenkraft / Concentric Peak Force | N | concentric | Maximale Gesamtkraft in der konzentrischen Phase. — `max F(t), t ∈ [t(v=0), t_Takeoff]` |
| `takeoff_peak_force` | Takeoff-Spitzenkraft / Takeoff Peak Force | N | concentric | Spitzenkraft der Abdruckphase (entspricht der konzentrischen Spitzenkraft; separat für die Asymmetrie). — `max F(t), t ∈ [t(v=0), t_Takeoff]` |
| `concentric_mean_force` | Konzentrische Mittelkraft / Concentric Mean Force | N | concentric | Zeitlicher Mittelwert der Gesamtkraft in der konzentrischen Phase. — `(1/T) ∫F dt über [t(v=0), t_Takeoff]` |
| `concentric_peak_velocity` | Konzentrische Spitzengeschwindigkeit / Concentric Peak Velocity | m/s | concentric | Maximale Aufwärtsgeschwindigkeit des COM vor dem Abheben. — `max v(t), t ∈ [t(v=0), t_Takeoff]` |
| `peak_power` | Spitzenleistung / Peak Power | W | concentric | Maximale Leistung P = F·v in der konzentrischen Phase. — `P(t) = F(t) · v(t);  max P(t), t ∈ [t(v=0), t_Takeoff]` |
| `peak_power_rel` | Spitzenleistung / KM / Peak Power / BM | W/kg | concentric | Spitzenleistung bezogen auf die Körpermasse. — `P_max / m_Körper` |
| `concentric_mean_power` | Konzentrische Mittelleistung / Concentric Mean Power | W | concentric | Mittelwert von F·v über die konzentrische Phase. — `mean(F(t) · v(t)), t ∈ [t(v=0), t_Takeoff]` |
| `concentric_rfd` | Konzentrische RFD (Mittel) / Concentric RFD (mean) | N/s | concentric | Mittlere Kraftanstiegsrate von v = 0 bis zur konzentrischen Spitzenkraft. — `(F_peak − F(v=0)) / (t_peak − t(v=0))` |
| `concentric_rfd_max` | Konzentrische Max-RFD (50 ms) / Concentric Max RFD (50 ms) | N/s | concentric | Größter Kraftanstieg in einem 50-ms-Fenster innerhalb der konzentrischen Phase. — `max_t [F(t + 50 ms) − F(t)] / 0,05 s` |
| `eccentric_mean_force` | Exzentrische Mittelkraft / Eccentric Mean Force | N | eccentric | Mittelkraft von Bewegungsbeginn bis v = 0. — `(1/T) ∫F dt über [t_Onset, t(v=0)]` |
| `eccentric_peak_force` | Exzentrische Spitzenkraft / Eccentric Peak Force | N | eccentric | Maximale Kraft zwischen Bewegungsbeginn und v = 0. — `max F(t), t ∈ [t_Onset, t(v=0)]` |
| `eccentric_peak_velocity` | Exzentrische Spitzengeschwindigkeit / Eccentric Peak Velocity | m/s | eccentric | Maximale Abwärtsgeschwindigkeit (negativ = nach unten). — `min v(t), t ∈ [t_Onset, t(v=0)]` |
| `countermovement_depth` | Gegenbewegungstiefe / Countermovement Depth | cm | eccentric | Vertikale COM-Verschiebung bis zum tiefsten Punkt (negativ = nach unten). — `s(t(v=0)) = ∫v dt von Onset bis v=0` |
| `force_at_zero_velocity` | Kraft bei Nullgeschwindigkeit / Force at Zero Velocity | N | eccentric | Gesamtkraft im tiefsten Punkt der Gegenbewegung. — `F(t(v=0))` |
| `peak_landing_force` | Landungs-Spitzenkraft / Peak Landing Force | N | landing | Maximale Gesamtkraft nach der Landung (500-ms-Fenster). — `max F(t), t ∈ [t_Landung, t_Landung + 500 ms]` |
| `landing_rfd` | Landungs-RFD / Landing RFD | N/s | landing | Mittlere Kraftanstiegsrate vom Erstkontakt bis zur Landungs-Spitzenkraft. — `(F_peak,Landung − F(t_Landung)) / (t_peak − t_Landung)` |
| `asym_concentric_mean_force` | Asymmetrie konz. Mittelkraft / Concentric Mean Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der konzentrischen Mittelkraft. — `Mittelkraft je Platte über [t(v=0), t_Takeoff]. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_eccentric_mean_force` | Asymmetrie exz. Mittelkraft / Eccentric Mean Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der exzentrischen Mittelkraft. — `Mittelkraft je Platte über [t_Onset, t(v=0)]. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_concentric_impulse` | Asymmetrie konz. Impuls / Concentric Impulse Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie des konzentrischen Netto-Impulses. — `Netto-Impuls je Platte: ∫(F_Platte − Anteil_Ruhe·BW) dt über die konzentrische Phase. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_takeoff_peak_force` | Asymmetrie Takeoff-Spitzenkraft / Takeoff Peak Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Spitzenkraft in der Abdruckphase. — `Spitzenkraft je Platte über die konzentrische Phase. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `asym_peak_landing_force` | Asymmetrie Landungs-Spitzenkraft / Peak Landing Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Spitzenkraft nach der Landung. — `Spitzenkraft je Platte im Landefenster. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `contact_time` | Bodenkontaktzeit / Contact Time | s | contact | Dauer des Bodenkontakts von der Landung (Kraft > 20 N) bis zum Abheben. — `t_Kontakt = t_Takeoff − t_Landung` |
| `rsi` | RSI / RSI | m/s | contact | Reaktivkraft-Index: Sprunghöhe (Flugzeit) / Bodenkontaktzeit. — `RSI = h_Flug / t_Kontakt,  h_Flug = g·t_Flug²/8` |
| `active_stiffness` | Aktive Steifigkeit / Active Stiffness | N/m | contact | Spitzenkraft im Kontakt geteilt durch die maximale COM-Absenkung (Federsteifigkeit des Beinsystems). — `k = F_max,Kontakt / Δs_max,  Δs_max = −min s(t) im Kontakt (s ab Landung, v₀ ballistisch verankert)` |
| `peak_drop_landing_force` | Drop-Landungs-Spitzenkraft / Peak Drop Landing Force | N | contact | Maximale Kraft im Kontakt nach dem Fallen vom Kasten. — `max F(t), t ∈ [t_Landung, t_Takeoff]` |
| `contact_mean_force` | Kontakt-Mittelkraft / Mean Contact Force | N | contact | Mittlere Kraft im Bodenkontakt. — `(1/T) ∫F dt über den Kontakt` |
| `landing_velocity` | Landegeschwindigkeit / Landing Velocity | m/s | landing | Abwärtsgeschwindigkeit beim Aufprall (Betrag), aus Impulsbilanz bzw. Ruhe nach Stabilisierung abgeleitet. — `DJ/Hop: v₀ = v_TO(Flugzeit) − Δv_Kontakt;  Land&Hold: v(Stabilisierung)=0 ⇒ v₀ = −∫a dt` |
| `drop_height_est` | Fallhöhe (geschätzt) / Drop Height (est.) | cm | landing | Aus der Landegeschwindigkeit geschätzte Fallhöhe des Kastens. — `h_Fall = v₀² / (2g)` |
| `asym_contact_peak_force` | Asymmetrie Kontakt-Spitzenkraft / Contact Peak Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Spitzenkraft im (Drop-)Kontakt. — `Spitzenkraft je Platte im Kontakt. Asymmetrie = (größere − kleinere Seite)/größere · 100; + = rechts höher.` |

## Hop-Familie (Hop, SL Hop, SL Hop and Return)

| Schlüssel | Bezeichnung | Einheit | Phase | Formel / Definition |
| --- | --- | --- | --- | --- |
| `body_weight` | Körpergewicht (System) / Body Weight (system) | N | overall | Gewichtskraft des Systems (Körper + externe Last) aus dem Wiegen. — `BW = (m_Körper + m_Last) · g,  g = 9,80665 m/s²` |
| `jump_height_flight` | Sprunghöhe (Flugzeit) / Jump Height (Flight Time) | cm | flight | Sprunghöhe aus der Flugzeit unter Annahme gleicher Abheb- und Landehöhe. — `h = g · t_Flug² / 8` |
| `flight_time` | Flugzeit / Flight Time | s | flight | Dauer zwischen Abheben und Landung (Kraft < 20 N, linear interpolierte Schwellenkreuzung). — `t_Flug = t_Landung − t_Takeoff` |
| `peak_landing_force` | Landungs-Spitzenkraft / Peak Landing Force | N | landing | Maximale Gesamtkraft nach der Landung (500-ms-Fenster). — `max F(t), t ∈ [t_Landung, t_Landung + 500 ms]` |
| `landing_rfd` | Landungs-RFD / Landing RFD | N/s | landing | Mittlere Kraftanstiegsrate vom Erstkontakt bis zur Landungs-Spitzenkraft. — `(F_peak,Landung − F(t_Landung)) / (t_peak − t_Landung)` |
| `asym_peak_landing_force` | Asymmetrie Landungs-Spitzenkraft / Peak Landing Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Spitzenkraft nach der Landung. — `Spitzenkraft je Platte im Landefenster. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `contact_time` | Bodenkontaktzeit / Contact Time | s | contact | Dauer des Bodenkontakts von der Landung (Kraft > 20 N) bis zum Abheben. — `t_Kontakt = t_Takeoff − t_Landung` |
| `rsi` | RSI / RSI | m/s | contact | Reaktivkraft-Index: Sprunghöhe (Flugzeit) / Bodenkontaktzeit. — `RSI = h_Flug / t_Kontakt,  h_Flug = g·t_Flug²/8` |
| `active_stiffness` | Aktive Steifigkeit / Active Stiffness | N/m | contact | Spitzenkraft im Kontakt geteilt durch die maximale COM-Absenkung (Federsteifigkeit des Beinsystems). — `k = F_max,Kontakt / Δs_max,  Δs_max = −min s(t) im Kontakt (s ab Landung, v₀ ballistisch verankert)` |
| `contact_peak_force` | Kontakt-Spitzenkraft / Peak Contact Force | N | contact | Maximale Kraft im Bodenkontakt eines Hops. — `max F(t), t ∈ [t_Landung, t_Takeoff]` |
| `contact_mean_force` | Kontakt-Mittelkraft / Mean Contact Force | N | contact | Mittlere Kraft im Bodenkontakt. — `(1/T) ∫F dt über den Kontakt` |
| `asym_contact_peak_force` | Asymmetrie Kontakt-Spitzenkraft / Contact Peak Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Spitzenkraft im (Drop-)Kontakt. — `Spitzenkraft je Platte im Kontakt. Asymmetrie = (größere − kleinere Seite)/größere · 100; + = rechts höher.` |

## Land-and-Hold-Familie (+SL)

| Schlüssel | Bezeichnung | Einheit | Phase | Formel / Definition |
| --- | --- | --- | --- | --- |
| `body_weight` | Körpergewicht (System) / Body Weight (system) | N | overall | Gewichtskraft des Systems (Körper + externe Last) aus dem Wiegen. — `BW = (m_Körper + m_Last) · g,  g = 9,80665 m/s²` |
| `countermovement_depth` | Gegenbewegungstiefe / Countermovement Depth | cm | eccentric | Vertikale COM-Verschiebung bis zum tiefsten Punkt (negativ = nach unten). — `s(t(v=0)) = ∫v dt von Onset bis v=0` |
| `peak_landing_force` | Landungs-Spitzenkraft / Peak Landing Force | N | landing | Maximale Gesamtkraft nach der Landung (500-ms-Fenster). — `max F(t), t ∈ [t_Landung, t_Landung + 500 ms]` |
| `landing_rfd` | Landungs-RFD / Landing RFD | N/s | landing | Mittlere Kraftanstiegsrate vom Erstkontakt bis zur Landungs-Spitzenkraft. — `(F_peak,Landung − F(t_Landung)) / (t_peak − t_Landung)` |
| `asym_peak_landing_force` | Asymmetrie Landungs-Spitzenkraft / Peak Landing Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Spitzenkraft nach der Landung. — `Spitzenkraft je Platte im Landefenster. Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.` |
| `landing_velocity` | Landegeschwindigkeit / Landing Velocity | m/s | landing | Abwärtsgeschwindigkeit beim Aufprall (Betrag), aus Impulsbilanz bzw. Ruhe nach Stabilisierung abgeleitet. — `DJ/Hop: v₀ = v_TO(Flugzeit) − Δv_Kontakt;  Land&Hold: v(Stabilisierung)=0 ⇒ v₀ = −∫a dt` |
| `drop_height_est` | Fallhöhe (geschätzt) / Drop Height (est.) | cm | landing | Aus der Landegeschwindigkeit geschätzte Fallhöhe des Kastens. — `h_Fall = v₀² / (2g)` |
| `time_to_peak_force` | Zeit bis Spitzenkraft / Time to Peak Force | s | landing | Zeit vom Erstkontakt bis zur maximalen Kraft im Landefenster. — `t(F_max) − t_Landung` |
| `time_to_stabilization` | Stabilisierungszeit / Time to Stabilisation | s | landing | Zeit vom Erstkontakt, bis die Kraft ≥ 500 ms lang innerhalb von ±5 % BW bleibt. — `t_stab − t_Landung;  \|F − BW\| ≤ 0,05·BW für ≥ 500 ms` |
| `asym_landing_mean_force` | Asymmetrie Landungs-Mittelkraft / Landing Mean Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Mittelkraft im Landefenster (Land and Hold). — `Mittelkraft je Platte über [t_Landung, t_Landung+500 ms]. Vorzeichen: + = rechts höher.` |

## Isometrie-Familie (generisch, IMTP, Isometric Squat, Shoulder ISO-I/Y/T)

| Schlüssel | Bezeichnung | Einheit | Phase | Formel / Definition |
| --- | --- | --- | --- | --- |
| `iso_peak_force` | Spitzenkraft / Peak Force | N | isometric | Maximale Gesamtkraft der Kontraktion (brutto). — `F_peak = max F(t) über die Kontraktion (bei invertierter Richtung: min F(t))` |
| `iso_net_peak_force` | Netto-Spitzenkraft / Net Peak Force | N | isometric | Spitzenkraft abzüglich Körpergewicht in Testposition (bzw. Basislinie). — `F_net = \|F_peak − BW\|,  BW = Gewicht in Testposition (gewogen) bzw. Ruhe-Basislinie` |
| `iso_time_to_peak` | Zeit bis Spitzenkraft / Time to Peak Force | s | isometric | Zeit vom Kontraktionsbeginn (Yank-/5-SD-Onset) bis zur Spitzenkraft. — `t(F_peak) − t_Onset` |
| `iso_duration` | Kontraktionsdauer / Contraction Duration | s | isometric | Dauer der Kontraktion (Onset bis Kraftabfall unter 15 % der Spitze). — `t_Ende − t_Onset` |
| `iso_rfd_50` | RFD 0–50 ms / RFD 0–50 ms | N/s | isometric | Mittlere Kraftanstiegsrate in den ersten 50 ms ab Onset. — `RFD = (F(t_Onset + 50 ms) − F_Basis) / 50 ms` |
| `iso_rfd_100` | RFD 0–100 ms / RFD 0–100 ms | N/s | isometric | Mittlere Kraftanstiegsrate in den ersten 100 ms ab Onset. — `RFD = (F(t_Onset + 100 ms) − F_Basis) / 100 ms` |
| `iso_rfd_150` | RFD 0–150 ms / RFD 0–150 ms | N/s | isometric | Mittlere Kraftanstiegsrate in den ersten 150 ms ab Onset. — `RFD = (F(t_Onset + 150 ms) − F_Basis) / 150 ms` |
| `iso_rfd_200` | RFD 0–200 ms / RFD 0–200 ms | N/s | isometric | Mittlere Kraftanstiegsrate in den ersten 200 ms ab Onset. — `RFD = (F(t_Onset + 200 ms) − F_Basis) / 200 ms` |
| `iso_rfd_250` | RFD 0–250 ms / RFD 0–250 ms | N/s | isometric | Mittlere Kraftanstiegsrate in den ersten 250 ms ab Onset. — `RFD = (F(t_Onset + 250 ms) − F_Basis) / 250 ms` |
| `iso_impulse_100ms` | Impuls 0–100 ms / Impulse 0–100 ms | N·s | isometric | Netto-Impuls über der Basislinie in den ersten 100 ms ab Onset. — `J = ∫(F − F_Basis) dt über [t_Onset, t_Onset + 100 ms]` |
| `iso_impulse_200ms` | Impuls 0–200 ms / Impulse 0–200 ms | N·s | isometric | Netto-Impuls über der Basislinie in den ersten 200 ms ab Onset. — `J = ∫(F − F_Basis) dt über [t_Onset, t_Onset + 200 ms]` |
| `iso_impulse_300ms` | Impuls 0–300 ms / Impulse 0–300 ms | N·s | isometric | Netto-Impuls über der Basislinie in den ersten 300 ms ab Onset. — `J = ∫(F − F_Basis) dt über [t_Onset, t_Onset + 300 ms]` |
| `iso_rfd_max` | Max-RFD (20 ms) / Max RFD (20 ms) | N/s | isometric | Größter Kraftanstieg in einem 20-ms-Fenster zwischen Onset und Spitzenkraft. — `max_t [F(t + 20 ms) − F(t)] / 0,02 s` |
| `asym_iso_peak_force` | Asymmetrie Spitzenkraft / Peak Force Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der Netto-Spitzenkraft je Platte (über der jeweiligen Basislinie). — `Netto-Spitze je Platte = \|extremum − Basislinie_Platte\|. Asymmetrie = (größere − kleinere Seite)/größere · 100; + = rechts höher.` |
| `asym_iso_impulse_200ms` | Asymmetrie Impuls 0–200 ms / Impulse 0–200 ms Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie des Netto-Impulses in den ersten 200 ms. — `J_Platte = ∫(F_Platte − Basislinie_Platte) dt über [t_Onset, t_Onset + 200 ms]; Vorzeichen: + = rechts höher.` |

## Balance-Familie (Quiet Stand, SL Stand, SL Range of Stability)

| Schlüssel | Bezeichnung | Einheit | Phase | Formel / Definition |
| --- | --- | --- | --- | --- |
| `balance_duration` | Auswertedauer / Analysis Duration | s | balance | Dauer des ausgewerteten Fensters (ohne die ersten 1 s Einschwingen). — `N / f_s` |
| `cop_path_length` | CoP-Pfadlänge / CoP Path Length | mm | balance | Gesamtlänge der CoP-Bahn (10-Hz-Zero-Phase-Tiefpass). — `L = Σ √(Δx² + Δy²)` |
| `cop_mean_velocity` | CoP-Mittelgeschwindigkeit / CoP Mean Velocity | mm/s | balance | Mittlere Geschwindigkeit des CoP (Pfadlänge / Dauer). — `v̄ = L / T` |
| `cop_area_95` | CoP-Fläche (95-%-Ellipse) / CoP Area (95 % ellipse) | mm² | balance | Fläche der 95-%-Konfidenzellipse der CoP-Punktwolke. — `A = χ²(2; 0,95)·π·√(λ₁·λ₂) = 5,991·π·√det Σ` |
| `cop_hull_area` | CoP-Hüllfläche / CoP Hull Area | mm² | balance | Fläche der konvexen Hülle der CoP-Bahn (Stabilitätsbereich). — `Fläche der konvexen Hülle aller CoP-Punkte` |
| `cop_ap_sd` | AP-Schwankung (SD) / AP Sway (SD) | mm | balance | Standardabweichung der CoP-Position in anterior-posteriorer Richtung. — `SD(y)` |
| `cop_ml_sd` | ML-Schwankung (SD) / ML Sway (SD) | mm | balance | Standardabweichung der CoP-Position in medio-lateraler Richtung. — `SD(x)` |
| `cop_ap_range` | AP-Ausschlag (Range) / AP Range | mm | balance | Maximaler Ausschlag des CoP in AP-Richtung. — `max y − min y` |
| `cop_ml_range` | ML-Ausschlag (Range) / ML Range | mm | balance | Maximaler Ausschlag des CoP in ML-Richtung. — `max x − min x` |
| `cop_ap_velocity` | AP-Geschwindigkeit / AP Velocity | mm/s | balance | Mittlere Betragsgeschwindigkeit des CoP in AP-Richtung. — `mean \|Δy\|·f_s` |
| `cop_ml_velocity` | ML-Geschwindigkeit / ML Velocity | mm/s | balance | Mittlere Betragsgeschwindigkeit des CoP in ML-Richtung. — `mean \|Δx\|·f_s` |
| `asym_balance_load` | Asymmetrie Belastung / Weight-bearing Asymmetry | % | asymmetry | Links/Rechts-Asymmetrie der mittleren Plattenlast im Auswertefenster. — `Mittelkraft je Platte; Asymmetrie = (größere − kleinere)/größere · 100; + = rechts höher.` |
