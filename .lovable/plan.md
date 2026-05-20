Drei Fixes — alles UI/Backend, keine Migration nötig.

## 1) Absenderzeile im PDF kleiner (einzeilig)

Die feine Zeile oben links über der Kundenadresse (Firmenname – Straße – PLZ Ort) bricht aktuell bei längeren Adressen um. Schrift wird von **8 pt auf 7 pt** verkleinert, damit die Zeile garantiert einzeilig bleibt. Betrifft Angebote und Rechnungen gleichermaßen.

Datei: `backend/src/pdf/layout.ts` → in `header()` die `fontSize: 8` der `absenderzeile` auf `7` setzen. Sonst nichts ändern (Footer, Tabelle, Fußzeile bleiben wie sie sind).

## 2) „MyCleanCenter" → „My Clean Center" überall sichtbar

Nur die für Endkunden/Empfänger sichtbaren Stellen werden umbenannt. Interne Identifier (Hostname `mycleancenter.local`, systemd-Units, npm package.json, GitHub-User-Agent, Logger-Strings, README/mem-Dateien) bleiben unverändert — das sind technische Namen, die nichts mit der Außenwirkung zu tun haben.

Geändert wird:

| Datei | Bisher | Neu |
|---|---|---|
| `backend/src/pdf/firma.ts` | Default `"MyCleanCenter GmbH"` | `"My Clean Center GmbH"` |
| `backend/src/settings/schemas.ts` | Default `name: "MyCleanCenter GmbH"` | `"My Clean Center GmbH"` |
| `backend/src/routes/email.ts` | Test-Mail Subject + HTML | `My Clean Center — Test-Mail` / `…Ihrem My Clean Center-System…` |
| `backend/src/routes/drive.ts` | Drive-Verbindungstest-Datei | `My Clean Center — Verbindungstest…` |
| `src/components/layout/LockScreen.tsx` | Recovery-Druckseite `<title>` + `<h1>` | `My Clean Center Recovery-Code` |
| `src/components/rechnungen/RechnungenExcelExportDialog.tsx` | `wb.creator = "MyCleanCenter"` | `"My Clean Center"` |
| `backend/test/pdf.spec.ts` | Fixture `name: "MyCleanCenter GmbH"` | `"My Clean Center GmbH"` |

Bestehende Firma-Datensätze in der DB werden **nicht** angefasst — der eingegebene Firmenname ist nutzergesteuert. Nur die Default-Werte für Neuinstallationen ändern sich.

## 3) Testdaten-Reset: `FOREIGN KEY constraint failed`

Ursache: zwei FK-Ketten blockieren den `DELETE FROM kunde`.

```
dauerauftrag.kunde_id → kunde   (NO ACTION = RESTRICT)
dauerauftrag_lauf.dauerauftrag_id → dauerauftrag (CASCADE)
dauerauftrag_sonderposition.dauerauftrag_id → dauerauftrag (CASCADE)
```

Daueraufträge sind ohne ihren Kunden inhaltlich wertlos. Sie werden deshalb beim Testdaten-Reset **mitgelöscht** — das war in der ursprünglichen Memo („Dauerträge bleiben") nur für das Kunden-erhaltende Szenario gemeint, das hier nicht zutrifft.

Geändert wird ausschließlich `backend/src/routes/testdaten-reset.ts` (DELETE-Block in der Transaktion). Neue Reihenfolge (Kinder zuerst):

```text
DELETE FROM dauerauftrag_sonderposition;
DELETE FROM dauerauftrag_lauf;
DELETE FROM dauerauftrag;
DELETE FROM zahlung;
DELETE FROM mahn_lauf_eintraege;
DELETE FROM mahn_laeufe;
DELETE FROM email_versand WHERE beleg_art IN ('angebot','rechnung','protokoll');
DELETE FROM drive_upload_queue WHERE beleg_art IN ('angebot','rechnung','protokoll');
DELETE FROM dokumente_frist_benachrichtigung_log;
DELETE FROM dokumente;            -- protokolle.dokument_id SET NULL greift
DELETE FROM upload_sessions;
DELETE FROM protokolle;
DELETE FROM rechnung;             -- vor kunde (ON DELETE RESTRICT)
DELETE FROM angebot;              -- vor kunde (ON DELETE RESTRICT)
DELETE FROM notiz;                -- explizit, statt auf CASCADE zu vertrauen
DELETE FROM ansprechpartner;
DELETE FROM objekt;
DELETE FROM kunde;
DELETE FROM aktivitaet;
DELETE FROM benachrichtigung;
DELETE FROM belegnummer_zaehler_v2;
DELETE FROM belegnummer_reserviert;
DELETE FROM kunde_nummer_zaehler;
DELETE FROM objekt_nummer_zaehler;
```

Zusätzlich vor dem Block einmalig `db.pragma("foreign_keys = ON")` absichern (better-sqlite3 setzt es pro Connection — der Reset soll garantiert mit aktivem FK-Check laufen, damit künftige Inkonsistenzen sofort sichtbar werden statt stillschweigend zu passieren). Sentinel-Logik, Backup, Passwort-Check und Counts bleiben unverändert.

`counts.daueraufträge` wird **nicht** Teil der Antwort — Response-Shape bleibt stabil (Frontend zeigt weiterhin Kunden/Angebote/Rechnungen/Protokolle/Dokumente).

## Verifikation

- `bun --cwd backend test backend/test/pdf.spec.ts` — PDF-Snapshot weiterhin grün nach Schriftgrößen-Änderung und Firmenname-Rename.
- Reset-Endpoint manuell aufrufen (über UI), Antwort muss `200 { geloescht: {...} }` sein, Sentinel gesetzt, FK-Check bleibt aktiv.

## Außerhalb dieses Plans

- Keine neue Migration, kein Schema-Change.
- Keine Änderung an internen Hostnames, systemd-Units, mDNS-Aliasen, Logger-Prefixen, package.json oder mem-Dateien.
- Keine Änderung an bereits gespeicherten Firma-Einträgen in der DB.