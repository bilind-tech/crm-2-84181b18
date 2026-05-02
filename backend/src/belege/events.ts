// Schmaler Event-Bus für Beleg-Lifecycle. Step 5 wird genutzt für
// PDF-Cache-Invalidation; Step 6 hängt sich für Drive-Upload + Mailversand ein.

import type { BelegArt } from "../pdf/cache.js";

type BelegMutationListener = (art: BelegArt, id: string) => void;
type BelegSentListener = (art: BelegArt, id: string) => void;

const onMutationListeners: BelegMutationListener[] = [];
const onSentListeners: BelegSentListener[] = [];

export function onBelegMutated(l: BelegMutationListener): void {
  onMutationListeners.push(l);
}
export function emitBelegMutated(art: BelegArt, id: string): void {
  for (const l of onMutationListeners) {
    try { l(art, id); } catch (e) { console.error("belegMutated listener", e); }
  }
}

export function onBelegVersendet(l: BelegSentListener): void {
  onSentListeners.push(l);
}
export function emitBelegVersendet(art: BelegArt, id: string): void {
  for (const l of onSentListeners) {
    try { l(art, id); } catch (e) { console.error("belegVersendet listener", e); }
  }
}
