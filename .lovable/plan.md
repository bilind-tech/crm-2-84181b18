## Step 9 — Frontend-Anbindung System-Update + Polishing

Step 8 hat das Backend (Pipeline, Manifest, Lock, Rollback) fertig. Im Frontend zeigt der Tab „System & Updates" aber noch zwei Lücken:

1. `useValidateUpdate` schickt nur `{ fileName, sizeBytes }` als JSON — das echte Backend erwartet aber `multipart/form-data` mit `field=paket` und der ZIP-Datei. Heute funktioniert das nur gegen Mock.
2. SSE invalidiert zwar Queries, aber der Lauf-Dialog pollt weiter alle 3 s und der UX-Hinweis „live aktualisiert" fehlt. Außerdem sind Fehlerfälle wie 429-Lockout nach 3 falschen Rollback-Passwörtern und 409 „Update läuft bereits" nicht freundlich behandelt.

Das hier räumt beides auf, ohne den Tab visuell umzuwerfen — ein paar Hooks, der Multipart-Pfad, ein SystemInfo-Adapter und kleinere UI-Korrekturen.

### Was geändert wird

**1. Multipart-Upload für `useValidateUpdate`**
- `src/hooks/useApi.ts`: Hook auf `FormData` umstellen (Feldname `paket`, analog zu `useUploadBackup` mit `file`). Direkt über `piApi.post` schicken, damit der Mock nicht mehr getriggert wird, wenn eine Pi-URL konfiguriert ist.
- Mock-Backend in `src/lib/mock/backend.ts`: `/system/update/validate` akzeptiert jetzt sowohl JSON-Body (alter Pfad) als auch FormData (neuer Pfad) — wir lesen `file.name` + `file.size` raus, damit Mock-Demo weiterläuft.
- Fehlerfälle aus dem Backend (`ManifestError`, `ZipError`, 413 zu groß, 401, 409) werden in der Mutation in `toast.error` mit klarem Text gemappt, statt rohen Fehler-JSON zu zeigen.

**2. SystemInfo-Adapter**
- Backend liefert `{ appName, version, installedAt, node, sqlite, hardware }` — Frontend-Typ erwartet exakt das (passt). Adapter prüft nur, ob `installedAt` ISO ist (Backend liefert evtl. SQLite-Format `YYYY-MM-DD HH:MM:SS`). Falls nicht, in `adapters.ts` mit `toIsoDateTime` (existiert bereits) konvertieren.
- Hook `useSystemInfo` ruft den Adapter, damit `formatDateTime` nicht „Invalid Date" zeigt.

**3. SSE-getriebener Live-Lauf**
- `useUpdateLauf`: Polling-Intervall von 3 s auf 10 s erhöhen, weil SSE ohnehin invalidet. Bleibt als Sicherheitsnetz, falls SSE wegbricht.
- `useLiveEvents.ts`: Bei `system:update:phase` keine Toast-Spam — nur Query-Invalidate. Toast nur bei `system:update:lauf` mit Endstatus (ist heute schon so).
- `UpdateProgressDialog`: kleiner Live-Indikator („● Live") oben rechts wenn SSE verbunden — wir lesen `useSseConnected()` (siehe Step 7). Falls die Hilfsfunktion nicht existiert, kleiner Helfer in `src/lib/api/sse.ts` ergänzen, der den letzten Heartbeat zurückgibt; fällt dezent in „Aktualisierung in Kürze" um, wenn SSE down.

**4. Rollback-Lockout-UX**
- `RollbackConfirmDialog`: bei 401 zählen wir die Versuche im lokalen State (1/3, 2/3, 3/3) und zeigen einen sanften Hinweis. Bei 429 vom Backend zeigen wir die Sperrzeit aus der Fehlermeldung und deaktivieren den Submit-Button für die Restdauer (Countdown).
- `useRollbackUpdate`: Fehler durchreichen statt schlucken; im Tab den Lockout-Status global vorhalten, damit beim erneuten Öffnen der Dialog noch gesperrt bleibt.

**5. „Update läuft bereits" beim Tab-Öffnen**
- Beim Mount des Tabs: einmaliger `GET /system/update/lauf/aktuell`. Bei 200 (statt 204) → `setActiveLaufId(...)` und Dialog automatisch öffnen, damit ein User, der die Seite während eines laufenden Updates neu lädt, den Fortschritt weiter sieht.
- Hook dafür: `useAktuellerUpdateLauf()` mit `staleTime: 0` und nur einmal beim Mount aktiv.

**6. Tab-Cleanup**
- Den großen FRONTEND-STUB-Header-Kommentar oben in `SystemUpdateTab.tsx` entfernen — Backend ist da, Hinweise stimmen nicht mehr. Stattdessen kurzer Header-Kommentar, was der Tab tut.
- Dead-State `RotateCcw rollbackPending` greift heute nicht mehr, weil der Dialog schließt vor Rückmeldung — auf den globalen `rollback.isPending` umschwenken.

**7. Tests**
- `backend/test/system-update.spec.ts` ist grün. Frontend-Smoke nicht nötig — UI-Komponenten ohne eigene Logic.

### Technische Details

**Multipart-Mutation:**
```ts
mutationFn: async (file: File) => {
  const fd = new FormData();
  fd.append("paket", file, file.name);
  return piApi.post<UpdatePackageInfo>("/system/update/validate", fd);
}
```

**Mock-Anpassung:**
Der Mock-Handler bekommt einen Type-Check: `body instanceof FormData` → `file = body.get("paket") as File`, sonst altes JSON-Verhalten.

**SystemInfo-Adapter:**
```ts
function adaptSystemInfo(s: SystemInfo): SystemInfo {
  return { ...s, installedAt: toIsoDateTime(s.installedAt) };
}
```

**Aktueller-Lauf-Hook:**
```ts
const { data } = useQuery({
  queryKey: ["system","update","lauf","aktuell"],
  queryFn: () => api.get<UpdateLauf | null>("/system/update/lauf/aktuell").catch(() => null),
  staleTime: 0,
  refetchOnMount: "always",
});
useEffect(() => { if (data?.id && !activeLaufId) setActiveLaufId(data.id); }, [data]);
```

**Lockout-Countdown:**
Aus 429-Body `until` parsen (Backend liefert ISO im Fehlertext) — wenn nicht parsebar, pauschal 15 min anzeigen.

### Dateien

- edited `src/hooks/useApi.ts` — Multipart, neuer `useAktuellerUpdateLauf`, längeres Polling, SystemInfo-Adapter
- edited `src/lib/mock/backend.ts` — FormData-Toleranz für `/system/update/validate`
- edited `src/lib/api/adapters.ts` — `adaptSystemInfo` ergänzen
- edited `src/components/einstellungen/SystemUpdateTab.tsx` — Stub-Header weg, Auto-Open laufender Lauf, Lockout-State, „Live"-Indikator
- edited `src/components/einstellungen/RollbackConfirmDialog.tsx` — Fehlversuche-Hinweis, 429-Sperre mit Countdown
- edited `src/hooks/useLiveEvents.ts` — keine Phase-Toasts (nur Lauf-End-Toasts behalten)
- edited `src/lib/api/sse.ts` — kleiner `isSseConnected()`-Export, falls noch nicht da
- edited `mem/features/system-update.md` — Status „Frontend angebunden, Multipart, SSE Live-Indikator"

Sag „weiter", dann setze ich Step 9 um.
