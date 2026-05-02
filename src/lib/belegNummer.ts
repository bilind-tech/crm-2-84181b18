// Vorschau-Helper für Belegnummern.
// Format mit Kunden-Kürzel: {KÜRZEL}{MM}{YY}/{NN}, z. B. "GFU0526/01".
// Ohne Kürzel: globaler Präfix aus den Nummernkreisen (Fallback).
//
// Server-seitig wird die echte Nummer in src/lib/mock/backend.ts -> nextCustomerNumber()
// erzeugt. Dieser Helper dient ausschließlich der UI-Vorschau.

export function vorschauBelegnummer(
  kuerzel: string | undefined | null,
  fallbackPraefix: string,
  naechsterZaehler: number = 1,
  basisDatum: Date = new Date(),
): string {
  const k = kuerzel?.trim().toUpperCase();
  const yyyy = String(basisDatum.getFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(basisDatum.getMonth() + 1).padStart(2, "0");
  const n = Math.max(1, Math.floor(naechsterZaehler || 1));
  if (k) return `${k}${mm}${yy}/${String(n).padStart(2, "0")}`;
  return fallbackPraefix
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yy)
    .replace(/\{MM\}/g, mm)
    .replace(/\{####\}/g, String(n).padStart(4, "0"))
    .replace(/\{###\}/g, String(n).padStart(3, "0"));
}
