// Zod-Schemas für alle Einstellungs-Bereiche.
// Defaults beschreiben, was die UI bei "noch nichts gesetzt" sieht.

import { z } from "zod";

const optStr = z.string().trim().max(500).optional().nullable();

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
  port: z.number().int().min(1).max(65535).default(465),
  secure: z.boolean().default(true),
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
  startNummer: z.number().int().min(1).max(99_999).default(1),
});

export const SicherheitSchema = z.object({
  autoLockMinutes: z.number().int().min(1).max(720).default(30),
  twoFactorEnabled: z.boolean().default(false),
});

export const ErscheinungSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).default("system"),
  primaryHue: z.number().int().min(0).max(360).default(220),
  density: z.enum(["compact", "comfortable"]).default("comfortable"),
});

export const BackupPlanSchema = z.object({
  dailyEnabled: z.boolean().default(true),
  dailyAtHour: z.number().int().min(0).max(23).default(3),
  weeklyEnabled: z.boolean().default(true),
  weeklyDay: z.number().int().min(0).max(6).default(0), // 0 = Sonntag
  monthlyEnabled: z.boolean().default(true),
  keepDaily: z.number().int().min(1).max(60).default(14),
  keepWeekly: z.number().int().min(1).max(20).default(8),
  keepMonthly: z.number().int().min(1).max(36).default(12),
  driveUploadEnabled: z.boolean().default(false),
});

export const GoogleDriveSchema = z.object({
  clientId: z.string().trim().max(500).default(""),
  // clientSecret + refreshToken werden separat verschlüsselt gespeichert
  rootFolderName: z.string().trim().min(1).max(100).default("mycleancenter.cm"),
});

export const GoogleDriveSecretSchema = z.object({
  clientSecret: z.string().min(1).max(500).optional(),
  refreshToken: z.string().min(1).max(2000).optional(),
});

export const MahnungSchema = z.object({
  aktiv: z.boolean().default(true),
  stufe1Tage: z.number().int().min(1).max(180).default(7),
  stufe2Tage: z.number().int().min(1).max(180).default(14),
  stufe3Tage: z.number().int().min(1).max(180).default(28),
  gebuehrStufe2: z.number().min(0).max(1000).default(5),
  gebuehrStufe3: z.number().min(0).max(1000).default(15),
});

export const DauerauftragSchema = z.object({
  laufzeitTagBeforeFaellig: z.number().int().min(0).max(60).default(7),
  autoVersand: z.boolean().default(false),
});

export const SteuerSchema = z.object({
  ustSatz: z.number().min(0).max(100).default(19),
  kstSatz: z.number().min(0).max(100).default(15),
  soliSatz: z.number().min(0).max(100).default(5.5),
  gewerbesteuerHebesatz: z.number().int().min(0).max(1000).default(525),
  ruecklageProzent: z.number().min(0).max(100).default(35),
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
