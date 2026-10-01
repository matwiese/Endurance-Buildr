/**
 * Hier werden eigene Messplatten-Treiber registriert (wird beim Start der App geladen).
 * Das Plattenprotokoll des Herstellers ist proprietär und nicht Teil dieses Repos – siehe docs/hardware-adapters.md.
 *
 * Beispiel (WebSocket-Gateway mit eigenem Decoder):
 *
 *   import { WebSocketAdapter } from '@buildr/device';
 *   import { registerAdapter } from './live/adapters.ts';
 *   import { MyPlateDecoder } from './drivers/myPlate.ts';
 *
 *   registerAdapter({
 *     id: 'my-plates-ws',
 *     label: 'Meine Platten (WebSocket)',
 *     create: () => new WebSocketAdapter({ url: 'ws://192.168.4.1:81', decoder: new MyPlateDecoder(), hz: 1000 }),
 *   });
 */
export {};
