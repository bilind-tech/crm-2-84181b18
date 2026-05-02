// Zod-Schemas für alle Einstellungs-Bereiche.
// Defaults beschreiben, was die UI bei "noch nichts gesetzt" sieht.
// Numerische Felder nutzen z.coerce, damit "465" (String aus Form-Inputs) toleriert wird.

import { z } from "zod";

const optStr = z.string().trim().max(500).optional().nullable();
const cInt = (min: number, max: number, def: number) =>
  z.coerce.number().int().min(min).max(max).default(def);
const cNum = (min: number, max: number, def: number) =>
  z.coerce.number().min(min).max(max).default(def);

export const FirmaSchema = z.object({
  name: z.string().trim().min(1).max(200).default("MyCleanCenter GmbH"),
  inhaber: optStr.default(""),
  strasse: optStr.default(""),
  plz: optStr.default(""),
  ort: optStr.default(""),
  telefon: optStr.default(""),
  email: optStr.default(""),
  web: optStr.default(""),
  ustId: optStr.default(""),
  steuernummer: optStr.default(""),
  handelsregister: optStr.default(""),
  geschaeftsfuehrer: optStr.default(""),
  bankName: optStr.default(""),
  iban: optStr.default(""),
  bic: optStr.default(""),
});
export type FirmaSettings = z.infer<typeof FirmaSchema>;

export const SmtpSchema = z.object({
  host: z.string().trim().min(1).max(255).default("smtp.strato.de"),
  port: cInt(1, 65535, 465),
  secure: z.coerce.boolean().default(true),
  user: z.string().trim().max(255).default(""),
  // password is set separately via SmtpPasswordSchema (encrypted)
  fromName: z.string().trim().max(200).default(""),
  fromEmail: z.string().trim().max(255).default(""),
});
export type SmtpSettings = z.infer<typeof SmtpSchema>;

export const SmtpPasswordSchema = z.object({
  password: z.string().min(1).max(500),
});

export const NummernkreiseSchema = z.object({
  rechnungFormat: z.string().trim().min(1).max(64).default("{KUERZEL}{MM}{YY}/{NN}"),
  angebotFormat: z.string().trim().min(1).max(64).default("A-{KUERZEL}{MM}{YY}/{NN}"),
  startNummer: cInt(1, 99_999, 1),
});

export const SicherheitSchema = z.object({
  autoLockMinutes: cInt(1, 720, 30),
  twoFactorEnabled: z.coerce.boolean().default(false),
});

export const ErscheinungSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).default("system"),
  primaryHue: cInt(0, 360, 220),
  density: z.enum(["compact", "comfortable"]).default("comfortable"),
});

export const BackupPlanSchema = z.object({
  dailyEnabled: z.coerce.boolean().default(true),
  dailyAtHour: cInt(0, 23, 3),
  weeklyEnabled: z.coerce.boolean().default(true),
  weeklyDay: cInt(0, 6, 0),
  monthlyEnabled: z.coerce.boolean().default(true),
  keepDaily: cInt(1, 60, 14),
  keepWeekly: cInt(1, 20, 8),
  keepMonthly: cInt(1, 36, 12),
  driveUploadEnabled: z.coerce.boolean().default(false),
});

export const GoogleDriveSchema = z.object({
  clientId: z.string().trim().max(500).default(""),
  rootFolderName: z.string().trim().min(1).max(100).default("mycleancenter.cm"),
});

export const GoogleDriveSecretSchema = z.object({
  clientSecret: z.string().min(1).max(500).optional(),
  refreshToken: z.string().min(1).max(2000).optional(),
});

export const MahnungSchema = z.object({
  aktiv: z.coerce.boolean().default(true),
  stufe1Tage: cInt(1, 180, 7),
  stufe2Tage: cInt(1, 180, 14),
  stufe3Tage: cInt(1, 180, 28),
  gebuehrStufe2: cNum(0, 1000, 5),
  gebuehrStufe3: cNum(0, 1000, 15),
});

export const DauerauftragSchema = z.object({
  laufzeitTagBeforeFaellig: cInt(0, 60, 7),
  autoVersand: z.coerce.boolean().default(false),
});

export const SteuerSchema = z.object({
  ustSatz: cNum(0, 100, 19),
  kstSatz: cNum(0, 100, 15),
  soliSatz: cNum(0, 100, 5.5),
  gewerbesteuerHebesatz: cInt(0, 1000, 525),
  ruecklageProzent: cNum(0, 100, 35),
});

export const StundenzettelSchema = z.object({
  externeUrl: z.string().trim().max(500).default(""),
});

// Bereich-Definition: name -> Schema, sensible-flag.
export interface Area<T extends z.ZodTypeAny = z.ZodTypeAny> {
  key: string;
  schema: T;
  encrypted: boolean;
}

export const AREAS: Record<string, Area> = {
  firma: { key: "firma", schema: FirmaSchema, encrypted: false },
  smtp: { key: "smtp", schema: SmtpSchema, encrypted: false },
  nummernkreise: { key: "nummernkreise", schema: NummernkreiseSchema, encrypted: false },
  sicherheit: { key: "sicherheit", schema: SicherheitSchema, encrypted: false },
  erscheinung: { key: "erscheinung", schema: ErscheinungSchema, encrypted: false },
  backup: { key: "backup", schema: BackupPlanSchema, encrypted: false },
  googleDrive: { key: "googleDrive", schema: GoogleDriveSchema, encrypted: false },
  mahnung: { key: "mahnung", schema: MahnungSchema, encrypted: false },
  dauerauftrag: { key: "dauerauftrag", schema: DauerauftragSchema, encrypted: false },
  steuer: { key: "steuer", schema: SteuerSchema, encrypted: false },
  stundenzettel: { key: "stundenzettel", schema: StundenzettelSchema, encrypted: false },
};

// Sensible Einzel-Keys (separat verschlüsselt gespeichert)
export const SENSITIVE_KEYS = {
  smtpPassword: "smtp.password",
  googleClientSecret: "googleDrive.clientSecret",
  googleRefreshToken: "googleDrive.refreshToken",
} as const;
