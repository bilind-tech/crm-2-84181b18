## Ziel

Alle 22 hässlichen, nativen Browser-Dropdowns (`<select>`) durch unsere themisierte shadcn-Select-Komponente ersetzen. Diese hat bereits eine kurze, saubere Slide-from-Top + Fade-Animation (Radix `data-[state=open]:animate-in slide-in-from-top-2`, ~150ms) und sieht auf Desktop wie Mobile identisch zum Rest der App aus.

## Betroffene Dateien (14)

| Datei | Anzahl Selects | Inhalt |
|---|---|---|
| `src/components/forms/KundeForm.tsx` | 3 | Anrede, Land, Typ |
| `src/components/forms/ObjektForm.tsx` | 3 | Typ, Status, Kunde |
| `src/components/forms/BelegForm.tsx` | 3 | Kunde, Objekt, Position-Einheit |
| `src/components/forms/DauerauftragForm.tsx` | 4 | Kunde, Objekt, Frequenz, Wochentag |
| `src/components/forms/AngebotForm.tsx` | 2 | Kunde, Objekt |
| `src/components/forms/RechnungForm.tsx` | 2 | Kunde, Objekt |
| `src/components/forms/PositionenEditor.tsx` | 1 | Einheit (Stk/h/m²/…) |
| `src/components/forms/ZahlungErfassenDialog.tsx` | 1 | Zahlungs­methode |
| `src/components/forms/AnsprechpartnerPicker.tsx` | 1 | Rolle |
| `src/components/einstellungen/DauerauftragTab.tsx` | 1 | Standard-Frequenz |
| `src/routes/kunden.neu.tsx` | 1 | Typ |

## Vorgehen pro Stelle

Ersetze:
```tsx
<select className="…" value={x} onChange={(e) => setX(e.target.value)}>
  <option value="a">A</option>
  <option value="b">B</option>
</select>
```

Durch:
```tsx
<Select value={x} onValueChange={(v) => setX(v as Typ)}>
  <SelectTrigger><SelectValue placeholder="Wählen …" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="a">A</SelectItem>
    <SelectItem value="b">B</SelectItem>
  </SelectContent>
</Select>
```

Importe: `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` aus `@/components/ui/select` (in fast allen Form-Dateien bereits vorhanden – nur ergänzen falls nicht).

## Sonderfälle

- **Leerer Wert** (z. B. „kein Objekt"): Radix-Select erlaubt kein `value=""`. Lösung wie in `CsvImportDialog`: Sentinel `"__none__"` als Wert, beim Lesen/Schreiben in `""` bzw. `undefined` umrechnen.
- **Native `<option disabled>` Platzhalter**: ersetzen durch `<SelectValue placeholder="…" />`.
- **Mobile**: Radix-Popover schließt bei Outside-Tap; Touch-Target der Items ist bereits ≥40 px (siehe `select.tsx`).

## Animation

Bereits in `src/components/ui/select.tsx` definiert – kein Eingriff nötig:
- Öffnen: `fade-in-0 zoom-in-95 slide-in-from-top-2` (~150 ms ease-out)
- Schließen: spiegelbildlich
- Origin liegt am Trigger, sodass sich das Menü visuell „aus dem Feld nach unten ausklappt".

## Nicht im Scope

- Native `<input type="date">`, Checkbox-Listen oder Radio-Gruppen (sind keine Dropdowns).
- DropdownMenu im Header / 3-Punkte-Menüs (verwenden bereits shadcn).

## Ergebnis

Nach Umsetzung gibt es kein einziges natives `<select>` mehr im Code – verifizierbar via `rg "<select" src/` → keine Treffer. Alle Auswahl-Listen haben dasselbe Look-and-Feel wie z. B. der Spalten-Mapping-Dialog beim CSV-Import: gerundete Border, Hintergrund `bg-popover`, sanfte Slide-Down-Animation beim Öffnen.

Sag „los" und ich tausche alle 22 Stellen aus.