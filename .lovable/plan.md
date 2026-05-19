## Ziel
Zwei sichtbare Defekte im E-Mail-Versand-Dialog beheben.

## 1. Logo-URL in der Signatur als Bild rendern

**Problem:** Aktuell zeigt die Signatur einen leeren „Logo"-Platzhalter statt des Bildes von `https://mycleancenter.de/logo.png`. Grund: `autoLinkifyImages` ersetzt nur **nackte URLs** (Negative-Lookbehind `(?<!["'=>])`). In der gespeicherten Signatur ist die URL aber als HTML-Link hinterlegt (`<a href="https://mycleancenter.de/logo.png">Logo</a>`), daher greift die Regex nicht und es bleibt der Linktext „Logo" sichtbar.

**Fix in `src/lib/email/signature.ts`:** `autoLinkifyImages` so erweitern, dass es **zwei** Muster ersetzt:

1. `<a ... href="...image.ext...">irgendwas</a>` → komplett durch `<img>` ersetzen (Anchor entfernen, Bild rein).
2. weiterhin nackte URLs (bestehender Pfad).

Regex-Skizze:
```ts
const ANCHOR_IMG_RE =
  /<a\b[^>]*\bhref=["'](https?:\/\/[^"']+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^"']*)?)["'][^>]*>[\s\S]*?<\/a>/gi;
```
Beide Ersetzungen schreiben dasselbe `<img …>`-Markup wie bisher, sodass der Bestand (nackte URLs, neue Eingaben) konsistent bleibt.

Gilt automatisch überall, wo `autoLinkifyImages` schon eingesetzt wird (Dialog-Body, Signatur-Live-Vorschau, Einstellungen-Vorschau, finaleBody für Versand) — also: sofort sichtbar im CRM **und** sauber im Versand-HTML.

Reine Render-Transformation — DB-Wert der Signatur bleibt unverändert.

## 2. PDF-Vorschau im Anhang zeigt nichts

**Problem:** In der Lovable-Preview (und Browsern ohne PDF-Plugin) liefert ein nacktes `<iframe src={blobUrl}>` eine weiße Fläche. Genau dafür existiert bereits `PdfCanvasViewer` (siehe Kommentar dort), der die Seiten via PDF.js auf Canvas zeichnet.

**Fix in `src/components/email/EmailVersandDialog.tsx`:**
- Neue optionale Prop `pdfBlob?: Blob | null` zum Dialog hinzufügen.
- Beim Aufklappen der Vorschau statt `<iframe>` `<PdfCanvasViewer pdfUrl={pdfBlobUrl} pdfBlob={pdfBlob} fileName={pdfDateiname} maxWidth={760} className="max-h-[480px] overflow-auto" />` rendern.
- Der bisherige `ChevronDown/Up`-Toggle bleibt unverändert.

**Aufrufer angleichen (drei Stellen):**
- `src/routes/rechnungen.$id.tsx` (2× `<EmailVersandDialog … pdfBlobUrl={pdf.url}>` → zusätzlich `pdfBlob={pdf.blob}`)
- `src/routes/angebote.$id.tsx` (1× analog)
- `src/components/notifications/ErinnerungPopup.tsx` (1× analog)

`pdf.blob` ist in allen vier Stellen bereits über den `useAngebotPdf` / `useRechnungPdf`-Hook verfügbar.

## Out of Scope
- Keine Änderung an Vorlagen, Signaturen-Schema oder Backend.
- Keine Base64-Konvertierung des Logos: Die Lovable-Stack-Empfehlung ist hier nicht passend, weil der Versand über den lokalen Pi-SMTP läuft und der Mail-Client das Bild direkt von `mycleancenter.de` lädt. Die UI-Darstellung im CRM funktioniert ebenfalls direkt über die URL, sobald der Anchor zu `<img>` wird.

## Geänderte Dateien
- `src/lib/email/signature.ts`
- `src/components/email/EmailVersandDialog.tsx`
- `src/routes/rechnungen.$id.tsx`
- `src/routes/angebote.$id.tsx`
- `src/components/notifications/ErinnerungPopup.tsx`
