## Frontend-Feinschliff — Phase 1

Drei kleine, klar abgegrenzte UI-Korrekturen. Kein Backend, keine Logikänderungen.

### 1) Lock-Screen: „Master-Passwort" → „Passwort"
Datei: `src/components/layout/LockScreen.tsx`
- Label „Master-Passwort" → „Passwort"
- Beschreibungstext „Bitte gib dein Master-Passwort ein, um zu entsperren." → „Bitte gib dein Passwort ein, um zu entsperren."

### 2) Breadcrumb-Pfad komplett entfernen
Aktuell rendert `PageHeader` oben einen Pfad (Home-Icon › Bereich › Unterseite). Den nehmen wir ersatzlos raus — auf allen Seiten gleichzeitig, weil zentral.

Datei: `src/components/layout/PageHeader.tsx`
- `<nav>`-Block mit Home-Icon und Crumbs entfernen
- Imports `Link`, `Home`, `ChevronRight` entfernen
- `breadcrumb`-Prop wird zur No-Op (bleibt optional für Rückwärtskompatibilität, wird aber nicht mehr gerendert) — so müssen die ~10 Routen-Dateien nicht angefasst werden
- Der `<h1>`-Titel + optionaler `subtitle` + `actions` bleiben unverändert

Ergebnis: Saubere Seitenüberschriften ohne den Pfad darüber.

### 3) „Neu"-Dialog (Quick Create) modernisieren
Datei: `src/components/layout/QuickCreate.tsx` (+ ggf. kleine Anpassungen am Dialog-Container)

Probleme aktuell:
- Dialog wirkt nicht zentriert/zu breit/flach
- Karten sind funktional, aber visuell unspektakulär
- Default-`DialogContent` hat scharfe Ecken auf Mobile, kein Premium-Look

Neue Gestaltung:
- Echtes Mittig-Zentrieren, max. Breite 640px, großzügige Innenabstände
- Weicher Hintergrund mit dezentem Gradient (passend zu LockScreen-Stil), `rounded-2xl`, stärkerer Schatten, feiner Border
- Header: größerer Titel + dezenter Untertitel, passendes Icon links neben dem Titel
- Karten-Grid: 2 Spalten auf Mobile, 3 auf ≥sm; Karten mit:
  - Größerem, farbig getöntem Icon-Badge (rounded-xl, sanfter Gradient pro Kategorie oder einheitliches Primary-Tint)
  - Titel fett, Beschreibung darunter
  - Hover: leichter Lift (translate-y), Border wechselt zu Primary, sanftes Glow
  - Tastatur-Fokus sauber sichtbar
- Schließen-Button (X) bleibt oben rechts, aber dezenter integriert
- Sanfte Stagger-Animation der Karten beim Öffnen (motion-safe, schnell — keine Spielerei)

Inhalte/Routen bleiben identisch (Kunde, Objekt, Angebot, Rechnung, Dokument).

### Was NICHT in dieser Phase passiert
- Keine Backend-Arbeit
- Keine Änderung an Routen, Datenmodellen, Formularen
- Keine globalen Theme-Änderungen — nur die drei genannten Komponenten

### Technische Details
- `PageHeader`-Prop `breadcrumb` bleibt im Type-Signatur (optional/no-op), damit keine TS-Fehler in den Routen entstehen
- Quick-Create nutzt weiterhin `Dialog` aus `@/components/ui/dialog`; Custom-Klasse `quick-create-dialog` ist in `styles.css` bereits vorhanden und kann für Override genutzt werden (wird ggf. erweitert)
- Animationen via Tailwind + bestehenden `motion-safe:animate-*`-Utilities, keine neue Library

Sag „los", dann setze ich die drei Änderungen um.