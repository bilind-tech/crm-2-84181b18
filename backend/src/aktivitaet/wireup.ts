// Übersetzt Bus-Events in Aktivitäts-Einträge (+ ggf. Benachrichtigungen).
// Genau ein Punkt der Wahrheit: was ist eine Aktivität, was triggert eine
// Benachrichtigung. Wird beim Server-Start einmal aufgerufen.

import { on } from "../events/bus.js";
import { record } from "./repo.js";
import { getRechnung } from "../belege/rechnungen-repo.js";
import { getAngebot } from "../belege/angebote-repo.js";

let wired = false;

const SENSIBLE_SETTINGS_KEYS = new Set([
  "smtp", "googleDrive", "backup", "sicherheit", "auth", "stundenzettel",
]);

function belegLabel(art: "angebot" | "rechnung", id: string): { titel: string; route: string } {
  const beleg = art === "angebot" ? getAngebot(id) : getRechnung(id);
  const nummer = (beleg as { nummer?: string } | null)?.nummer ?? id.slice(0, 8);
  const route = art === "angebot" ? `/angebote/${id}` : `/rechnungen/${id}`;
  return { titel: nummer, route };
}

export function wireAktivitaet(): void {
  if (wired) return;
  wired = true;

  on("beleg:mutated", (p) => {
    if (p.statusVorher === p.statusNachher) return; // nur echte Statuswechsel
    const { titel, route } = belegLabel(p.art, p.id);
    record({
      art: "beleg.status_geaendert",
      bezugArt: p.art, bezugId: p.id,
      titel: `${p.art === "rechnung" ? "Rechnung" : "Angebot"} ${titel}: ${p.statusNachher ?? "neuer Status"}`,
      beschreibung: p.statusVorher ? `${p.statusVorher} → ${p.statusNachher}` : `Status: ${p.statusNachher}`,
      kontext: { vorher: p.statusVorher, nachher: p.statusNachher, route },
    });
  });

  on("zahlung:erfasst", (p) => {
    const { titel, route } = belegLabel("rechnung", p.rechnungId);
    const istBezahlt = p.statusNachher === "bezahlt";
    record({
      art: "zahlung.erfasst",
      bezugArt: "rechnung", bezugId: p.rechnungId,
      titel: `Zahlung erfasst: Rechnung ${titel}`,
      beschreibung: `${p.betrag.toFixed(2)} € — Status: ${p.statusNachher}`,
      kontext: { betrag: p.betrag, statusNachher: p.statusNachher, route },
      notify: istBezahlt
        ? { prioritaet: "erfolg", titel: `Rechnung ${titel} vollständig bezahlt`, aktionLabel: "Öffnen", aktionRoute: route }
        : undefined,
    });
  });

  on("mahnung:erstellt", (p) => {
    const { titel, route } = belegLabel("rechnung", p.rechnungId);
    record({
      art: "mahnung.erstellt",
      bezugArt: "rechnung", bezugId: p.rechnungId,
      titel: `Mahnung Stufe ${p.stufe}: Rechnung ${titel}`,
      beschreibung: `Mahnstufe ${p.stufe} erstellt`,
      kontext: { stufe: p.stufe, route },
      notify: { prioritaet: "warnung", titel: `Mahnung ${p.stufe}: Rechnung ${titel}`, aktionLabel: "Öffnen", aktionRoute: route },
    });
  });

  on("email:versand-changed", (p) => {
    if (p.status === "gesendet") {
      record({
        art: "email.gesendet",
        bezugArt: p.belegArt ?? null, bezugId: p.belegId ?? null,
        titel: "E-Mail versendet",
        beschreibung: p.belegId ? `Beleg ${p.belegId.slice(0, 8)}` : "",
      });
    } else if (p.status === "manuell") {
      // erst nach Aufgabe (max-Versuche) als Fehler-Benachrichtigung
      const route = p.belegArt && p.belegId
        ? (p.belegArt === "rechnung" ? `/rechnungen/${p.belegId}` : `/angebote/${p.belegId}`)
        : "/einstellungen?tab=email";
      record({
        art: "email.fehler",
        bezugArt: p.belegArt ?? null, bezugId: p.belegId ?? null,
        titel: "E-Mail-Versand fehlgeschlagen",
        beschreibung: p.fehlerText ?? "Maximale Versuche erreicht",
        notify: { prioritaet: "fehler", titel: "E-Mail-Versand fehlgeschlagen", aktionLabel: "Anzeigen", aktionRoute: route },
      });
    }
  });

  on("drive:upload-changed", (p) => {
    if (p.status === "erfolg") {
      record({
        art: "drive.upload_erfolg",
        bezugArt: p.belegArt ?? null, bezugId: p.belegId ?? null,
        titel: "PDF in Google Drive gesichert",
        beschreibung: p.belegArt ? `${p.belegArt}` : "",
      });
    } else if (p.status === "manuell") {
      record({
        art: "drive.upload_fehler",
        bezugArt: p.belegArt ?? null, bezugId: p.belegId ?? null,
        titel: "Drive-Upload fehlgeschlagen",
        beschreibung: p.fehlerText ?? "Maximale Versuche erreicht",
        notify: { prioritaet: "fehler", titel: "Google-Drive-Upload fehlgeschlagen", aktionLabel: "Einstellungen", aktionRoute: "/einstellungen?tab=drive" },
      });
    }
  });

  on("backup:changed", (p) => {
    if (p.status === "erfolg") {
      record({
        art: "backup.erfolg",
        bezugArt: "backup", bezugId: p.id ?? null,
        titel: "Backup erfolgreich",
        beschreibung: p.art ? `Typ: ${p.art}` : "",
      });
    } else if (p.status === "fehler") {
      record({
        art: "backup.fehler",
        bezugArt: "backup", bezugId: p.id ?? null,
        titel: "Backup fehlgeschlagen",
        beschreibung: p.fehlerText ?? "Unbekannter Fehler",
        notify: { prioritaet: "fehler", titel: "Backup fehlgeschlagen", aktionLabel: "Backups", aktionRoute: "/einstellungen?tab=backup" },
      });
    }
  });

  on("update:phase", (p) => {
    if (p.phase === "installiert" || p.phase === "rollback") {
      record({
        art: p.phase === "rollback" ? "update.rollback" : "update.installiert",
        bezugArt: "update", bezugId: null,
        titel: p.phase === "rollback" ? "Update zurückgerollt" : "System-Update installiert",
        beschreibung: p.detail ?? "",
        notify: { prioritaet: p.phase === "rollback" ? "warnung" : "erfolg", titel: p.phase === "rollback" ? "Update zurückgerollt" : "System-Update installiert" },
      });
    }
  });

  on("auth:login", (p) => {
    record({
      art: "auth.login", userId: p.userId,
      titel: "Anmeldung",
      beschreibung: p.username + (p.ip ? ` (${p.ip})` : ""),
    });
  });

  on("auth:logout", (p) => {
    record({
      art: "auth.logout", userId: p.userId,
      titel: "Abmeldung", beschreibung: "",
    });
  });

  on("kunde:angelegt", (p) => {
    record({
      art: "kunde.angelegt",
      bezugArt: "kunde", bezugId: p.id,
      titel: `Kunde angelegt: ${p.name}`,
      beschreibung: "",
      kontext: { route: `/kunden/${p.id}` },
    });
  });

  on("einstellung:geaendert", (p) => {
    if (!SENSIBLE_SETTINGS_KEYS.has(p.key)) return;
    record({
      art: "einstellung.geaendert",
      userId: p.userId ?? null,
      bezugArt: "system", bezugId: null,
      titel: `Einstellung geändert: ${p.key}`,
      beschreibung: "",
    });
  });
}
