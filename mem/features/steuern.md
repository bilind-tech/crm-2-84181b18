---
name: Steuer-Modul (GmbH Sankt Augustin)
description: 3 automatische Hauptsteuern + manuelle Termine, Rücklage-Widget, Disclaimer
type: feature
---

# Steuern (Step 10)

## Kontext
GmbH Sankt Augustin. **Reine Reinigung/Wartung — keine §48 Bauleistungen.**

## 3 automatische Hauptsteuern

### Umsatzsteuer
- 19% (Standard), 7% (ermäßigt)
- Aus Rechnungspositionen aggregiert
- Quartalsweise Voranmeldung

### Körperschaftsteuer + Solidaritätszuschlag
- KSt: 15% vom Gewinn
- Soli: 5,5% auf KSt → effektiv 0,825% vom Gewinn
- Zusammen: 15,825% vom Gewinn

### Gewerbesteuer
- Hebesatz Sankt Augustin: 525%
- Messzahl: 3,5%
- Effektiv: 3,5% × 525% = 18,375% vom Gewinn

## Effektive Gesamtbelastung
KSt + Soli + GewSt = 15,825% + 18,375% = **34,20% vom Gewinn**
→ **Empfohlene Rücklage: 35%** (kleiner Sicherheitspuffer)

## Datenmodell (Step 10 ✅ implementiert)
Migration `012_steuern.sql`:
- `steuer_einstellungen` (Singleton, id=1, CHECK): kstSatz, soliSatz, gewstMesszahl, gewstHebesatz, ustRhythmus, ruecklageSatz, ustPufferSatz, updatedAt
- `steuer_manueller_posten`: id (`man-…`), art, titel, zeitraum_jahr/monat/quartal, faelligAm, geschaetzterBetrag, notiz
- `steuer_bezahlt_markierung`: posten_id (PK), bezahltAm, tatsaechlicherBetrag, notiz — gilt für Auto- UND manuelle Posten

Auto-Posten-IDs sind im Frontend deterministisch (`ust-{jahr}-{mm|Qn}`, `kst-{jahr}`, `soli-{jahr}`, `gewst-{jahr}`). Bei Wechsel von `ustRhythmus` löscht das Backend automatisch alle `ust-*`-Bezahlt-Markierungen und liefert `ustBezahltGeloescht` im PATCH-Response zurück.

## Endpoints (alle hinter requireAuth)
GET/PATCH `/steuern/einstellungen` · POST `/steuern/einstellungen/reset` · GET/POST/PATCH/DELETE `/steuern/manuelle-posten[/:id]` · GET `/steuern/bezahlt` · PUT/DELETE `/steuern/bezahlt/:postenId`

## Frontend
`src/lib/steuern/store.ts` ist ein dünner React-Query-Adapter — UI bleibt unverändert. Beim ersten Mount migriert er einmalig vorhandenen LocalStorage-State auf den Server (Marker `mcc_steuern_migrated_v1`). Optimistic Updates für Bezahlt-Markierungen.

## Restliche Steuerarten
Als manuelle Termine (Lohnsteuer, etc.) — kein Auto-Calc.

## Disclaimer (Pflicht in UI)
„Schätzung — keine Steuerberatung. Verbindliche Berechnung durch Steuerberater."
