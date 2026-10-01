/**
 * Sicherheits-Header für alle Antworten. Die CSP erlaubt nur eigene Skripte/Worker (kein `unsafe-inline`/`eval`);
 * `style-src 'unsafe-inline'` ist für Inline-Styles der Diagramme nötig. `ws:`/`wss:` erlauben WebSocket-Messplatten im lokalen Netz
 * (WebSerial/WebBluetooth/WebUSB unterliegen nicht der CSP, sondern der Permissions-Policy).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const PERMISSIONS_POLICY =
  'camera=(self), microphone=(), geolocation=(), payment=(), serial=(self), bluetooth=(self), usb=(self)';

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Permissions-Policy': PERMISSIONS_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
