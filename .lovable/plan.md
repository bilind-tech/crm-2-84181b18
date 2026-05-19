## Ziel
Drei UX-Probleme im Beleg-/E-Mail-Flow beheben.

## 1. „PDF bearbeiten" nach Versand sperren

**Wo:** `src/routes/rechnungen.$id.tsx` und `src/routes/angebote.$id.tsx`

Sobald der Beleg nicht mehr im Status `entwurf` ist (also bereits versendet, bezahlt, teilbezahlt, überfällig, storniert, angenommen, abgelehnt), wird der Button „PDF bearbeiten" deaktiviert.

- `<Button asChild>` → ersetzt durch `<Button>` mit `disabled={!istEntwurf}` (kein `asChild`+`Link` wenn disabled — Link würde sonst trotzdem navigierbar bleiben).
- Wenn disabled, `<Link>` weglassen; bei `istEntwurf` wie bisher mit `<Link>`.
- Tooltip via `title=` (kein neues Popover-Konstrukt):
  - Rechnung: `"PDF kann nicht mehr bearbeitet werden — die Rechnung wurde bereits versendet."`
  - Angebot: `"PDF kann nicht mehr bearbeitet werden — das Angebot wurde bereits versendet."`
- Optisch: weiterhin `variant="outline"`, gedimmt via `disabled:opacity-50`.

Logik:
```ts
const istEntwurf = r.status === "entwurf";
```
(Angebot analog mit `a.status === "entwurf"`.)

## 2. Visuell-Editor zeigt Inhalt sofort beim Öffnen

**Wo:** `src/components/email/EmailVersandDialog.tsx`

**Ursache:** Das contentEditable-`<div>` wird beim Öffnen mit leerem Inhalt gemountet. Der bestehende `useEffect` setzt `innerHTML` zwar nach, läuft aber in einem Render-Zyklus, in dem der Ref bei manchen Renderpfaden noch nicht das endgültige Body-HTML (aus dem Vorlagen-Reset) sieht — sichtbar bleibt: leer. Erst durch Tab-Wechsel wird das Div neu gemountet und der Effect läuft wieder.

**Fix:** Beim Mount direkt im Ref-Callback initialisieren, statt sich auf den Effect zu verlassen.

- Ref auf Callback-Ref umstellen:
  ```tsx
  const setVisuellNode = (node: HTMLDivElement | null) => {
    visuellRef.current = node;
    if (node && node.innerHTML === "") {
      node.innerHTML = replacePlaceholders(bodyHtml, ctx);
    }
  };
  ```
- `<div ref={setVisuellNode} contentEditable …>` benutzen.
- Bestehenden Sync-`useEffect` für spätere Updates (Vorlagenwechsel, ctx-Update) beibehalten — er greift dann nur noch bei tatsächlichen Änderungen.

## 3. Auto-Scroll beim Absenden zuverlässig

`scrollRef.current?.scrollTo(...)` existiert bereits in `handleSend`. Das `<DialogContent>` hat `overflow-y-auto`, also funktioniert es prinzipiell. Sicherstellen, dass der Scroll **vor** `setPhase("sending")` ausgeführt wird ist bereits der Fall — kein Bug erkennbar. Falls in der Praxis trotzdem nicht oben: zusätzlich nach `setPhase("sending")` per `requestAnimationFrame` erneut scrollen, damit das Overlay garantiert sichtbar landet:

```ts
setPhase("sending");
requestAnimationFrame(() => {
  scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
});
```

## Out of Scope
- Keine Backend-Änderungen.
- Kein Eingriff in `useBelegEditor`/PDF-Renderer — die Route bleibt erreichbar via Direkt-URL, der Button ist nur das UI-Gate.
- Anhang-PDF-Vorschau-Pfeil ist bereits implementiert (siehe `ChevronDown`-Toggle in `EmailVersandDialog`), keine Änderung nötig.

## Geänderte Dateien
- `src/routes/rechnungen.$id.tsx`
- `src/routes/angebote.$id.tsx`
- `src/components/email/EmailVersandDialog.tsx`
