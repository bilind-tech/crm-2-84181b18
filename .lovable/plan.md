## Quick-Create-Dialog: Icon & Gradient entfernen

Drei kleine Änderungen, eine Datei + ein Memory.

### 1) `src/components/layout/QuickCreate.tsx`
- `Sparkles`-Icon und das umgebende Icon-Badge neben „Schnell anlegen" komplett entfernen
- Header wird wieder schlicht: nur Titel + Beschreibung darunter, linksbündig
- `Sparkles`-Import entfernen
- Hintergrund-Gradient `bg-gradient-to-br from-background via-background to-accent/30` ersetzen durch einfaches `bg-background` — keine Verläufe mehr
- Mittige Zentrierung bleibt unverändert (wird über `quick-create-dialog`-Klasse in `styles.css` erzwungen)

### 2) Memory anlegen: `mem://design/no-decorative-icons.md`
Damit dieser Fehler nie wieder passiert:
- Keine Sparkles/Sterne/Glitzer-Icons als Deko — nirgendwo
- Keine dekorativen Icons neben Dialog-Titeln, nur funktionale Icons in Buttons/Items
- Keine Hintergrund-Gradients in Dialogen — einfacher `bg-background`
- Inhalt muss exakt mittig zentriert sein

### 3) `mem://index.md` aktualisieren
Neue Zeile in „Memories" mit Verweis auf die neue Regel.

Sag „los".