Ich habe die betroffenen Stellen geprüft. Die wahrscheinlichste Ursache ist nicht dein Internet allein, sondern ein technischer Fehler in unserer Pi-Konfiguration:

- Der Dienst läuft als `NODE_ENV=production`.
- Das Login-Cookie wird dadurch aktuell als `Secure` gesetzt.
- Du greifst aber im LAN per `http://IP:8787` zu, nicht per HTTPS.
- Browser speichern/senden `Secure`-Cookies über HTTP nicht zuverlässig bzw. gar nicht.
- Ergebnis: Du bist scheinbar eingeloggt, aber viele API-Aufrufe bekommen kein Cookie und das Backend antwortet mit `{"error":"unauthenticated"}`. Dann bleiben Einstellungsbereiche leer, z. B. Firmendaten, Google Drive, Backup, Sicherheit oder Kundenerstellung.

Dazu kommt: In der systemd-Unit steht CORS noch fest auf `http://mycleancenter.local:8787`, obwohl du `.local` aufgegeben hast und per IP arbeitest. Das macht Zugriffe über IP zusätzlich fragil.

Plan zur dauerhaften Reparatur:

1. Login-Cookie für lokalen LAN-Betrieb reparieren
   - Cookie bleibt `HttpOnly` und sicher gegen JavaScript-Zugriff.
   - `secure` wird nicht mehr blind von `NODE_ENV=production` abhängig gemacht.
   - Für normalen Pi-Betrieb über `http://IP:8787` wird das Cookie ohne `Secure` gesetzt.
   - Falls später HTTPS aktiviert wird, kann `Secure` über eine explizite Umgebungsvariable wieder eingeschaltet werden.

2. CORS/Origin für IP-Zugriff robust machen
   - Die systemd-Unit wird so angepasst, dass der ausgelieferte Frontend-Origin über IP/Hostname im LAN funktioniert.
   - Da Frontend und Backend auf demselben Port laufen, ist Same-Origin der Normalfall. Wir entfernen die harte Bindung an `mycleancenter.local` als einzige erlaubte Origin.
   - Ziel: Zugriff per `http://<pi-ip>:8787` soll zuverlässig funktionieren, ohne `.local`.

3. API-Client verbessert Auth-Fehler sichtbar statt leerer Inhalte
   - Wenn ein API-Aufruf `401 unauthenticated` zurückbekommt, soll die App nicht einfach leere Tabs zeigen.
   - Die App aktualisiert den Auth-Status und zeigt wieder den LockScreen/Login, statt dass einzelne Einstellungsbereiche scheinbar „nicht öffnen“.
   - Dadurch merkst du sofort: neu anmelden nötig — kein kaputtes UI.

4. Einstellungsseite bekommt Lade-/Fehlerzustände
   - Firmendaten und andere Tabs sollen nicht einfach verschwinden, wenn Daten noch laden oder ein Fehler kommt.
   - Für Firmendaten ergänze ich mindestens einen klaren Ladezustand und eine Fehlermeldung mit Hinweis auf Backend/Auth.
   - Für die wichtigsten System-Tabs wird geprüft, ob ähnliche leere Zustände entstehen und dort ebenfalls eine klare Meldung ergänzt.

5. Deploy-Skript hält die Korrektur dauerhaft
   - `install.sh` installiert die korrigierte systemd-Unit.
   - Der alte kaputte mDNS-Alias-Dienst bleibt deaktiviert/entfernt.
   - Beim nächsten Release wird die Cookie/CORS-Reparatur automatisch übernommen.

6. Danach gebe ich dir einen kurzen Terminal-Befehl
   - Du musst nicht selbst debuggen.
   - Ich gebe dir danach exakt die Befehle, die du auf dem Pi einfügen kannst.
   - Wichtig: Das CRM startet beim Installieren kurz neu; das ist normal und sollte nur wenige Sekunden dauern. Deine Daten bleiben unangetastet, vorher läuft wie vorgesehen ein Sicherheitsbackup.

Technische Dateien, die ich ändern werde:

- `backend/src/auth/middleware.ts`
  - Cookie-Optionen für lokalen HTTP-Betrieb korrigieren.

- `backend/src/config.ts`
  - explizite Konfiguration für sichere Cookies ergänzen, statt `NODE_ENV` dafür zu missbrauchen.

- `backend/deploy/systemd/mycleancenter.service`
  - `.local` nicht mehr als einzige CORS-/OAuth-Annahme erzwingen.

- `src/lib/auth.tsx` und/oder `src/lib/api/piClient.ts`
  - globale Reaktion auf `401 unauthenticated`, damit die App sauber zurück zum LockScreen geht.

- `src/routes/einstellungen.tsx` und ggf. wichtige Einstellungs-Tab-Komponenten
  - leere Tabs durch Lade-/Fehlerzustände ersetzen.

Erwartetes Ergebnis:

- Zugriff per IP wird stabiler.
- Login bleibt nach dem Entsperren erhalten.
- Firmendaten, Google Drive, Backup, Sicherheit usw. laden wieder statt leer zu bleiben.
- `{"error":"unauthenticated"}` soll nicht mehr plötzlich als nackte Browserseite erscheinen, außer du rufst absichtlich direkt eine geschützte API-URL auf.
- `.local` ist nicht mehr Voraussetzung für den Stundenzettel oder das CRM.