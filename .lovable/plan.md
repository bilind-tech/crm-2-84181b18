## Ziel
Die Kunden-Detailseite muss zuverlässig funktionieren:
- Klick auf einen Kunden öffnet die React-Detailseite, kein „Something went wrong“.
- Browser-Neuladen auf `/kunden/<id>` zeigt weiterhin die App, nicht rohen JSON-Text.
- Auch wenn das Backend noch eine ältere Antwort ohne `angebote`, `rechnungen`, `dokumente` liefert, darf die Seite nicht abstürzen.

## Sicher erkannte Hauptursache
Es gibt zwei getrennte Probleme, die zusammen wie ein einziger Fehler wirken:

1. **Routing-Konflikt auf dem Pi**
   - Das Backend hat echte API-Routen wie `GET /kunden/:id`.
   - Die React-App hat gleichzeitig eine Frontend-Seite `/kunden/$id`.
   - Beim normalen Browser-Reload auf `/kunden/3b288...` fragt der Browser direkt das Backend nach HTML.
   - Fastify findet aber zuerst die API-Route `/kunden/:id` und liefert JSON zurück.
   - Deshalb siehst du oben links den rohen JSON-Text.

2. **Detailseite war/ist zu fragil gegen alte Backend-Antworten**
   - Die Kunden-Seite erwartet Listen wie `angebote`, `rechnungen`, `dokumente`.
   - Deine aktuell sichtbare Antwort enthält nur `ansprechpartner` und `objekte`.
   - Wenn eine noch nicht aktualisierte Frontend-Version darauf zugreift, crasht sie.

## Plan zur endgültigen Reparatur

### 1. Backend: direkte Seitenaufrufe von API-Antworten trennen
Ich baue im Pi-Backend eine klare HTML-Erkennung ein:

- Wenn ein Browser eine Seite direkt öffnet oder neu lädt, z. B.:
  - `/kunden/3b288d39-2652-4556-a068-fe6045ee7f75`
  - `/angebote/<id>`
  - `/rechnungen/<id>`
  - `/objekte/<id>`
  - `/protokolle/<id>`
- und der Request HTML erwartet (`Accept: text/html`), dann liefert das Backend **immer `index.html` der React-App** aus.
- API-Aufrufe aus der App bekommen weiter JSON.

Damit verschwindet der rohe JSON-Text beim Reload dauerhaft.

### 2. Frontend-API-Client: JSON explizit anfordern
Im zentralen API-Client setze ich für alle normalen API-Aufrufe:

```text
Accept: application/json
```

Dadurch kann das Backend sicher unterscheiden:

```text
Browser-Seitenaufruf -> HTML-App
App-API-Aufruf       -> JSON-Daten
```

Das macht die Lösung stabiler als nur auf Zufall/Browser-Defaults zu vertrauen.

### 3. Kunden-Detailseite noch robuster machen
Die Datei `src/routes/kunden.$id.tsx` ist bereits teilweise abgesichert, aber ich würde sie vollständig härten:

- `tags` defensiv behandeln: `Array.isArray(k.tags) ? k.tags : []`
- `ansprechpartner`, `objekte`, `angebote`, `rechnungen`, `dokumente`, `notizen` immer als Arrays normalisieren.
- `notizen` korrekt gegen Backend-Feldnamen absichern:
  - Backend liefert aktuell Notizen als `{ text, erstelltAm }`.
  - Frontend-Typ erwartet teils `{ titel, inhalt }`.
  - Anzeige soll daher nicht mehr mit `n.titel` / `n.inhalt` blind rendern, sondern robust `n.text` bzw. Fallbacks verwenden.
- Bei fehlerhaften Einzeldaten in Listen soll die ganze Kundenseite nicht abstürzen.

### 4. Backend-Kundenantwort vollständig machen
`GET /kunden/:id` bleibt additiv erweitert und liefert vollständig:

```text
kunde
ansprechpartner[]
objekte[]
angebote[]
rechnungen[]
dokumente[]
notizen[]
```

Das ist die saubere Datenbasis für die Detailseite. Gleichzeitig bleibt das Frontend kompatibel mit alten Antworten, falls der Pi noch nicht aktualisiert ist.

### 5. Tests gegen genau diesen Fehler ergänzen
Ich ergänze Backend-Tests, die den realen Fehler absichern:

- `GET /kunden/<id>` mit `Accept: application/json` liefert JSON-Kundendaten.
- `GET /kunden/<id>` mit `Accept: text/html` liefert HTML/`index.html`.
- Nicht-HTML-API-Fehler bleiben weiterhin JSON und werden nicht fälschlich zur App umgeleitet.

Damit kommt dieser konkrete Fehler nicht wieder zurück.

### 6. Update-Prozess mit berücksichtigen
Weil deine Pi-Installation zuletzt beim Update an `/opt/mycleancenter/staging/...` gescheitert ist, ist wichtig:

- Die Codeänderung behebt den Seiten-/Routingfehler dauerhaft.
- Damit sie auf deinem Pi ankommt, muss der Update-Mechanismus einmal sauber laufen.
- Falls der aktuelle Pi-Service noch keine Schreibrechte auf `/opt/mycleancenter/staging` hat, braucht es einmalig die Reparatur der Update-Verzeichnisse/Service-Rechte; danach soll „Jetzt aktualisieren“ wieder mit einem Klick funktionieren.

## Ergebnis nach Umsetzung
Nach der Umsetzung gilt:

```text
Kundenliste -> Kunde anklicken -> Detailseite öffnet
Reload auf /kunden/<id> -> React-App bleibt sichtbar
API /kunden/<id> -> liefert weiterhin JSON für die App
Alte/teilweise Backend-Antwort -> kein Frontend-Crash
```

Das ist die richtige, dauerhafte Lösung, weil sie nicht nur den sichtbaren Crash kaschiert, sondern den grundlegenden Konflikt zwischen Backend-API-Pfaden und React-Seitenrouting behebt.