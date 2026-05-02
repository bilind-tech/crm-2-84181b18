// SSE-Client gegen /events/stream (Pi-Backend).
// - Reconnect mit Backoff
// - Last-Event-ID Resume via interner Buchführung (EventSource setzt es selbst,
//   aber wir parsen die `id:`-Felder selbst, weil wir nur ein Subset filtern wollen).
// - Single-Instance pro App (mehrere Tabs sind ok, jeder Tab eine Verbindung).

import { getBackendUrl } from "./backendUrl";

export type SseListener = (ev: { type: string; data: unknown; id?: number }) => void;

const listeners = new Set<SseListener>();
const stateListeners = new Set<(connected: boolean) => void>();
let es: EventSource | null = null;
let active = false;
let connected = false;
let lastEventId: number | null = null;
let backoffMs = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function notifyState(): void {
  for (const l of stateListeners) {
    try { l(connected); } catch { /* ignore */ }
  }
}

function dispatch(type: string, data: unknown, id?: number): void {
  for (const l of listeners) {
    try { l({ type, data, id }); } catch { /* ignore listener errors */ }
  }
}

function open(): void {
  if (typeof window === "undefined" || !active) return;
  if (es) return;

  const url = `${getBackendUrl()}/events/stream`;
  try {
    es = new EventSource(url, { withCredentials: true });
  } catch {
    scheduleReconnect();
    return;
  }

  // Native EventSource ruft addEventListener pro Event-Name. Wir kennen die
  // wichtigen Typen aus dem Backend.
  const knownEvents = [
    "hello", "error", "maintenance",
    "aktivitaet:neu",
    "benachrichtigung:neu", "benachrichtigung:gelesen", "benachrichtigung:weg",
    "beleg:mutated", "zahlung:erfasst",
    "email:gesendet", "email:fehler",
    "drive:hochgeladen", "drive:fehler",
    "auth:login", "auth:logout",
    "backup:erstellt", "backup:fehler",
    "einstellung:geaendert",
  ];

  for (const name of knownEvents) {
    es.addEventListener(name, (raw) => {
      const me = raw as MessageEvent;
      const id = me.lastEventId ? Number(me.lastEventId) : undefined;
      if (Number.isFinite(id)) lastEventId = id!;
      let data: unknown = me.data;
      try { data = JSON.parse(me.data); } catch { /* keep string */ }
      dispatch(name, data, id);
    });
  }

  es.onopen = () => {
    backoffMs = 1000;
    connected = true;
    notifyState();
  };

  es.onerror = () => {
    // Auto-reconnect über Browser hat unklare Garantien — wir machen es selbst.
    if (es) { try { es.close(); } catch { /* noop */ } }
    es = null;
    connected = false;
    notifyState();
    scheduleReconnect();
  };
}

function scheduleReconnect(): void {
  if (!active || reconnectTimer) return;
  const delay = Math.min(backoffMs, 30_000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    backoffMs = Math.min(backoffMs * 2, 30_000);
    open();
  }, delay);
}

export function startSse(): void {
  if (active) return;
  active = true;
  open();
}

export function stopSse(): void {
  active = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (es) { try { es.close(); } catch { /* noop */ } es = null; }
  connected = false;
  notifyState();
}

export function onSse(listener: SseListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getLastEventId(): number | null { return lastEventId; }

export function isSseConnected(): boolean { return connected; }

/** Subscribe auf Verbindungsstatus. Liefert sofort den aktuellen Wert. */
export function onSseStatus(cb: (connected: boolean) => void): () => void {
  stateListeners.add(cb);
  cb(connected);
  return () => { stateListeners.delete(cb); };
}
