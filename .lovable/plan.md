# Bug: „E-Mail versendet" erscheint bei frisch erstellter Rechnung/Angebot

## Ursache (eindeutig identifiziert)

`EmailVersandHistorie` (Beleg-Detailseite) ruft `useEmailVersand({ belegId, belegTyp })`. Der Hook (`src/hooks/useApi.ts:995`) baut die URL aber so:

```
/email/versand?belegId=<id>&belegTyp=rechnung
```

Das Backend-Schema (`backend/src/routes/email.ts:143`) erwartet jedoch **`beleg_id`** (snake_case). `belegId` wird ignoriert, es gibt keinen `belegTyp`-Filter überhaupt. Folge: Backend liefert die **globale, ungefilterte** Versand-Liste zurück. Die Komponente nimmt `liste[0]` bzw. `find(status==='gesendet')` — das ist dann irgendein älterer erfolgreicher Versand zu einem ganz anderen Beleg → grünes Badge „E-Mail versendet" auf einem Beleg, zu dem nie eine Mail rausging.

Verstärkt wird das durch React-Query-Cache: Da `qk.email.versand(filter)` nach Filter keyt, aber alle gleichzeitig dieselben Daten zurückbekommen, wirkt es bei jedem neuen Beleg sofort „versendet".

## Fix (klein, rein Frontend + minimaler Backend-Filter)

### 1. `src/hooks/useApi.ts` — Param-Namen korrigieren
- `q.set("belegId", ...)` → `q.set("beleg_id", filter.belegId)`
- `belegTyp` zusätzlich als `beleg_art` mitsenden (vom Backend-Schema heute nicht gefiltert, siehe Schritt 2).

### 2. `backend/src/routes/email.ts` — Filter um `beleg_art` erweitern
- Schema um `beleg_art: z.enum(["angebot","rechnung"]).optional()` ergänzen.
- An `listVersand` als zusätzliche WHERE-Bedingung weiterreichen.
- `backend/src/email/versand-repo.ts` → `ListFilter` um `belegArt?: BelegArt` ergänzen, in der WHERE-Klausel `beleg_art = ?` anhängen.

Damit ist garantiert, dass die Detailseite einer Rechnung niemals einen Angebots-Versand und umgekehrt zu sehen bekommt — auch wenn IDs zufällig kollidieren oder ein Beleg gelöscht/neu angelegt wurde.

### 3. (Defensiv) `EmailVersandHistorie.tsx`
- Zur Sicherheit zusätzlich client-seitig filtern: `liste.filter(v => v.belegId === belegId && v.belegArt === belegTyp)` bevor `letzterVersuch` / `letzterErfolg` bestimmt werden. So bleibt die UI auch korrekt, falls eine alte Backend-Version (ohne neuen Filter) im Cache sitzt.

## Verifikation

1. Neue Rechnung anlegen → Detailseite öffnen → Karte „E-Mail-Versand" zeigt **„Noch nicht versendet"** (grau, Mail-Icon).
2. Über den Dialog tatsächlich versenden → Karte schaltet auf grünes „E-Mail versendet … am …".
3. Eine zweite, neue Rechnung anlegen → wieder „Noch nicht versendet" (kein Übersprung mehr).
4. Netzwerk-Tab: Request lautet `/email/versand?beleg_id=…&beleg_art=rechnung` und Response enthält ausschließlich Einträge zu diesem Beleg.

## Nicht im Scope

- Kein Eingriff in `enqueueVersand`, SMTP, Mahn-Cron, Vorlagen, Auto-Mail-Garantie.
- Keine Datenbank-Migration nötig (Spalten existieren bereits).
- Keine UI-Umgestaltung der Karte selbst.
