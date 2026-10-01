# Hardware-Adapter: echte Messplatten anbinden

Buildr Force kennt Messplatten nur über das Interface `DeviceAdapter` (`packages/device/src/types.ts`). Der Simulator, die Datei-Wiedergabe und
alle echten Platten sind austauschbare Implementierungen davon – Analyse, Anzeige, Speicherung und Gruppentest sehen keinen Unterschied.

> **Wichtig:** Das Protokoll kommerzieller Platten (z. B. VALD) ist proprietär. Dieses Repository enthält **keinen** Treiber dafür und erfindet
> keinen. Mitgeliefert sind generische Transporte (WebSocket, Web Serial, Web Bluetooth) mit einer Einsteckstelle für **deinen** Protokoll-Decoder
> sowie ein eigenes Beispielprotokoll (`SimpleFrameCodec`, „BF1“) für Tests und als Vorlage.

## Datenfluss

```
Platten ──Transport──▶ DeviceAdapter ──Sample[]──▶ JitterBuffer ──UniformChunk──▶ Ringpuffer (Anzeige, 60 fps)
 (USB/BT/WS)           (Decoder)        (t µs, L, R)   (sortieren, Takt, Lücken)       └▶ Web Worker: LiveAnalyzer
                                                                                          (Nullen, Wiegen, Auto-Detect, Metriken)
```

- `Sample`: `{ t: µs (monoton), left: N, right: N, corners?: 8 × N, seq?: u16 }` – **ungenullte Rohkraft** je Platte (Newton, Zug negativ ist erlaubt).
- Nullen/Taren übernimmt die Software (`core/zero`, Offsets je Platte); ein Hardware-Tara (`zero()`) ist optional.
- Der `JitterBuffer` rastet die Samples auf ein gleichmäßiges Raster ein (Jitter/Drift ±½ Periode), sortiert innerhalb eines Fensters um (Standard 20 ms),
  entfernt Duplikate, interpoliert kurze Lücken linear und markiert lange Lücken als Aufnahmeunterbrechung. Paketverluste werden gezählt und angezeigt
  (Statusleiste); nicht überbrückbare Lücken werden als Unterbrechung (`breaks`) in der Aufnahme gespeichert – die Analyse wertet dann nicht über die Lücke hinweg aus.

## Schritt 1 – Frame-Decoder schreiben

Ein `FrameDecoder` macht aus beliebig zerstückelten Transportbytes vollständige Samples:

```ts
import type { FrameDecoder, Sample } from '@buildr/device';

export class MyPlateDecoder implements FrameDecoder {
  private buf = new Uint8Array(0);
  discardedBytes = 0; // optional: Statusanzeige

  reset(): void {
    this.buf = new Uint8Array(0);
  }

  push(bytes: Uint8Array): Sample[] {
    // 1. an den Puffer anhängen   2. nach Synchronwort suchen   3. Länge/CRC prüfen (bei Fehler: ab nächstem Byte neu synchronisieren)
    // 4. Frame → Sample: t in µs (monoton – bei Zähler-Überlauf hochzählen!), left/right in Newton, optional corners/seq
    // 5. Rest des Puffers behalten
    return [];
  }
}
```

Regeln, die der Rest der App voraussetzt:

| Punkt          | Anforderung                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Einheit        | Newton, **keine** Vorab-Filterung/Nullung. Skalierung/Kalibrierfaktoren des Herstellers gehören in den Decoder.                                        |
| Zeit `t`       | Mikrosekunden, streng monoton (Geräteuhr bevorzugt; sonst Empfangszeit des Pakets + laufender Zähler). Überläufe (z. B. u32 µs ≈ 71,6 min) auffangen.  |
| `seq`          | Wenn das Protokoll eine Paketnummer hat: durchreichen (Modulus Standard 65 536) – so werden Verluste exakt gezählt.                                    |
| Ecksensoren    | Falls vorhanden: `corners = [lFL, lFR, lBL, lBR, rFL, rFR, rBL, rBR]` (N) und `hasCorners: true` – damit funktioniert der Balance-Test mit echtem CoP. |
| Fehlertoleranz | Nie werfen: ungültige Bytes zählen (`discardedBytes`) und verwerfen. Teil-Frames am Pufferende aufheben.                                               |
| Abtastrate     | `info.supportedHz` und `status.samplingHz` ehrlich melden; `setSamplingHz` darf unbekannte Raten mit `DeviceError('…', 'unsupported')` ablehnen.       |

Das mitgelieferte Beispiel `packages/device/src/transports/decoder.ts` (`SimpleFrameCodec`, Frame: `B5 46 | flags | seq u16 | t u32 µs | L f32 | R f32 | [8 × f32] | crc8`)
zeigt Synchronisation, CRC-Prüfung, Zerstückelung und Zeitüberlauf in ~60 Zeilen.

## Schritt 2 – Adapter wählen oder schreiben

Für die drei gängigen Transporte gibt es fertige Adapter-Klassen, die Verbindung, Status, Fehler und Byte-Strom erledigen und nur noch deinen Decoder brauchen:

