export type BackupCategory =
  | "daily"
  | "weekly"
  | "monthly"
  | "manual"
  | "pre-restore"
  | "pre-update";

export type BackupTrigger = "auto" | "manual" | "pre-restore" | "pre-update";

export type BackupStatus = "in_progress" | "success" | "failed";

export type DriveMirrorStatus = "skip" | "pending" | "synced" | "error";

export interface BackupRow {
  id: string;
  filename: string;
  category: BackupCategory;
  trigger: BackupTrigger;
  sizeBytes: number;
  status: BackupStatus;
  startedAt: string;
  completedAt: string | null;
  sha256: string | null;
  schemaVersion: number | null;
  appVersion: string | null;
  error: string | null;
  driveStatus: DriveMirrorStatus;
  driveFileId: string | null;
  driveError: string | null;
  driveSyncedAt: string | null;
}

export interface BackupManifest {
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  type: BackupCategory;
  trigger: BackupTrigger;
  dbSha256: string;
  includedDirs: string[];
  sizes: { dbBytes: number; uploadsBytes: number };
}

export type BackupPhase =
  | "queued"
  | "snapshot-db"
  | "copy-uploads"
  | "copy-keys"
  | "manifest"
  | "archive"
  | "rotate"
  | "done"
  | "failed";

export interface BackupProgress {
  id: string;
  phase: BackupPhase;
  percent: number;
  message?: string;
  startedAt: string;
}

export type RestorePhase =
  | "queued"
  | "safety-backup"
  | "extract"
  | "validate"
  | "swap"
  | "migrate"
  | "reopen"
  | "done"
  | "rollback"
  | "failed";

export interface RestoreProgress {
  id: string;
  phase: RestorePhase;
  percent: number;
  message?: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}
