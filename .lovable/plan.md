## Problem

Auf der Handy-Upload-Seite (`/m/upload/:session`) reagieren die beiden Buttons „Foto aufnehmen" und „Aus Galerie / Dateien" nicht beim Antippen.

Ursache: Aktuell wird ein versteckter `<input type="file" class="sr-only">` per `inputRef.current?.click()` aus dem Button-`onClick` ausgelöst. Auf iOS-Safari (und teils Android-Chrome) wird dieser programmatische Klick nicht zuverlässig als „User Gesture" akzeptiert — der Datei-Picker öffnet sich nicht. Zusätzlich blockiert iOS den `<input multiple capture="environment">` ganz, weil Kamera + multiple inkompatibel sind.

Der Stapel + Senden-Logik selbst funktionieren bereits — sobald Dateien drin sind, lädt „Alle senden" sie zum PC, der PC zeigt sie sofort. Es fehlt nur das Öffnen des Pickers.

## Fix

Datei `src/routes/m.upload.$session.tsx`:

1. Neue interne Komponente `FileButton` — ein optisch identischer Premium-Blue-Button, der das `<input type="file">` als unsichtbares Overlay (absolut positioniert, `opacity-0`, `inset-0`) ÜBER der Button-Optik liegt. Der Tap geht direkt auf den nativen Input → iOS akzeptiert das immer als User Gesture.
2. Refs (`cameraRef`, `pickerRef`) und programmatische `.click()`-Aufrufe entfernen.
3. Beim Kamera-Button `multiple` weglassen (iOS-Inkompatibilität); beim Galerie-Button bleibt `multiple`.
4. Ein gemeinsamer `onPick`-Handler statt zwei separaten.
5. „Alle senden"-Button bleibt ein normaler `<button>` (kein File-Input nötig), wird inline gestylt damit `PrimaryAction` nicht mehr nötig ist und die Datei in sich konsistent bleibt.

Keine anderen Dateien betroffen. Backend, Upload-Funktion, Stapel-Logik, Token-Session bleiben unverändert.

## Erwartetes Verhalten danach

- Tap auf „Foto aufnehmen" → Kamera öffnet sich (iOS/Android).
- Tap auf „Aus Galerie / Dateien" → Foto-/Datei-Picker öffnet sich, Mehrfachauswahl möglich.
- Ausgewählte Dateien erscheinen als Vorschau-Grid auf dem Handy.
- Erst nach Tap auf „Alle senden (N)" werden sie zum PC geschickt; auf dem PC erscheinen sie automatisch in der Dokumentenliste, wo der User Titel/Kunde/Objekt nachträglich zuweisen kann.