```ts
import { WebSerialAdapter, WebSocketAdapter, WebBluetoothAdapter } from '@buildr/device';

new WebSocketAdapter({ url: 'ws://192.168.4.1:81', decoder: new MyPlateDecoder(), hz: 1000 });
new WebSerialAdapter({
  decoder: new MyPlateDecoder(),
  baudRate: 921_600,
  filters: [{ usbVendorId: 0x1234 }],
});
new WebBluetoothAdapter({
  decoder: new MyPlateDecoder(),
  service: '0000aaaa-…',
  characteristic: '0000bbbb-…',
}); // UUIDs sind Pflicht
```

- **Web Serial / Web Bluetooth** brauchen Chromium (Chrome/Edge), HTTPS bzw. `localhost` und eine **Nutzergeste** (Klick auf „Verbinden“). Deshalb erzeugt die
  Registry (nächster Schritt) den Adapter erst beim Klick.
- Ohne `decoder` werfen die Adapter `ProtocolNotImplementedError` mit Hinweis auf dieses Dokument.
- Sonderfälle (eigenes SDK, Native-Bridge, UDP-Gateway): `BaseAdapter` erweitern und `connect()`, `disconnect()` implementieren; Samples mit
  `this.emitSamples([...])`, Statusänderungen mit `this.updateStatus({...})` melden.

```ts
import { BaseAdapter, type DeviceInfo } from '@buildr/device';

export class MyBridgeAdapter extends BaseAdapter {
  readonly info: DeviceInfo = {
    kind: 'my-bridge',
    name: 'Meine Bridge',
    serial: 'SN-0001',
    plates: 2,
    supportedHz: [500, 1000],
    hasCorners: false,
  };
  async connect() {
    this.updateStatus({ connection: 'connecting' });
    /* … */ this.updateStatus({ connection: 'connected' });
  }
  async disconnect() {
    /* … */ this.updateStatus({ connection: 'disconnected' });
  }
}
```

## Schritt 3 – Treiber registrieren

Datei `apps/web/src/devices.ts` (wird beim Start geladen):

```ts
import { WebSocketAdapter } from '@buildr/device';
import { registerAdapter } from './live/adapters.ts';
import { MyPlateDecoder } from './drivers/myPlate.ts';

registerAdapter({
  id: 'my-plates-ws', // [a-z0-9-], stabil
  label: 'Meine Platten (WebSocket)', // Anzeige im Schritt „Verbinden“
  description: 'Gateway im Labor-WLAN',
  create: () => new WebSocketAdapter({ url: 'ws://192.168.4.1:81', decoder: new MyPlateDecoder(), hz: 1000 }),
});
```

Danach erscheint die Quelle im Schritt **Verbinden** (die Platzhalter für WebSocket/Seriell/Bluetooth verschwinden). Auch der Gruppentest nutzt den Treiber.
Fehler in `create()` bzw. `connect()` werden im Verbinden-Schritt angezeigt; die App bleibt bedienbar.

## Schritt 4 – Prüfen

1. **Decoder-Test** (Vitest, ohne Hardware): Frames mit `encode…` erzeugen, zerstückelt einspeisen, CRC-Fehler und Überlauf testen – Vorlage:
   `packages/device/test/transports.test.ts` (SimpleFrameCodec, Adapter mit Fake-Socket) und `apps/web/test/adapters.test.tsx` (Registry → Verbinden → Daten im Ringpuffer, mit einer Fake-Gegenstelle).
2. **Mitschnitt wiedergeben:** Rohdaten als CSV (`Time,Left,Right`, Dezimalpunkt oder -komma) speichern und über **Verbinden → Datei-Wiedergabe → Datei wählen** abspielen. Die Datei läuft
   wie ein Live-Gerät durch die ganze Kette; für den Schritt **Nullen** muss sie deshalb mit einer Ruhephase **leerer Platten** (≥ 1 s) beginnen. Exportierte Einzelversuche
   (Person steht schon auf den Platten) eignen sich daher nur zum Ansehen der Kurve, nicht für den kompletten Ablauf.
3. **Am Gerät:** Verbinden → Nullen (Platten leer, ≥ 1 s ruhig) → Wiegen → Test. Kontrolle: Nullen meldet Offsets in der Größenordnung weniger Newton,
   das Körpergewicht stimmt mit einer Waage überein (±0,5 %), Paketverlust in der Statusleiste bleibt < 0,1 %.
4. **Zeitverhalten:** Anzeige-Latenz (Statusleiste) soll < 100 ms bleiben; `reorderWindowUs` (Standard 20 ms) in `state/live.ts` nur erhöhen, wenn das Gerät stark umsortiert.

## Checkliste für neue Treiber

- [ ] Rohkraft in N, Zeit in µs monoton, Überläufe behandelt
- [ ] Decoder verarbeitet zerstückelte Pakete, CRC-/Sync-Fehler ohne Ausnahme
- [ ] `info` (Seriennummer, `hasCorners`, `supportedHz`) und `status` (Verbindung, Akku, Verluste) korrekt
- [ ] `disconnect()` gibt Port/Socket/Timer frei; erneutes `connect()` funktioniert
- [ ] Decoder-Test + Wiedergabe eines echten Mitschnitts
- [ ] Registrierung in `apps/web/src/devices.ts`
