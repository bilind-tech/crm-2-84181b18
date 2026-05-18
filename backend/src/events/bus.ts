// Zentraler typisierter Event-Bus (in-process). Wird von SSE & Aktivitäts-Wireup
// abonniert. Domain-Module emittieren hier rein, statt eigene Listener zu pflegen.
import { EventEmitter } from "node:events";

export type AppEvent =
  | { type: "aktivitaet:neu";          payload: { id: string; art: string; bezugArt?: string | null; bezugId?: string | null; titel: string; zeitpunkt: string } }
  | { type: "benachrichtigung:neu";    payload: { id: string; prioritaet: "info"|"erfolg"|"warnung"|"fehler"; titel: string; aktionRoute?: string | null } }
  | { type: "benachrichtigung:gelesen"; payload: { id?: string; alle?: boolean } }
  | { type: "benachrichtigung:weg";    payload: { id: string } }
  | { type: "beleg:mutated";           payload: { art: "angebot" | "rechnung"; id: string; statusVorher?: string | null; statusNachher?: string | null } }
  | { type: "zahlung:erfasst";         payload: { rechnungId: string; betrag: number; statusNachher: string } }
  | { type: "mahnung:erstellt";        payload: { rechnungId: string; stufe: number } }
  | { type: "email:versand-changed";   payload: { id: string; status: string; belegArt?: string | null; belegId?: string | null; fehlerText?: string | null } }
  | { type: "drive:upload-changed";    payload: { id: string; status: string; belegArt?: string | null; belegId?: string | null; fehlerText?: string | null } }
  | { type: "drive:hochgeladen";       payload: { id: string; belegArt?: string | null; belegId?: string | null; fileId: string; webLink?: string | null } }
  | { type: "drive:fehler";            payload: { id: string; belegArt?: string | null; belegId?: string | null; fehlerText: string; final: boolean } }
  | { type: "dokument:erstellt";       payload: { id: string } }
  | { type: "backup:changed";          payload: { id?: string; status: string; art?: string; fehlerText?: string | null } }
  | { type: "update:phase";            payload: { phase: string; detail?: string | null } }
  | { type: "system:update:phase";     payload: { laufId: string; stepId: string; status: "wartet"|"laeuft"|"ok"|"fehler"|"uebersprungen"; label: string; detail?: string | null } }
  | { type: "system:update:lauf";      payload: { laufId: string; status: "laeuft"|"erfolg"|"fehler"|"rollback" } }
  | { type: "einstellung:geaendert";   payload: { key: string; userId?: string | null } }
  | { type: "auth:login";              payload: { userId: string; username: string; ip?: string | null } }
  | { type: "auth:logout";             payload: { userId: string } }
  | { type: "kunde:angelegt";          payload: { id: string; name: string } }
  | { type: "maintenance";             payload: { active: boolean } };

export type AppEventType = AppEvent["type"];
export type EventPayload<T extends AppEventType> = Extract<AppEvent, { type: T }>["payload"];

// Singleton EventEmitter — Default-Limit 10 reicht nicht (SSE + Wireup + Tests).
const emitter = new EventEmitter();
emitter.setMaxListeners(200);

export function emit<T extends AppEventType>(type: T, payload: EventPayload<T>): void {
  emitter.emit(type, payload);
  emitter.emit("*", { type, payload } as AppEvent);
}

export function on<T extends AppEventType>(type: T, fn: (p: EventPayload<T>) => void): () => void {
  emitter.on(type, fn as (...a: unknown[]) => void);
  return () => emitter.off(type, fn as (...a: unknown[]) => void);
}

export function onAny(fn: (e: AppEvent) => void): () => void {
  emitter.on("*", fn as (...a: unknown[]) => void);
  return () => emitter.off("*", fn as (...a: unknown[]) => void);
}

export function listenerCount(type: AppEventType | "*"): number {
  return emitter.listenerCount(type);
}

// Test-Hilfsfunktion
export function _resetBus(): void {
  emitter.removeAllListeners();
  emitter.setMaxListeners(200);
}
