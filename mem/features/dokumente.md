---
name: Dokumente & Upload-Sessions
description: Backend-Persistenz für Dokumente (SSD-Storage, Dedup via SHA256, Soft-Delete) + Token-basierte Handy-Scan-Sessions + Frist-Cron
type: feature
---

# Dokumente Backend (Step 12a)

## Storage
- Dateien auf USB-SSD: `$DATA_DIR/uploads/dokumente/{YYYY}/{MM}/{sha[0:2]}/{sha}.{ext}` (mode 0600).
- Dedup über `sha256` UNIQUE-Logik im Repo (`refsForSha`); identische Datei = nur DB-Zeile, kein zweites Schreiben.
- Soft-Delete (`geloescht_am`); Datei wird sofort entfernt wenn keine andere aktive Zeile sie referenziert.

## Routen
- `GET/POST /dokumente`, `GET /dokumente/:id`, `GET /dokumente/:id/datei` (Stream), `PATCH`, `POST /:id/erledigt`, `DELETE`, `POST /dokumente/check-fristen`.
- Multipart-Upload via `@fastify/multipart`. Felder: `file` (Datei) + `meta` (JSON-String mit Titel/Typ/Frist/Steuerflags).
- MIME-Whitelist: `image/*` + `application/pdf`. Limit 20 MB (`MAX_UPLOAD_BYTES`).

## Upload-Sessions (Handy-Scan)
- `POST /upload-sessions` (Auth) → 32-Byte base64url Token, 60 min TTL.
- `GET /upload-sessions/:token` + `POST /upload-sessions/:token/dokumente` ohne Auth (Token = Capability).
- Rate-Limit: 10 Uploads/min pro Token.
- `POST /upload-sessions/:id/beenden` (Auth) blockiert weitere Uploads (410).
- Sweep löscht abgelaufene Sessions täglich (>1 Tag alt).

## Frist-Cron
- `backend/src/dokumente/fristen-cron.ts`: täglich nach 07:00 Pi-Zeit; erzeugt Benachrichtigungen für `bald|heute|ueberfaellig`.
- Dedup pro `(dokument_id, tag, status)` via `dokumente_frist_benachrichtigung_log`.

## Frontend-Integration (offen, kommt in Step 12b)
- `src/lib/dokument/upload.ts` muss von base64-DataURL auf FormData/Blob umgestellt werden.
- `DokumentViewer` muss Datei via Blob-URL aus `/dokumente/:id/datei` laden (Auth-Cookie).
- `src/routes/m.upload.$session.tsx` muss `GET /upload-sessions/:token` + `POST .../dokumente` nutzen.
- Mock-Backend (`src/lib/mock/backend.ts`) braucht Multipart-/Sessions-Stub.
