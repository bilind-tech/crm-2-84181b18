## Ziel
Angebot und Rechnung sollen beim Klick auf „Neues Angebot“ / „Neue Rechnung“ nicht mehr in den globalen Fehlerbildschirm laufen. Kunden-Detailseiten bleiben unverändert, weil sie aktuell funktionieren.

## Was ich ändern werde

1. **Absturz beim Öffnen der Erstellen-Form isolieren**
   - Die betroffenen Stellen sind:
     - `src/routes/angebote.tsx`
     - `src/routes/rechnungen.tsx`
     - `src/components/forms/AngebotForm.tsx`
     - `src/components/forms/RechnungForm.tsx`
     - `src/components/forms/PositionenEditor.tsx`
   - Ich baue für Angebot/Rechnung eine eigene kleine Fehlergrenze ein, damit ein Form-Fehler nicht mehr die ganze App auf „Something went wrong“ wirft.

2. **Form-Initialisierung härten**
   - Die erste Position wird nicht mehr direkt während jedes Renderns erzeugt, sondern sauber über eine Lazy-Initialisierung.
   - Dadurch werden ID-/Browser-API-Probleme beim sofortigen Öffnen der Form vermieden.
   - `createClientId()` bleibt als sichere Lösung für lokale HTTP-/Pi-Umgebungen erhalten.

3. **Speichern von Angebot/Rechnung absichern**
   - `mutateAsync()` wird in `try/catch` gepackt.
   - Backend-Fehler zeigen dann einen normalen Toast statt die komplette App abstürzen zu lassen.
   - Dafür wird die vorhandene Fehlerübersetzung aus `piClient.ts` verwendet.

4. **Route-/Dialog-Variante vereinheitlichen**
   - Die Buttons oben rechts bleiben als schneller SlideOver-Dialog erhalten.
   - Die direkten Routen `/angebote/neu` und `/rechnungen/neu` bleiben ebenfalls funktionsfähig.
   - Beide nutzen dieselbe stabile Form-Logik.

5. **Prüfung nach Umsetzung**
   - Ich prüfe danach gezielt, dass keine Browser-`crypto.randomUUID()`-Nutzung im Frontend übrig ist.
   - Ich prüfe außerdem die betroffenen Dateien auf Build-/Syntax-Probleme.

6. **Pi-Update-Befehl korrigieren**
   - Der Pi muss den SPA-Build `npm run build:spa` ausliefern.
   - Das gebaute `dist-spa/` muss im Release als `/opt/mycleancenter/current/dist/` landen.
   - Ein normales `npm run build` erzeugt den falschen TanStack-Start-Build für den Pi und aktualisiert die sichtbare App nicht zuverlässig.

## Was du nach Freigabe bekommst
Nach Umsetzung gebe ich dir wieder den fertigen Pi-Update-Befehl mit deinem gemerkten öffentlichen Repo:

```bash
https://github.com/bilind-tech/remix-of-crm.git
```

Der Befehl wird wieder so aufgebaut, dass Code in `/opt/mycleancenter/current/` aktualisiert wird und deine Daten unter `/var/lib/mycleancenter/` nicht angefasst werden.