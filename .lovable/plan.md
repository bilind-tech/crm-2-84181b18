## Plan: Handy-Scan muss sofort sichtbar und nachvollziehbar funktionieren

Ich ändere den bestehenden QR-Code-Handy-Scan-Flow so, dass nach der Foto-/Dateiauswahl auf dem Handy sofort klar sichtbar ist, was ausgewählt wurde, ob es gerade hochlädt, ob es gespeichert wurde und ob es am PC angekommen ist.

### 1. Handy-Seite `/m/upload/:session` stabilisieren
- Direkt nach Auswahl eines Fotos oder einer Datei wird eine große, eindeutige Vorschau angezeigt.
- Zusätzlich steht sichtbar darunter: „Ausgewählt“, „Wird hochgeladen“, „Gespeichert“ oder „Fehler“.
- Es gibt einen klar sichtbaren Button zum erneuten Auswählen bzw. weiteren Foto hinzufügen.
- Bei Fehlern wird die konkrete Fehlermeldung sichtbar angezeigt und ein „Erneut versuchen“-Button angeboten.
- Der erfolgreiche Upload bleibt sichtbar, statt dass der Nutzer das Gefühl hat, nichts sei passiert.

### 2. Upload nicht nur still im Hintergrund laufen lassen
- Der automatische Upload bleibt erhalten, aber die Oberfläche zeigt den Vorgang deutlich.
- Während des Uploads wird Fortschritt angezeigt.
- Nach Erfolg wird deutlich bestätigt: „Gespeichert und am PC sichtbar“.
- Falls das Backend nicht erreichbar ist oder die Session abgelaufen ist, erscheint eine klare Meldung statt einer scheinbar leeren Seite.

### 3. PC-Dialog „Vom Handy scannen“ zuverlässiger aktualisieren
- Der PC-Dialog pollt die Session bereits, wird aber so ergänzt, dass empfangene Dateien klarer sichtbar und gezählt werden.
- Nach neu empfangenem Upload werden auch die Dokumentenlisten invalidiert, damit das Dokument direkt im Dokumente-Bereich auftaucht.
- Der Wartestatus bleibt verständlich: erst „Warte auf Dateien“, danach „Datei empfangen“.

### 4. Backend-Session-Antwort als Quelle der Wahrheit nutzen
- Die mobile Seite fragt nach Upload-Erfolg die Session nochmal ab, damit sie wirklich weiß, dass das Dokument serverseitig gespeichert und in der Session gelandet ist.
- Dadurch wird nicht nur „XHR war erfolgreich“ angezeigt, sondern tatsächlich „im System angekommen“.

### 5. Technische Details
- Dateien: `src/routes/m.upload.$session.tsx`, `src/components/dokumente/HandyScanDialog.tsx`, ggf. `src/hooks/useApi.ts`.
- Kein automatischer E-Mail-Versand, kein Datenordner-Eingriff, kein Cloud-Deploy.
- Keine Änderung am Backup-/Restore-/Update-System.
- Keine neuen Rollen oder Benutzerlogik.

### Ergebnis
Nach dem QR-Scan sieht der Nutzer auf dem Handy sofort das ausgewählte Bild, den Upload-Status und die Erfolgsmeldung. Am PC erscheint der Upload im Scan-Dialog und danach in den Dokumenten, ohne dass man raten muss, ob etwas passiert ist.