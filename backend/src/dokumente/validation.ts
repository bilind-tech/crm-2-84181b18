import { z } from "zod";

export const DokumentTypSchema = z.enum([
  "beleg", "vertrag", "angebot", "rechnung", "protokoll", "bild", "sonstiges",
]);
export const DokumentQuelleSchema = z.enum(["upload", "drag-drop", "handy-scan"]);

const idSchema = z.string().min(1).max(64);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss YYYY-MM-DD sein");

/** Meta-Felder beim POST (zusätzlich zur Datei). Werden als JSON-Field "meta" geschickt. */
export const DokumentMetaInputSchema = z.object({
  titel: z.string().min(1).max(300).optional(),
  beschreibung: z.string().max(2000).nullable().optional(),
  typ: DokumentTypSchema.optional(),
  kundeId: idSchema.nullable().optional(),
  objektId: idSchema.nullable().optional(),
  ordnerId: idSchema.nullable().optional(),
  dokumentdatum: dateSchema.nullable().optional(),
  betrag: z.number().min(-1_000_000_000).max(1_000_000_000).nullable().optional(),
  steuerrelevant: z.boolean().optional(),
  ustSatz: z.number().min(0).max(100).nullable().optional(),
  faelligAm: dateSchema.nullable().optional(),
  quelle: DokumentQuelleSchema.optional(),
  uploadSessionId: idSchema.nullable().optional(),
}).strict();

/** PATCH erlaubt dieselben Felder; alle optional. */
export const DokumentPatchSchema = DokumentMetaInputSchema.extend({
  erledigt: z.boolean().optional(),
}).partial();

export const DokumentListFilterSchema = z.object({
  kundeId: idSchema.optional(),
  objektId: idSchema.optional(),
  ordnerId: z.union([idSchema, z.literal("root")]).optional(),
  recursive: z.coerce.boolean().optional(),
  typ: DokumentTypSchema.optional(),
  jahr: z.coerce.number().int().min(2000).max(2100).optional(),
  offen: z.coerce.boolean().optional(),
  steuer: z.coerce.boolean().optional(),
}).strict();

const ordnerNameSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[\p{L}\p{N} _\-./()&]+$/u, "Nur Buchstaben, Ziffern, Leerzeichen und _-./()&");

export const OrdnerCreateSchema = z.object({
  name: ordnerNameSchema,
  parentId: idSchema.nullable().optional(),
}).strict();

export const OrdnerPatchSchema = z.object({
  name: ordnerNameSchema.optional(),
  parentId: idSchema.nullable().optional(),
}).strict();

export const BulkMoveSchema = z.object({
  ids: z.array(idSchema).min(1).max(500),
  ordnerId: idSchema.nullable(),
}).strict();

export const UploadSessionInputSchema = z.object({
  kundeId: idSchema.nullable().optional(),
  objektId: idSchema.nullable().optional(),
}).strict();

export type DokumentMetaInput = z.infer<typeof DokumentMetaInputSchema>;
export type DokumentPatch = z.infer<typeof DokumentPatchSchema>;
export type DokumentListFilterParsed = z.infer<typeof DokumentListFilterSchema>;
export type UploadSessionInput = z.infer<typeof UploadSessionInputSchema>;
