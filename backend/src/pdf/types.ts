// Form, in der die PDF-Schicht Firmendaten erwartet (entspricht src/lib/api/types Firmendaten).
// Die Backend-Settings (`FirmaSchema`) liefern leicht andere Schlüssel
// (name/web statt firmenname/webseite) — `loadFirmaForPdf()` mappt um.

export interface FirmaForPdf {
  firmenname: string;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  telefon?: string | null;
  email?: string | null;
  webseite?: string | null;
  ustId?: string | null;
  steuernummer?: string | null;
  handelsregister?: string | null;
  geschaeftsfuehrer?: string | null;
  bankName?: string | null;
  iban?: string | null;
  bic?: string | null;
}
