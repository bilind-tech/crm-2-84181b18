## Bug
`backend/src/email/transport.ts` → `readSmtpPassword()` gibt das gespeicherte Passwort **mit umschließenden JSON-Anführungszeichen** an nodemailer weiter. Folge: Strato lehnt die Anmeldung ab („Benutzername oder Passwort falsch"), obwohl das Passwort korrekt eingegeben wurde.

Ursache: `setSetting()` macht immer `JSON.stringify(value)`. Beim Speichern eines Strings `geheim!` landet `"geheim!"` (inkl. Quotes) verschlüsselt in der DB. Die Decode-Logik prüft auf `{password: ...}`-Objekt, fällt bei String-Werten aber auf das **rohe JSON** mit Quotes zurück, statt es als String zu unwrappen.

## Fix (eine Datei)

`backend/src/email/transport.ts` — `readSmtpPassword()`:

```ts
function readSmtpPassword(): string | null {
  const row = getDatabase()
    .prepare(`SELECT value, encrypted FROM setting WHERE key = ?`)
    .get(SENSITIVE_KEYS.smtpPassword) as { value: string; encrypted: number } | undefined;
  if (!row) return null;
  const raw = row.encrypted ? decryptString(row.value) : row.value;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;          // ← neuer Fall
    if (parsed && typeof parsed.password === "string") return parsed.password;
    return raw;
  } catch {
    return raw;
  }
}
```

Damit wird ein als String gespeichertes Passwort sauber unwrapped, ein historisch evtl. als Objekt gespeichertes weiter unterstützt, und unverschlüsselte/Plain-Werte funktionieren wie bisher.

## Was du danach machen musst

1. Update auf Pi installieren (gleicher Update-Befehl wie zuletzt — keine Daten betroffen, nur Backend-Code).
2. **Passwort in Einstellungen → E-Mail einmal neu eingeben und speichern** (das alte Passwort ist mit dem Fehler gespeichert worden — es wird nach dem Fix zwar korrekt gelesen, ist aber inhaltlich identisch zur Eingabe; ein erneutes Speichern ist nicht zwingend nötig, schadet aber nicht).
3. „Verbindung prüfen" → muss jetzt grün werden.

## Was NICHT geändert wird

- Kein Daten-Migrations-Skript (nicht nötig — Lese-Pfad ist defensiv).
- Keine Frontend-Änderung.
- Keine anderen Settings-Bereiche (Google Drive Tokens, GitHub Token) — die haben dasselbe Schema, sind aber tatsächlich Objekte und betroffen nur, falls jemand einen reinen String reinspeichert.

## Test (ich führe nach Implementierung selbst aus)

`backend/test` enthält schon Vitest-Setup. Ich ergänze einen Mini-Test, der `setSetting` + `readSmtpPassword` Round-trip durchspielt mit einem Passwort, das Sonderzeichen enthält (`Ä!"§$%&/()=?`), und sicherstellt, dass keine Quotes übrig bleiben.
