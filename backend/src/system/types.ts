// Backend-interne System-Update-Typen. Spiegelt im Frontend src/lib/api/types.ts
// die Felder UpdateLauf/UpdateStepStatus, mappt aber 1:1 in adapters.ts wieder
// in die Frontend-Form.

export type UpdateStepId =
  | "entpacken"
  | "backup"
  | "quarantaene"
  | "install"
  | "migrations"
  | "neustart"
  | "smoketest"
  | "rollback";

export type UpdateStepStatus = "wartet" | "laeuft" | "ok" | "fehler" | "uebersprungen";

export interface UpdateStep {
  id: string;
  laufId: string;
  stepId: UpdateStepId;
  label: string;
  status: UpdateStepStatus;
  reihenfolge: number;
  gestartetAm: string | null;
  beendetAm: string | null;
  detail: string | null;
  fehlerText: string | null;
}

export interface UpdateLauf {
  id: string;
  gestartetAm: string;
  beendetAm: string | null;
  quelle: "upload" | "rollback";
  paketVersion: string;
  paketSha256: string;
  paketGroesse: number;
  vorherigeVersion: string;
  neueVersion: string;
  status: "laeuft" | "erfolg" | "fehler" | "rollback";
  aktuellerStep: string;
  fehlerText: string | null;
  userId: string | null;
  safetyBackupId: string | null;
  steps: UpdateStep[];
}

/** Manifest-Datei im Update-ZIP. */
export interface UpdateManifest {
  appVersion: string;          // semver "0.3.0"
  schemaVersion: number;       // muss >= aktuell
  createdAt: string;           // ISO
  minBackendVersion: string;   // semver, gegen die laufende Version geprüft
  signature: string;           // HMAC-SHA256 hex über payload
  hinweise?: string;
}

export interface SystemInfoOut {
  appName: string;
  version: string;
  installedAt: string;
  node: string;
  sqlite: string;
  hardware: string;
}
