// Beleg-Summen — neutrale Helfer für Position/Rechnung-Berechnungen.
// Kein Mock-Bezug, reine Mathematik.
import type { Position } from "@/lib/api/types";

export function summePosition(p: Position): number {
  const brutto = p.menge * p.einzelpreisNetto;
  return brutto * (1 - p.rabatt / 100);
}

export function summenRechnung(
  positionen: Position[],
  rabattGesamt: number,
): { netto: number; steuer: number; brutto: number } {
  const netto =
    positionen.reduce((s, p) => s + summePosition(p), 0) *
    (1 - rabattGesamt / 100);
  let steuer = 0;
  for (const p of positionen) {
    steuer += summePosition(p) * (p.steuersatz / 100);
  }
  steuer *= 1 - rabattGesamt / 100;
  const brutto = netto + steuer;
  return { netto, steuer, brutto };
}
