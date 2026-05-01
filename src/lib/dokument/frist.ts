import type { Dokument } from "@/lib/api/types";

export type DokumentFristStatus = "ohne" | "offen" | "bald" | "ueberfaellig" | "erledigt";

export function fristStatus(d: Pick<Dokument, "faelligAm" | "erledigtAm">): DokumentFristStatus {
  if (d.erledigtAm) return "erledigt";
  if (!d.faelligAm) return "ohne";
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const fr = new Date(d.faelligAm);
  fr.setHours(0, 0, 0, 0);
  const diff = Math.round((fr.getTime() - heute.getTime()) / (24 * 60 * 60 * 1000));
  if (diff < 0) return "ueberfaellig";
  if (diff <= 3) return "bald";
  return "offen";
}

export const FRIST_LABEL: Record<DokumentFristStatus, string> = {
  ohne: "",
  offen: "Offen",
  bald: "Bald fällig",
  ueberfaellig: "Überfällig",
  erledigt: "Erledigt",
};

export function fristBadgeClass(s: DokumentFristStatus): string {
  switch (s) {
    case "ueberfaellig":
      return "bg-destructive/10 text-destructive border-destructive/20";
    case "bald":
      return "bg-warning/10 text-warning border-warning/20";
    case "erledigt":
      return "bg-success/10 text-success border-success/20";
    case "offen":
      return "bg-muted text-foreground/70 border-border";
    default:
      return "";
  }
}
