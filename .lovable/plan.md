## Ziel
Schluss-Floskeln aus allen Default-E-Mail-Vorlagen entfernen, da Grußformel + Kontaktangebot bereits in der E-Mail-Signatur stehen.

## Änderungen

### 1. `backend/src/email/templates.ts` — Default-Vorlagen (v4)
Alle 6 Defaults bekommen neuen `seedKey` `*.v4` und werden inhaltlich gekürzt:

- **Entfernen** in jeder Vorlage:
  - `P("Mit freundlichen Grüßen")` (letzter Absatz)
  - `P("Bei Fragen oder Anpassungswünschen melden Sie sich gerne.")` (Angebot)
  - `P("Bei Rückfragen melden Sie sich gerne.")` (Protokoll)
  - `P("Vielen Dank für die Zusammenarbeit.")` (Rechnung Versand) — ebenfalls Floskel, gehört nicht in Body wenn Signatur folgt
  - `P("Sollte die Zahlung bereits erfolgt sein, ist diese Nachricht gegenstandslos.")` bleibt (sachlicher Hinweis, keine Grußfloskel) — **offen: streichen?**
  - `P("Sollte die Zahlung in den letzten Tagen bereits erfolgt sein, betrachten Sie dieses Schreiben bitte als gegenstandslos.")` bleibt analog
  - `P("Sollte bis zu diesem Termin kein Zahlungseingang erfolgen, behalten wir uns weitere Schritte vor.")` bleibt (sachliche Konsequenz)

- Body endet jeweils nach dem letzten sachlichen Absatz, ohne Gruß.
- Seed-Keys auf `.v4` hochziehen, damit der Seeder die neuen Defaults einspielt.

### 2. Neue Migration `backend/src/db/migrations/030_email_vorlagen_v4.sql`
- `DELETE FROM email_vorlage WHERE seed_key LIKE '%.v3';`
- (User-eigene Vorlagen mit `seed_key IS NULL` bleiben unangetastet — absolute Regel.)

### 3. Frontend
- `src/lib/erinnerung/seedVorlage.ts`: Lookup-Key von `rechnung.erinnerung.v3` auf `rechnung.erinnerung.v4` ändern.
- Sonst nichts: `EmailVersandDialog` baut Body = Vorlage + Signatur, das funktioniert unverändert.

## Offene Frage
Sollen auch die sachlichen Hinweissätze („Sollte die Zahlung bereits erfolgt sein …", „… behalten wir uns weitere Schritte vor.") raus, oder nur die Grußformel + Kontaktangebot? Standardmäßig nehme ich nur Gruß + Kontaktangebot + „Vielen Dank für die Zusammenarbeit" raus.

## Nicht im Umfang
- E-Mail-Signaturen (dort sollen Gruß + Kontakt stehen — Annahme: bereits vorhanden).
- User-eigene Vorlagen.
- Versand-Logik / Dialog.
