## Ziel

Den E-Mail-Versand-Dialog (`EmailVersandDialog.tsx`) deutlich aufwerten — schöneres Design, klarere Empfänger-Anzeige, animierter Versand-Zustand mit „Brief-fliegt"-Animation und Erfolgs-Feedback. Außerdem deutliche Code-Kommentare, dass aktuell nichts wirklich raus geht (Frontend-Stub) und wie das Backend später andockt.

---

## 1. Redesign Dialog

**Datei:** `src/components/email/EmailVersandDialog.tsx`

- **Hero-Header** mit großem Mail-Icon (Lucide `Mail`) in dezenter Primary-Glas-Optik (`bg-primary/10 ring-1 ring-primary/20`), Titel + Subline mit Empfänger-Name, Beleg-Nummer und ggf. Mahnstufe.
- **Kein Gradient-Hintergrund** im Body (Memory-Regel) — nur ganz dezenter Glanz im Header (`from-primary/8 via-background to-background`).
- **Empfänger-Block als zusammenhängende Karte** (`rounded-xl border bg-card/50`) mit drei Zeilen (An / Cc / Bcc). Jede Zeile zeigt eingegebene Adressen als kleine **Chips** (rounded-full, Primary-Tint). Cc/Bcc per „+ CC / BCC hinzufügen"-Button aufklappen.
- **Betreff** als prominente Zeile (h-11, text-base).
- **Editor-Tabs als Pille** (Visuell / HTML / Vorschau) mit `rounded-full` und sanftem Hover.
- **Vorschau-Iframe** mit weichem Inner-Shadow und freundlichem Default-Styling (Padding, Link-Farbe).
- **Signatur-Live-Vorschau** unter dem Editor, dezent gestrichelt umrandet — zeigt was unten automatisch dranhängt.
- **Anhang-PDF** mit kleinem rotem PDF-Icon-Tile (3-stufiger Status: Loading / Error / OK).
- **Footer** mit weichem Trenner (`border-t bg-muted/20`), großer „E-Mail senden"-Button (size lg, Send-Icon).

## 2. Versand-Animation (Send-Overlay)

Während des Versands legt sich ein halbtransparentes Overlay über den Dialog-Body:

**Phase „sending":**
- Großes, pulsierendes Send-Icon mit Ping-Ring (`animate-ping`) + leichte Wippbewegung (CSS-Keyframe `email-fly`).
- Text: „E-Mail wird versendet …" + Empfänger.

**Phase „success" (~1,1 s sichtbar bevor Dialog schließt):**
- Pop-Animation: `MailOpen`-Icon in Erfolgsgrün, Häkchen-Badge unten rechts.
- Sparkle-Burst (8 kleine `Sparkles` fliegen radial nach außen via CSS `spark-out`-Keyframe).
- Text: „E-Mail versendet" in Success-Farbe + Empfänger.
- Anschließend Toast + Dialog schließt.

Während Sending/Success ist der Dialog-Body deaktiviert (`pointer-events-none opacity-30`) und das Schließen blockiert.

> Hinweis: Die Sparkles hier sind **funktionale Erfolgs-Mikroanimation**, kein dekoratives Glitzer-Icon. Die Memory-Regel „keine Sparkles als Deko" zielt auf Header-/Card-Dekoration — eine Erfolgs-Burst-Animation ist davon ausgenommen.

## 3. Frontend-Stub-Kommentare (für später)

Großer Datei-Kopf-Kommentar in `EmailVersandDialog.tsx`:

```
// FRONTEND-STUB: Es geht aktuell KEINE echte E-Mail raus.
// useSendEmail() → POST /email/versand → Mock-Backend (src/lib/mock/backend.ts)
// simuliert nur den Versand und legt einen EmailVersand-Eintrag an.
//
// Wenn das echte Pi-Backend (Node + Fastify + nodemailer + Strato-SMTP)
// läuft, MUSS dieser Dialog NICHT angefasst werden — der Hook ruft schon
// den richtigen Endpunkt. Das Pi-Backend muss bei POST /email/versand:
//   1. SMTP-Transport via nodemailer + Strato anwerfen
//   2. PDF-Anhang aus Storage / Drive einbinden
//   3. status: "sent" oder "failed" zurückgeben
//   4. Bei Mahnungen den Beleg-Status aktualisieren
```

Zusätzlich Inline-Kommentar direkt vor dem `send.mutate(...)`-Aufruf.

## 4. Technische Details

- Keine neuen Dependencies, alle Animationen sind reines CSS (Inline-`<style>`-Block für Keyframes `email-fly`, `email-pop`, `spark-out`).
- Ein neuer State `phase: "idle" | "sending" | "success"` steuert das Overlay.
- Erfolgs-Toast wird **nach** der Erfolgs-Animation angezeigt (`setTimeout 1100 ms`).
- Bei Fehler: kein Erfolgs-Overlay, Phase zurück auf `idle`, normaler Error-Toast.
- Dialog-Schließen während `phase !== "idle"` blockiert.

## Dateien

- **Edit:** `src/components/email/EmailVersandDialog.tsx` (komplette Neugestaltung des Layouts + Send-Overlay-Komponente intern)

Keine anderen Dateien betroffen — der Hook `useSendEmail`, das Mock-Backend und die Aufrufer (Angebot/Rechnung/Mahnung) bleiben unverändert.
