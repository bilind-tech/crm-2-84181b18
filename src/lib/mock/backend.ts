// =============================================================================
// MOCK-BACKEND (nur Frontend-Entwicklung)
// =============================================================================
// In-Memory Mock-Backend mit localStorage-Persistenz.
// Implementiert alle Endpoints, die in BACKEND_INTEGRATION.md spezifiziert sind.
//
// WICHTIG für Claude Code / Backend-Entwicklung:
// - Diese Datei dient ausschließlich als Referenz-Implementierung.
// - Beim Live-Backend-Switch (VITE_USE_MOCK=false in .env) wird sie nicht mehr
//   verwendet. Stattdessen ruft `src/lib/api/client.ts` echte HTTP-Endpoints auf.
// - Single Source of Truth für Datentypen: `src/lib/api/types.ts`.
// - Frontend-Komponenten greifen NIEMALS direkt auf diese Datei zu — immer über
//   die Hooks in `src/hooks/useApi.ts`.
// =============================================================================

import type {
  Aktivitaet,
  Angebot,
  Ansprechpartner,
  AppearanceEinstellungen,
  BackupEintrag,
  BackupEinstellungen,
  Benachrichtigung,
  DashboardKennzahlen,
  Dauerauftrag,
  DauerauftragEinstellungen,
  DauerauftragLauf,
  DauerauftragFrequenz,
  DauerauftragSonderposition,
  Dokument,
  UploadSession,
  EmailSignatur,
  EmailVersand,
  EmailVorlage,
  Firmendaten,
  GoogleDriveEinstellungen,
  ID,
  InstallierteVersion,
  Kunde,
  MahnEinstellungen,
  MahnStufe,
  MahnVorgang,
  Notiz,
  Nummernkreise,
  Objekt,
  Position,
  Positionsvorlage,
  Rechnung,
  RechnungStatus,
  SicherheitsEinstellungen,
  SitzungEintrag,
  SmtpEinstellungen,
  SuchTreffer,
  SystemInfo,
  Textvorlage,
  UmsatzPunkt,
  UpdateLauf,
  UpdatePackageInfo,
  UpdateStepStatus,
  Warnung,
  Zahlung,
} from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { seed } from "@/lib/mock/seed";
import { berechneNeueFrist } from "@/lib/mahnung/regeln";
import {
  berechneNaechsteLauftermine,
  isoDate,
  istPausiert,
  periodeFuer,
} from "@/lib/dauerauftrag/termine";
import { erzeugeRechnungAusLauf } from "@/lib/dauerauftrag/generator";

const STORAGE_KEY = "mcc_mock_db_v7";
const LEGACY_KEYS = ["mcc_mock_db_v6"];

interface DB {
  unlocked: boolean;
  unlockedAt?: string;
  masterPasswort: string;
  kunden: Kunde[];
  ansprechpartner: Ansprechpartner[];
  objekte: Objekt[];
  angebote: Angebot[];
  rechnungen: Rechnung[];
  dokumente: Dokument[];
  notizen: Notiz[];
  aktivitaeten: Aktivitaet[];
  benachrichtigungen: Benachrichtigung[];
  positionsvorlagen: Positionsvorlage[];
  textvorlagen: Textvorlage[];
  emailVorlagen: EmailVorlage[];
  emailSignaturen: EmailSignatur[];
  emailVersand: EmailVersand[];
  firmendaten: Firmendaten;
  smtp: SmtpEinstellungen;
  nummernkreise: Nummernkreise;
  sicherheit: SicherheitsEinstellungen;
  appearance: AppearanceEinstellungen;
  backup: BackupEinstellungen;
  backupHistorie: BackupEintrag[];
  googleDrive: GoogleDriveEinstellungen;
  sitzungen: SitzungEintrag[];
  mahnung: MahnEinstellungen;
  dauerauftraege: Dauerauftrag[];
  dauerauftragLaeufe: DauerauftragLauf[];
  dauerauftragSonderpositionen: DauerauftragSonderposition[];
  dauerauftragEinstellungen: DauerauftragEinstellungen;
  uploadSessions: UploadSession[];
  zaehler: { kunde: number; objekt: number; angebot: number; rechnung: number; dauerauftrag: number };
  /** Pro Kunde + "YYYY-MM" laufende Nummer für Rechnungen/Angebote mit eigenem Kürzel. */
  zaehlerProKunde?: Record<string, Record<string, number>>;
  /** System-Info (CRM-Version, Stack, Hardware). */
  systemInfo?: SystemInfo;
  /** Versionshistorie — die aktive Version steht oben. */
  installedVersionen?: InstallierteVersion[];
  /** Laufende & abgeschlossene Update-Läufe. */
  updateLaeufe?: UpdateLauf[];
  /** Frisch validierte Update-Pakete, die auf Install-Bestätigung warten. */
  updateUploads?: Record<string, UpdatePackageInfo>;
  /** Stundenzettel-Settings (externe URL der iframe-eingebetteten App). */
  stundenzettel?: { externeUrl: string };
}

let db: DB | null = null;
let lastPersistAt = 0;
const STORAGE_TS_KEY = "mcc_mock_db_ts";

/** Cross-Tab-Sync: wenn ein anderer Tab geschrieben hat (neuerer TS), DB neu laden. */
function syncIfStale() {
  if (typeof window === "undefined" || !db) return;
  try {
    const ts = Number(window.localStorage.getItem(STORAGE_TS_KEY) ?? "0");
    if (ts > lastPersistAt) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const fresh = JSON.parse(raw) as DB;
        // unlocked-Status NICHT überschreiben (jeder Tab hat eigene Session).
        const unlocked = db.unlocked;
        const unlockedAt = db.unlockedAt;
        db = fresh;
        db.unlocked = unlocked;
        db.unlockedAt = unlockedAt;
        lastPersistAt = ts;
      }
    }
  } catch { /* ignore */ }
}

function load(): DB {
  if (db) {
    syncIfStale();
    return db;
  }
  if (typeof window === "undefined") {
    db = seed();
    return db;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      db = JSON.parse(raw) as DB;
      // Sitzungs-Lock immer beim Laden zurücksetzen — Lock-Screen erscheint erneut
      db.unlocked = false;
      db.unlockedAt = undefined;
      // uploadSessions kann in alten DBs fehlen
      if (!db.uploadSessions) db.uploadSessions = [];
      lastPersistAt = Number(window.localStorage.getItem(STORAGE_TS_KEY) ?? "0");
      return db;
    }
    // Legacy-Keys aufräumen, frisch seeden (Settings & Daten gehen verloren — bewusst)
    for (const k of LEGACY_KEYS) {
      try { window.localStorage.removeItem(k); } catch { /* ignore */ }
    }
  } catch {
    /* ignore */
  }
  db = seed();
  persist();
  return db;
}

function persist() {
  if (!db || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    lastPersistAt = Date.now();
    window.localStorage.setItem(STORAGE_TS_KEY, String(lastPersistAt));
  } catch {
    /* ignore */
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function now(): string {
  return new Date().toISOString();
}

// Mock-Singleton für Drive-Upload-Queue. Wird einmal beim ersten Lesen gefüllt
// und bleibt im Speicher (kein localStorage — pro Tab).
interface MockDriveUploadEntry {
  id: string;
  belegArt: "angebot" | "rechnung" | "dokument";
  belegId: string;
  dateiName: string;
  pdfSha256: string;
  idempotenzKey: string;
  status: "pending" | "running" | "erfolg" | "fehler" | "manuell";
  versuche: number;
  naechsterVersuchAt: string | null;
  driveFileId: string | null;
  driveWebLink: string | null;
  fehlerText: string | null;
  abgeschlossenAm: string | null;
  erstelltAm: string;
  geaendertAm: string;
}
let _mockDriveUploads: MockDriveUploadEntry[] | null = null;
function mockDriveUploads(): MockDriveUploadEntry[] {
  if (_mockDriveUploads) return _mockDriveUploads;
  const t = new Date();
  const iso = (offsetMin: number) => new Date(t.getTime() - offsetMin * 60_000).toISOString();
  _mockDriveUploads = [
    {
      id: "mock-up-1", belegArt: "rechnung", belegId: "mock-r-1",
      dateiName: "RE-2026-0042 Mustermann GmbH 05-2026.pdf",
      pdfSha256: "abc", idempotenzKey: "k1",
      status: "erfolg", versuche: 1, naechsterVersuchAt: null,
      driveFileId: "mock-file-1",
      driveWebLink: "https://drive.google.com/file/d/mock-file-1/view",
      fehlerText: null, abgeschlossenAm: iso(12),
      erstelltAm: iso(20), geaendertAm: iso(12),
    },
    {
      id: "mock-up-2", belegArt: "angebot", belegId: "mock-a-2",
      dateiName: "AN-2026-0019 Bsp Schule 05-2026.pdf",
      pdfSha256: "def", idempotenzKey: "k2",
      status: "manuell", versuche: 7, naechsterVersuchAt: null,
      driveFileId: null, driveWebLink: null,
      fehlerText: "403: Drive quota exceeded — bitte Speicherplatz prüfen",
      abgeschlossenAm: null,
      erstelltAm: iso(180), geaendertAm: iso(60),
    },
  ];
  return _mockDriveUploads;
}

/** Mock-Drive-Ordner: "{Kategorie}/{YYYY}/{MM}". */
function driveOrdner(kategorie: string): string {
  const j = new Date();
  return `${kategorie}/${j.getFullYear()}/${String(j.getMonth() + 1).padStart(2, "0")}`;
}

/** Simuliert einen erfolgreichen Drive-Upload eines Dokuments nach kurzer Verzögerung. */
function simuliereDriveSync(dok: Dokument) {
  if (typeof setTimeout === "undefined") return;
  setTimeout(() => {
    dok.drive = {
      ...(dok.drive ?? {}),
      fileId: `mock-${dok.id}`,
      webViewLink: `https://drive.google.com/file/d/mock-${dok.id}/view`,
      syncedAt: now(),
      ordner: dok.drive?.ordner ?? driveOrdner("Dokumente"),
    };
    persist();
  }, 1500);
}

function nextNumber(praefix: string, n: number): string {
  const year = new Date().getFullYear();
  return praefix
    .replace("{YYYY}", String(year))
    .replace("{####}", String(n).padStart(4, "0"))
    .replace("{###}", String(n).padStart(3, "0"));
}

/**
 * Erzeugt eine Belegnummer für einen Kunden mit eigenem Kürzel:
 * "{KÜRZEL}-{YYYY}-{MM}-{##}". Zähler läuft pro Kunde + Monat.
 * Fällt auf das globale Schema zurück, wenn der Kunde kein Kürzel hat.
 */
function nextCustomerNumber(d: DB, kundeId: string | undefined, fallbackPraefix: string, fallbackZaehler: number): string {
  const kunde = kundeId ? d.kunden.find((k) => k.id === kundeId) : undefined;
  const kuerzel = kunde?.kuerzel?.trim().toUpperCase();
  if (!kuerzel) return nextNumber(fallbackPraefix, fallbackZaehler);
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const periode = `${yyyy}-${mm}`;
  if (!d.zaehlerProKunde) d.zaehlerProKunde = {};
  if (!d.zaehlerProKunde[kunde!.id]) d.zaehlerProKunde[kunde!.id] = {};
  const map = d.zaehlerProKunde[kunde!.id];
  map[periode] = (map[periode] ?? 0) + 1;
  // Format: {KÜRZEL}{MM}{YY}/{NN}, z. B. "GFU0526/01"
  return `${kuerzel}${mm}${yy}/${String(map[periode]).padStart(2, "0")}`;
}

function logAktivitaet(typ: Aktivitaet["typ"], beschreibung: string, entitaet?: Aktivitaet["entitaet"]) {
  const d = load();
  d.aktivitaeten.unshift({
    id: uuid(),
    zeitpunkt: now(),
    typ,
    beschreibung,
    entitaet,
  });
  d.aktivitaeten = d.aktivitaeten.slice(0, 500);
}

// ---------- Berechnungen ----------

export function summePosition(p: Position): number {
  const brutto = p.menge * p.einzelpreisNetto;
  return brutto * (1 - p.rabatt / 100);
}

export function summenRechnung(positionen: Position[], rabattGesamt: number) {
  const netto = positionen.reduce((s, p) => s + summePosition(p), 0) * (1 - rabattGesamt / 100);
  // Vereinfacht: gemischte Steuersätze gemittelt nach Anteil
  let steuer = 0;
  for (const p of positionen) {
    steuer += summePosition(p) * (p.steuersatz / 100);
  }
  steuer *= 1 - rabattGesamt / 100;
  const brutto = netto + steuer;
  return { netto, steuer, brutto };
}

function rechnungStatusAuto(r: Rechnung): RechnungStatus {
  if (r.status === "storniert" || r.status === "entwurf") return r.status;
  const { brutto } = summenRechnung(r.positionen, r.rabattGesamt);
  const bezahlt = r.zahlungen.reduce((s, z) => s + z.betrag, 0);
  if (bezahlt >= brutto - 0.005) return "bezahlt";
  if (bezahlt > 0) return "teilbezahlt";
  if (new Date(r.faelligkeitsdatum) < new Date()) return "ueberfaellig";
  return r.status;
}

// ---------- Pfad-Routing ----------

function match(path: string, pattern: string): Record<string, string> | null {
  const pa = path.split("?")[0].split("/").filter(Boolean);
  const pb = pattern.split("/").filter(Boolean);
  if (pa.length !== pb.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pa.length; i++) {
    if (pb[i].startsWith(":")) params[pb[i].slice(1)] = decodeURIComponent(pa[i]);
    else if (pb[i] !== pa[i]) return null;
  }
  return params;
}

function query(path: string): URLSearchParams {
  const q = path.split("?")[1] ?? "";
  return new URLSearchParams(q);
}

// ---------- Backend-Implementierung ----------

export async function mockBackend<T>(method: string, path: string, body?: unknown): Promise<T> {
  // simulate kleine Latenz
  await new Promise((r) => setTimeout(r, 30));
  const d = load();
  const m = method.toUpperCase();
  let result: unknown;

  // ---- Auth ----
  if (m === "POST" && match(path, "/auth/unlock")) {
    const { passwort } = (body as { passwort: string }) ?? { passwort: "" };
    if (passwort !== d.masterPasswort) throw new ApiError("Falsches Passwort", 401);
    d.unlocked = true;
    d.unlockedAt = now();
    persist();
    return undefined as T;
  }
  if (m === "POST" && match(path, "/auth/lock")) {
    d.unlocked = false;
    persist();
    return undefined as T;
  }
  if (m === "POST" && match(path, "/auth/passwort-aendern")) {
    const { altesPasswort, neuesPasswort } =
      (body as { altesPasswort: string; neuesPasswort: string }) ?? { altesPasswort: "", neuesPasswort: "" };
    if (altesPasswort !== d.masterPasswort) throw new ApiError("Altes Passwort falsch", 401);
    if (!neuesPasswort || neuesPasswort.length < 4) throw new ApiError("Neues Passwort zu kurz", 400);
    d.masterPasswort = neuesPasswort;
    persist();
    return undefined as T;
  }
  if (m === "GET" && match(path, "/me")) {
    return { unlocked: d.unlocked, unlockedAt: d.unlockedAt, autoLockMinuten: d.sicherheit.autoLockMinuten } as T;
  }

  // Alle übrigen Routen erfordern Unlock — im Mock weichen wir das auf, damit die UI auch
  // ohne expliziten Unlock funktioniert (das Frontend regelt das via auth-Provider).

  // ---- Kunden ----
  if (m === "GET" && match(path, "/kunden")) {
    const q = query(path);
    const search = q.get("q")?.toLowerCase();
    const status = q.get("status");
    const tag = q.get("tag");
    const archiviert = q.get("archiviert");
    let liste = [...d.kunden];
    if (archiviert !== "true") liste = liste.filter((k) => !k.archiviert);
    if (status) liste = liste.filter((k) => k.status === status);
    if (tag) liste = liste.filter((k) => k.tags.includes(tag));
    if (search) {
      liste = liste.filter((k) =>
        [k.firmenname, k.vorname, k.nachname, k.nummer, k.email, k.ort]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(search)),
      );
    }
    result = liste;
  } else if (m === "GET" && match(path.split("?")[0], "/kunden/kuerzel-frei")) {
    // Live-Verfügbarkeitsprüfung für Kunden-Kürzel.
    // Antwort: { frei: boolean, kunde?: { id, nummer, name } }
    const q = query(path);
    const roh = (q.get("kuerzel") ?? "").trim().toUpperCase();
    const exceptId = q.get("exceptId") ?? undefined;
    if (!roh) {
      result = { frei: true };
    } else {
      const treffer = d.kunden.find(
        (kk) =>
          (kk.kuerzel ?? "").trim().toUpperCase() === roh &&
          kk.id !== exceptId,
      );
      if (treffer) {
        const name = treffer.firmenname || `${treffer.vorname ?? ""} ${treffer.nachname ?? ""}`.trim() || "Kunde";
        result = { frei: false, kunde: { id: treffer.id, nummer: treffer.nummer, name } };
      } else {
        result = { frei: true };
      }
    }
  } else if (m === "POST" && match(path, "/kunden")) {
    const k = body as Partial<Kunde> & { startZaehlerAktuellerMonat?: number };
    // Kürzel-Eindeutigkeit erzwingen (case-insensitive, getrimmt)
    const eingehendesKuerzel = k.kuerzel?.trim().toUpperCase().slice(0, 4);
    if (eingehendesKuerzel) {
      const konflikt = d.kunden.find(
        (kk) => (kk.kuerzel ?? "").trim().toUpperCase() === eingehendesKuerzel,
      );
      if (konflikt) {
        const name = konflikt.firmenname || `${konflikt.vorname ?? ""} ${konflikt.nachname ?? ""}`.trim() || "Kunde";
        throw new ApiError(
          `Kürzel «${eingehendesKuerzel}» wird bereits von ${konflikt.nummer} (${name}) verwendet.`,
          409,
        );
      }
    }
    d.zaehler.kunde += 1;
    const neu: Kunde = {
      id: uuid(),
      nummer: nextNumber(d.nummernkreise.kundePraefix, d.zaehler.kunde),
      kuerzel: k.kuerzel?.trim().toUpperCase().slice(0, 4) || undefined,
      typ: k.typ ?? "firma",
      anrede: k.anrede,
      firmenname: k.firmenname,
      vorname: k.vorname,
      nachname: k.nachname,
      strasse: k.strasse,
      plz: k.plz,
      ort: k.ort,
      land: k.land ?? "Deutschland",
      telefon: k.telefon,
      mobil: k.mobil,
      email: k.email,
      webseite: k.webseite,
      ustId: k.ustId,
      steuernummer: k.steuernummer,
      zahlungszielTage: k.zahlungszielTage ?? d.firmendaten.standardZahlungszielTage,
      standardSteuersatz: k.standardSteuersatz ?? d.firmendaten.standardSteuersatz,
      standardRabatt: k.standardRabatt ?? 0,
      notizen: k.notizen,
      tags: k.tags ?? [],
      status: k.status ?? "aktiv",
      archiviert: false,
      erstelltAm: now(),
      geaendertAm: now(),
    };
    d.kunden.push(neu);
    // Optionaler Start-Zähler für aktuellen Monat (wenn Kürzel vorhanden)
    if (neu.kuerzel && typeof k.startZaehlerAktuellerMonat === "number" && k.startZaehlerAktuellerMonat > 1) {
      const nowD = new Date();
      const periode = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;
      if (!d.zaehlerProKunde) d.zaehlerProKunde = {};
      if (!d.zaehlerProKunde[neu.id]) d.zaehlerProKunde[neu.id] = {};
      d.zaehlerProKunde[neu.id][periode] = Math.max(0, k.startZaehlerAktuellerMonat - 1);
    }
    logAktivitaet("kunde_angelegt", `Kunde ${neu.firmenname || `${neu.vorname} ${neu.nachname}`} angelegt`, {
      typ: "kunde",
      id: neu.id,
    });
    persist();
    result = neu;
  } else if (matchRoute(m, path, "GET", "/kunden/:id")) {
    const id = match(path, "/kunden/:id")!.id;
    const k = d.kunden.find((x) => x.id === id);
    if (!k) throw new ApiError("Kunde nicht gefunden", 404);
    result = {
      ...k,
      ansprechpartner: d.ansprechpartner.filter((a) => a.kundeId === id),
      objekte: d.objekte.filter((o) => o.kundeId === id),
      angebote: d.angebote.filter((a) => a.kundeId === id),
      rechnungen: d.rechnungen.filter((r) => r.kundeId === id).map((r) => ({ ...r, status: rechnungStatusAuto(r) })),
      dokumente: d.dokumente.filter((dok) => dok.kundeId === id),
      notizen: d.notizen.filter((n) => n.kundeId === id),
    };
  } else if (matchRoute(m, path, "PATCH", "/kunden/:id")) {
    const id = match(path, "/kunden/:id")!.id;
    const k = d.kunden.find((x) => x.id === id);
    if (!k) throw new ApiError("Kunde nicht gefunden", 404);
    const patch = body as Partial<Kunde> & { startZaehlerAktuellerMonat?: number };
    const { startZaehlerAktuellerMonat, ...rest } = patch;
    // Kürzel normalisieren
    if (typeof rest.kuerzel === "string") {
      rest.kuerzel = rest.kuerzel.trim().toUpperCase().slice(0, 4) || undefined;
    }
    // Eindeutigkeitsprüfung — nur bei Änderung
    if (rest.kuerzel) {
      const konflikt = d.kunden.find(
        (kk) => kk.id !== id && (kk.kuerzel ?? "").trim().toUpperCase() === rest.kuerzel,
      );
      if (konflikt) {
        const name = konflikt.firmenname || `${konflikt.vorname ?? ""} ${konflikt.nachname ?? ""}`.trim() || "Kunde";
        throw new ApiError(
          `Kürzel «${rest.kuerzel}» wird bereits von ${konflikt.nummer} (${name}) verwendet.`,
          409,
        );
      }
    }
    Object.assign(k, rest, { geaendertAm: now() });
    if (k.kuerzel && typeof startZaehlerAktuellerMonat === "number" && startZaehlerAktuellerMonat >= 1) {
      const nowD = new Date();
      const periode = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;
      if (!d.zaehlerProKunde) d.zaehlerProKunde = {};
      if (!d.zaehlerProKunde[k.id]) d.zaehlerProKunde[k.id] = {};
      d.zaehlerProKunde[k.id][periode] = Math.max(0, startZaehlerAktuellerMonat - 1);
    }
    logAktivitaet("kunde_geaendert", `Kunde ${k.firmenname || k.nachname} geändert`, { typ: "kunde", id: k.id });
    persist();
    result = k;
  } else if (matchRoute(m, path, "GET", "/kunden/:id/zaehler")) {
    const id = match(path, "/kunden/:id/zaehler")!.id;
    const k = d.kunden.find((x) => x.id === id);
    if (!k) throw new ApiError("Kunde nicht gefunden", 404);
    const nowD = new Date();
    const yyyy = String(nowD.getFullYear());
    const mm = String(nowD.getMonth() + 1).padStart(2, "0");
    const periode = `${yyyy}-${mm}`;
    const aktuell = d.zaehlerProKunde?.[id]?.[periode] ?? 0;
    result = { periode, naechsterStart: aktuell + 1 };
  } else if (matchRoute(m, path, "DELETE", "/kunden/:id")) {
    const id = match(path, "/kunden/:id")!.id;
    const verknuepft =
      d.objekte.some((o) => o.kundeId === id) ||
      d.rechnungen.some((r) => r.kundeId === id) ||
      d.angebote.some((a) => a.kundeId === id);
    if (verknuepft) throw new ApiError("Kunde hat verknüpfte Datensätze – bitte zuerst archivieren.", 409);
    d.kunden = d.kunden.filter((k) => k.id !== id);
    d.ansprechpartner = d.ansprechpartner.filter((a) => a.kundeId !== id);
    d.notizen = d.notizen.filter((n) => n.kundeId !== id);
    persist();
    return undefined as T;
  }

  // ---- Ansprechpartner ----
  else if (m === "GET" && match(path.split("?")[0], "/ansprechpartner")) {
    const kundeId = query(path).get("kundeId");
    result = d.ansprechpartner.filter((a) => !kundeId || a.kundeId === kundeId);
  } else if (m === "POST" && match(path, "/ansprechpartner")) {
    const a = body as Partial<Ansprechpartner>;
    const neu: Ansprechpartner = {
      id: uuid(),
      kundeId: a.kundeId!,
      anrede: a.anrede,
      vorname: a.vorname,
      nachname: a.nachname,
      position: a.position,
      abteilung: a.abteilung,
      telefon: a.telefon,
      mobil: a.mobil,
      email: a.email,
      notiz: a.notiz,
      primaer: a.primaer ?? false,
    };
    if (neu.primaer) {
      d.ansprechpartner
        .filter((x) => x.kundeId === neu.kundeId)
        .forEach((x) => (x.primaer = false));
    }
    d.ansprechpartner.push(neu);
    persist();
    result = neu;
  } else if (matchRoute(m, path, "PATCH", "/ansprechpartner/:id")) {
    const id = match(path, "/ansprechpartner/:id")!.id;
    const a = d.ansprechpartner.find((x) => x.id === id);
    if (!a) throw new ApiError("Ansprechpartner nicht gefunden", 404);
    Object.assign(a, body);
    if (a.primaer) {
      d.ansprechpartner
        .filter((x) => x.kundeId === a.kundeId && x.id !== a.id)
        .forEach((x) => (x.primaer = false));
    }
    persist();
    result = a;
  } else if (matchRoute(m, path, "DELETE", "/ansprechpartner/:id")) {
    const id = match(path, "/ansprechpartner/:id")!.id;
    d.ansprechpartner = d.ansprechpartner.filter((x) => x.id !== id);
    persist();
    return undefined as T;
  }

  // ---- Objekte ----
  else if (m === "GET" && match(path.split("?")[0], "/objekte")) {
    const q = query(path);
    const kundeId = q.get("kundeId");
    const search = q.get("q")?.toLowerCase();
    let liste = d.objekte.filter((o) => !o.archiviert);
    if (kundeId) liste = liste.filter((o) => o.kundeId === kundeId);
    if (search) liste = liste.filter((o) => o.name.toLowerCase().includes(search));
    result = liste;
  } else if (m === "POST" && match(path, "/objekte")) {
    const o = body as Partial<Objekt>;
    d.zaehler.objekt += 1;
    const neu: Objekt = {
      id: uuid(),
      nummer: `OBJ-${String(d.zaehler.objekt).padStart(4, "0")}`,
      kundeId: o.kundeId!,
      name: o.name ?? "Neues Objekt",
      typ: o.typ ?? "buero",
      strasse: o.strasse,
      plz: o.plz,
      ort: o.ort,
      land: o.land ?? "Deutschland",
      qmGesamt: o.qmGesamt,
      qmZuReinigen: o.qmZuReinigen,
      stockwerke: o.stockwerke,
      raeume: o.raeume,
      frequenz: o.frequenz ?? "woechentlich",
      reinigungstage: o.reinigungstage ?? [],
      uhrzeitVon: o.uhrzeitVon,
      uhrzeitBis: o.uhrzeitBis,
      zugangsinfo: o.zugangsinfo,
      alarmInfo: o.alarmInfo,
      ansprechpartnerVorOrtId: o.ansprechpartnerVorOrtId,
      notizen: o.notizen,
      status: o.status ?? "aktiv",
      archiviert: false,
      erstelltAm: now(),
      geaendertAm: now(),
    };
    d.objekte.push(neu);
    logAktivitaet("objekt_angelegt", `Objekt ${neu.name} angelegt`, { typ: "objekt", id: neu.id });
    persist();
    result = neu;
  } else if (matchRoute(m, path, "GET", "/objekte/:id")) {
    const id = match(path, "/objekte/:id")!.id;
    const o = d.objekte.find((x) => x.id === id);
    if (!o) throw new ApiError("Objekt nicht gefunden", 404);
    result = o;
  } else if (matchRoute(m, path, "PATCH", "/objekte/:id")) {
    const id = match(path, "/objekte/:id")!.id;
    const o = d.objekte.find((x) => x.id === id);
    if (!o) throw new ApiError("Objekt nicht gefunden", 404);
    Object.assign(o, body, { geaendertAm: now() });
    persist();
    result = o;
  } else if (matchRoute(m, path, "DELETE", "/objekte/:id")) {
    const id = match(path, "/objekte/:id")!.id;
    d.objekte = d.objekte.filter((x) => x.id !== id);
    persist();
    return undefined as T;
  }

  // ---- Angebote ----
  else if (m === "GET" && match(path.split("?")[0], "/angebote")) {
    const q = query(path);
    const kundeId = q.get("kundeId");
    const status = q.get("status");
    let liste = d.angebote.filter((a) => !a.archiviert);
    if (kundeId) liste = liste.filter((a) => a.kundeId === kundeId);
    if (status) liste = liste.filter((a) => a.status === status);
    result = liste;
  } else if (m === "POST" && match(path, "/angebote")) {
    const a = body as Partial<Angebot>;
    const kunde = d.kunden.find((k) => k.id === a.kundeId);
    d.zaehler.angebot += 1;
    const neu: Angebot = {
      id: uuid(),
      nummer: nextCustomerNumber(d, a.kundeId, d.nummernkreise.angebotPraefix, d.zaehler.angebot),
      kundeId: a.kundeId!,
      objektId: a.objektId,
      ansprechpartnerId: a.ansprechpartnerId,
      titel: a.titel ?? "Neues Angebot",
      introText: a.introText,
      outroText: a.outroText,
      positionen: a.positionen ?? [],
      rabattGesamt: a.rabattGesamt ?? 0,
      steuersatz: a.steuersatz ?? kunde?.standardSteuersatz ?? 19,
      gueltigBis: a.gueltigBis,
      notizen: a.notizen,
      status: a.status ?? "entwurf",
      archiviert: false,
      optionen: a.optionen,
      erstelltAm: now(),
      geaendertAm: now(),
    };
    d.angebote.push(neu);
    logAktivitaet("angebot_angelegt", `Angebot ${neu.nummer} angelegt`, { typ: "angebot", id: neu.id });
    persist();
    result = neu;
  } else if (matchRoute(m, path, "GET", "/angebote/:id")) {
    const id = match(path, "/angebote/:id")!.id;
    const a = d.angebote.find((x) => x.id === id);
    if (!a) throw new ApiError("Angebot nicht gefunden", 404);
    result = a;
  } else if (matchRoute(m, path, "PATCH", "/angebote/:id")) {
    const id = match(path, "/angebote/:id")!.id;
    const a = d.angebote.find((x) => x.id === id);
    if (!a) throw new ApiError("Angebot nicht gefunden", 404);
    Object.assign(a, body, { geaendertAm: now() });
    persist();
    result = a;
  } else if (matchRoute(m, path, "DELETE", "/angebote/:id")) {
    const id = match(path, "/angebote/:id")!.id;
    d.angebote = d.angebote.filter((x) => x.id !== id);
    persist();
    return undefined as T;
  } else if (matchRoute(m, path, "POST", "/angebote/:id/senden")) {
    const id = match(path, "/angebote/:id/senden")!.id;
    const a = d.angebote.find((x) => x.id === id);
    if (!a) throw new ApiError("Angebot nicht gefunden", 404);
    a.status = "versendet";
    a.versendetAm = now();
    logAktivitaet("angebot_versendet", `Angebot ${a.nummer} versendet`, { typ: "angebot", id: a.id });
    d.benachrichtigungen.unshift({
      id: uuid(),
      zeitpunkt: now(),
      typ: "info",
      titel: "Angebot versendet",
      text: `Angebot ${a.nummer} wurde per E-Mail verschickt.`,
      gelesen: false,
    });
    persist();
    return undefined as T;
  } else if (matchRoute(m, path, "POST", "/angebote/:id/in-rechnung-umwandeln")) {
    const id = match(path, "/angebote/:id/in-rechnung-umwandeln")!.id;
    const a = d.angebote.find((x) => x.id === id);
    if (!a) throw new ApiError("Angebot nicht gefunden", 404);
    const kunde = d.kunden.find((k) => k.id === a.kundeId);
    d.zaehler.rechnung += 1;
    const heute = now().slice(0, 10);
    const faellig = new Date();
    faellig.setDate(faellig.getDate() + (kunde?.zahlungszielTage ?? 14));
    const r: Rechnung = {
      id: uuid(),
      nummer: nextCustomerNumber(d, a.kundeId, d.nummernkreise.rechnungPraefix, d.zaehler.rechnung),
      kundeId: a.kundeId,
      objektId: a.objektId,
      quellAngebotId: a.id,
      titel: a.titel,
      introText: a.introText,
      outroText: a.outroText,
      positionen: a.positionen.map((p) => ({ ...p, id: uuid() })),
      rabattGesamt: a.rabattGesamt,
      steuersatz: a.steuersatz,
      rechnungsdatum: heute,
      faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      notizen: a.notizen,
      status: "entwurf",
      archiviert: false,
      zahlungen: [],
      erstelltAm: now(),
      geaendertAm: now(),
    };
    d.rechnungen.push(r);
    a.status = "angenommen";
    logAktivitaet("angebot_in_rechnung_umgewandelt", `Angebot ${a.nummer} → Rechnung ${r.nummer}`, {
      typ: "rechnung",
      id: r.id,
    });
    persist();
    result = r;
  } else if (matchRoute(m, path, "POST", "/angebote/:id/duplizieren")) {
    const id = match(path, "/angebote/:id/duplizieren")!.id;
    const a = d.angebote.find((x) => x.id === id);
    if (!a) throw new ApiError("Angebot nicht gefunden", 404);
    d.zaehler.angebot += 1;
    const dup: Angebot = {
      ...a,
      id: uuid(),
      nummer: nextCustomerNumber(d, a.kundeId, d.nummernkreise.angebotPraefix, d.zaehler.angebot),
      status: "entwurf",
      versendetAm: undefined,
      positionen: a.positionen.map((p) => ({ ...p, id: uuid() })),
      erstelltAm: now(),
      geaendertAm: now(),
    };
    d.angebote.push(dup);
    persist();
    result = dup;
  }

  // ---- Rechnungen ----
  else if (m === "GET" && match(path.split("?")[0], "/rechnungen")) {
    const q = query(path);
    const kundeId = q.get("kundeId");
    const status = q.get("status");
    let liste = d.rechnungen
      .filter((r) => !r.archiviert)
      .map((r) => ({ ...r, status: rechnungStatusAuto(r) }));
    if (kundeId) liste = liste.filter((r) => r.kundeId === kundeId);
    if (status) liste = liste.filter((r) => r.status === status);
    result = liste;
  } else if (m === "POST" && match(path, "/rechnungen")) {
    const r = body as Partial<Rechnung>;
    const kunde = d.kunden.find((k) => k.id === r.kundeId);
    d.zaehler.rechnung += 1;
    const heute = now().slice(0, 10);
    const faellig = new Date();
    faellig.setDate(faellig.getDate() + (kunde?.zahlungszielTage ?? 14));
    const neu: Rechnung = {
      id: uuid(),
      nummer: nextCustomerNumber(d, r.kundeId, d.nummernkreise.rechnungPraefix, d.zaehler.rechnung),
      kundeId: r.kundeId!,
      objektId: r.objektId,
      ansprechpartnerId: r.ansprechpartnerId,
      titel: r.titel ?? "Neue Rechnung",
      introText: r.introText,
      outroText: r.outroText,
      positionen: r.positionen ?? [],
      rabattGesamt: r.rabattGesamt ?? 0,
      steuersatz: r.steuersatz ?? kunde?.standardSteuersatz ?? 19,
      rechnungsdatum: r.rechnungsdatum ?? heute,
      faelligkeitsdatum: r.faelligkeitsdatum ?? faellig.toISOString().slice(0, 10),
      notizen: r.notizen,
      status: r.status ?? "entwurf",
      archiviert: false,
      zahlungen: [],
      optionen: r.optionen,
      erstelltAm: now(),
      geaendertAm: now(),
    };
    d.rechnungen.push(neu);
    logAktivitaet("rechnung_angelegt", `Rechnung ${neu.nummer} angelegt`, { typ: "rechnung", id: neu.id });

    // Auto-Dauerauftrag, wenn die Rechnung als wiederkehrend markiert ist und noch keiner verknüpft ist.
    let dauerauftragNeu: { id: string; nummer: string } | undefined;
    if (neu.optionen?.wiederkehrend && !neu.dauerauftragId) {
      const da = erzeugeDauerauftragAusRechnung(d, neu);
      neu.dauerauftragId = da.id;
      dauerauftragNeu = { id: da.id, nummer: da.nummer };
    }

    persist();
    result = { ...neu, dauerauftragNeu };
  } else if (matchRoute(m, path, "GET", "/rechnungen/:id")) {
    const id = match(path, "/rechnungen/:id")!.id;
    const r = d.rechnungen.find((x) => x.id === id);
    if (!r) throw new ApiError("Rechnung nicht gefunden", 404);
    result = { ...r, status: rechnungStatusAuto(r) };
  } else if (matchRoute(m, path, "PATCH", "/rechnungen/:id")) {
    const id = match(path, "/rechnungen/:id")!.id;
    const r = d.rechnungen.find((x) => x.id === id);
    if (!r) throw new ApiError("Rechnung nicht gefunden", 404);
    const warWiederkehrend = !!r.optionen?.wiederkehrend;
    Object.assign(r, body, { geaendertAm: now() });
    let dauerauftragNeu: { id: string; nummer: string } | undefined;
    // Wurde Wiederkehrend neu aktiviert und noch kein Dauerauftrag verknüpft?
    if (r.optionen?.wiederkehrend && !warWiederkehrend && !r.dauerauftragId) {
      const da = erzeugeDauerauftragAusRechnung(d, r);
      r.dauerauftragId = da.id;
      dauerauftragNeu = { id: da.id, nummer: da.nummer };
    }
    persist();
    result = { ...r, dauerauftragNeu };
  } else if (matchRoute(m, path, "DELETE", "/rechnungen/:id")) {
    const id = match(path, "/rechnungen/:id")!.id;
    d.rechnungen = d.rechnungen.filter((x) => x.id !== id);
    persist();
    return undefined as T;
  } else if (matchRoute(m, path, "POST", "/rechnungen/:id/senden")) {
    const id = match(path, "/rechnungen/:id/senden")!.id;
    const r = d.rechnungen.find((x) => x.id === id);
    if (!r) throw new ApiError("Rechnung nicht gefunden", 404);
    r.status = "versendet";
    r.versendetAm = now();
    logAktivitaet("rechnung_versendet", `Rechnung ${r.nummer} versendet`, { typ: "rechnung", id: r.id });
    persist();
    return undefined as T;
  } else if (matchRoute(m, path, "POST", "/rechnungen/:id/zahlungen")) {
    const id = match(path, "/rechnungen/:id/zahlungen")!.id;
    const r = d.rechnungen.find((x) => x.id === id);
    if (!r) throw new ApiError("Rechnung nicht gefunden", 404);
    const z = body as Partial<Zahlung>;
    const neu: Zahlung = {
      id: uuid(),
      rechnungId: id,
      datum: z.datum ?? now().slice(0, 10),
      betrag: z.betrag ?? 0,
      methode: z.methode ?? "ueberweisung",
      referenz: z.referenz,
      notiz: z.notiz,
    };
    r.zahlungen.push(neu);
    r.status = rechnungStatusAuto(r);
    logAktivitaet("zahlung_erfasst", `Zahlung ${neu.betrag.toFixed(2)} € auf Rechnung ${r.nummer}`, {
      typ: "rechnung",
      id: r.id,
    });
    persist();
    result = neu;
  } else if (matchRoute(m, path, "DELETE", "/rechnungen/:rid/zahlungen/:zid")) {
    const p = match(path, "/rechnungen/:rid/zahlungen/:zid")!;
    const r = d.rechnungen.find((x) => x.id === p.rid);
    if (!r) throw new ApiError("Rechnung nicht gefunden", 404);
    r.zahlungen = r.zahlungen.filter((z) => z.id !== p.zid);
    r.status = rechnungStatusAuto(r);
    persist();
    return undefined as T;
  }

  // ---- Dokumente ----
  else if (m === "GET" && match(path.split("?")[0], "/dokumente")) {
    const q = query(path);
    const kundeId = q.get("kundeId");
    const objektId = q.get("objektId");
    let liste = [...d.dokumente];
    if (kundeId) liste = liste.filter((x) => x.kundeId === kundeId);
    if (objektId) liste = liste.filter((x) => x.objektId === objektId);
    result = liste;
  } else if (m === "POST" && match(path, "/dokumente")) {
    const dok = body as Partial<Dokument>;
    const neu: Dokument = {
      id: uuid(),
      titel: dok.titel ?? "Dokument",
      beschreibung: dok.beschreibung,
      typ: dok.typ ?? "sonstiges",
      kundeId: dok.kundeId,
      objektId: dok.objektId,
      dateiname: dok.dateiname ?? "datei",
      mimeType: dok.mimeType ?? "application/octet-stream",
      groesseBytes: dok.groesseBytes ?? 0,
      url: dok.url ?? "",
      dokumentdatum: dok.dokumentdatum,
      betrag: dok.betrag,
      steuerrelevant: dok.steuerrelevant ?? false,
      hochgeladenAm: now(),
      drive: { ordner: driveOrdner("Dokumente") },
    };
    d.dokumente.push(neu);
    simuliereDriveSync(neu);
    logAktivitaet("dokument_hochgeladen", `Dokument ${neu.titel} hochgeladen`, { typ: "dokument", id: neu.id });
    persist();
    result = neu;
  } else if (matchRoute(m, path, "PATCH", "/dokumente/:id")) {
    const id = match(path, "/dokumente/:id")!.id;
    const dok = d.dokumente.find((x) => x.id === id);
    if (!dok) throw new ApiError("Dokument nicht gefunden", 404);
    const patch = body as Partial<Dokument>;
    Object.assign(dok, patch);
    // Wenn als erledigt markiert: alle ungelesenen "überfällig"-Benachrichtigungen entfernen
    if (patch.erledigtAm) {
      d.benachrichtigungen = d.benachrichtigungen.filter(
        (b) => !(b.link?.params?.dokumentId === id && !b.gelesen),
      );
    }
    persist();
    result = dok;
  } else if (matchRoute(m, path, "DELETE", "/dokumente/:id")) {
    const id = match(path, "/dokumente/:id")!.id;
    d.dokumente = d.dokumente.filter((x) => x.id !== id);
    persist();
    return undefined as T;
  }

  // ---- Upload-Sessions (Handy-Scan-Brücke) ----
  else if (m === "POST" && match(path, "/upload-sessions")) {
    const tokenChars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let token = "";
    for (let i = 0; i < 24; i++) token += tokenChars[Math.floor(Math.random() * tokenChars.length)];
    const jetzt = Date.now();
    const session: UploadSession = {
      id: uuid(),
      token,
      erstelltAm: new Date(jetzt).toISOString(),
      ablaufAm: new Date(jetzt + 15 * 60 * 1000).toISOString(),
      beendet: false,
      dokumentIds: [],
    };
    if (!d.uploadSessions) d.uploadSessions = [];
    d.uploadSessions.push(session);
    // alte Sessions aufräumen (>1h)
    d.uploadSessions = d.uploadSessions.filter(
      (s) => jetzt - new Date(s.erstelltAm).getTime() < 60 * 60 * 1000,
    );
    persist();
    result = session;
  } else if (matchRoute(m, path, "GET", "/upload-sessions/:token")) {
    const token = match(path, "/upload-sessions/:token")!.token;
    const session = (d.uploadSessions ?? []).find((s) => s.token === token);
    if (!session) throw new ApiError("Upload-Sitzung nicht gefunden", 404);
    if (Date.now() > new Date(session.ablaufAm).getTime()) {
      throw new ApiError("Upload-Sitzung abgelaufen", 410);
    }
    const dateien = d.dokumente.filter((dok) => session.dokumentIds.includes(dok.id));
    result = { ...session, dateien };
  } else if (matchRoute(m, path, "POST", "/upload-sessions/:token/dateien")) {
    const token = match(path, "/upload-sessions/:token/dateien")!.token;
    const session = (d.uploadSessions ?? []).find((s) => s.token === token);
    if (!session) throw new ApiError("Upload-Sitzung nicht gefunden", 404);
    if (session.beendet) throw new ApiError("Upload-Sitzung beendet", 410);
    if (Date.now() > new Date(session.ablaufAm).getTime()) {
      throw new ApiError("Upload-Sitzung abgelaufen", 410);
    }
    const payload = body as { dateien: Partial<Dokument>[] };
    const erzeugt: Dokument[] = [];
    for (const dok of payload.dateien ?? []) {
      const neu: Dokument = {
        id: uuid(),
        titel: dok.titel ?? "Foto vom Handy",
        beschreibung: dok.beschreibung,
        typ: dok.typ ?? "bild",
        kundeId: dok.kundeId,
        objektId: dok.objektId,
        dateiname: dok.dateiname ?? "foto.jpg",
        mimeType: dok.mimeType ?? "image/jpeg",
        groesseBytes: dok.groesseBytes ?? 0,
        url: dok.url ?? "",
        dokumentdatum: dok.dokumentdatum ?? new Date().toISOString().slice(0, 10),
        betrag: dok.betrag,
        steuerrelevant: dok.steuerrelevant ?? false,
        hochgeladenAm: now(),
        quelle: "handy-scan",
        drive: { ordner: driveOrdner("Dokumente") },
      };
      d.dokumente.push(neu);
      simuliereDriveSync(neu);
      session.dokumentIds.push(neu.id);
      erzeugt.push(neu);
    }
    logAktivitaet(
      "dokument_hochgeladen",
      `${erzeugt.length} Foto(s) per Handy-Scan hochgeladen`,
    );
    persist();
    result = { dateien: erzeugt };
  } else if (matchRoute(m, path, "POST", "/upload-sessions/:token/beenden")) {
    const token = match(path, "/upload-sessions/:token/beenden")!.token;
    const session = (d.uploadSessions ?? []).find((s) => s.token === token);
    if (session) {
      session.beendet = true;
      persist();
    }
    return undefined as T;
  }

  // ---- Notizen ----
  else if (m === "POST" && match(path, "/notizen")) {
    const n = body as Partial<Notiz>;
    const neu: Notiz = {
      id: uuid(),
      kundeId: n.kundeId,
      objektId: n.objektId,
      titel: n.titel ?? "Notiz",
      inhalt: n.inhalt ?? "",
      erstelltAm: now(),
    };
    d.notizen.push(neu);
    persist();
    result = neu;
  } else if (matchRoute(m, path, "DELETE", "/notizen/:id")) {
    const id = match(path, "/notizen/:id")!.id;
    d.notizen = d.notizen.filter((n) => n.id !== id);
    persist();
    return undefined as T;
  }

  // ---- Dashboard ----
  else if (m === "GET" && match(path.split("?")[0], "/dashboard/kennzahlen")) {
    const qs = new URLSearchParams(path.split("?")[1] ?? "");
    const jahr = qs.get("jahr");
    const monat = qs.get("monat");
    const passt = (iso: string | undefined): boolean => {
      if (!jahr) return true;
      if (!iso || iso.length < 7) return false;
      if (iso.slice(0, 4) !== jahr) return false;
      if (monat && iso.slice(5, 7) !== monat) return false;
      return true;
    };
    const aktiveKunden = d.kunden.filter((k) => k.status === "aktiv" && !k.archiviert).length;
    const aktiveObjekte = d.objekte.filter((o) => o.status === "aktiv" && !o.archiviert).length;
    const offeneAngebote = d.angebote.filter(
      (a) =>
        (a.status === "versendet" || a.status === "entwurf") &&
        passt(a.erstelltAm),
    ).length;
    const rechnungenLive = d.rechnungen
      .map((r) => ({ ...r, status: rechnungStatusAuto(r) }))
      .filter((r) => passt(r.rechnungsdatum));
    const offeneRechnungen = rechnungenLive.filter(
      (r) => r.status === "versendet" || r.status === "teilbezahlt" || r.status === "ueberfaellig",
    ).length;
    const ausstehendEUR = rechnungenLive
      .filter((r) => r.status !== "bezahlt" && r.status !== "storniert" && r.status !== "entwurf")
      .reduce((s, r) => {
        const { brutto } = summenRechnung(r.positionen, r.rabattGesamt);
        const bezahlt = r.zahlungen.reduce((a, z) => a + z.betrag, 0);
        return s + Math.max(0, brutto - bezahlt);
      }, 0);
    const k: DashboardKennzahlen = {
      aktiveKunden,
      aktiveObjekte,
      offeneAngebote,
      offeneRechnungen,
      ausstehendEUR,
    };
    result = k;
  } else if (m === "GET" && match(path.split("?")[0], "/dashboard/umsatz")) {
    const qs = new URLSearchParams(path.split("?")[1] ?? "");
    const jahr = qs.get("jahr");
    const monat = qs.get("monat");
    const monate: Record<string, UmsatzPunkt> = {};
    if (jahr && monat) {
      const k = `${jahr}-${monat}`;
      monate[k] = { monat: k, netto: 0, brutto: 0 };
    } else if (jahr) {
      for (let i = 1; i <= 12; i++) {
        const k = `${jahr}-${String(i).padStart(2, "0")}`;
        monate[k] = { monat: k, netto: 0, brutto: 0 };
      }
    } else {
      const heute = new Date();
      for (let i = 11; i >= 0; i--) {
        const dt = new Date(heute.getFullYear(), heute.getMonth() - i, 1);
        const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        monate[k] = { monat: k, netto: 0, brutto: 0 };
      }
    }
    for (const r of d.rechnungen) {
      if (r.status === "storniert" || r.status === "entwurf") continue;
      const k = r.rechnungsdatum.slice(0, 7);
      if (!monate[k]) continue;
      const { netto, brutto } = summenRechnung(r.positionen, r.rabattGesamt);
      monate[k].netto += netto;
      monate[k].brutto += brutto;
    }
    result = Object.values(monate).sort((a, b) => a.monat.localeCompare(b.monat));
  } else if (m === "GET" && match(path, "/dashboard/warnungen")) {
    const warnungen: Warnung[] = [];
    const rechnungenLive = d.rechnungen.map((r) => ({ ...r, status: rechnungStatusAuto(r) }));
    for (const r of rechnungenLive) {
      if (r.status === "ueberfaellig") {
        const tage = Math.floor((Date.now() - new Date(r.faelligkeitsdatum).getTime()) / 86400000);
        const kunde = d.kunden.find((k) => k.id === r.kundeId);
        const { brutto } = summenRechnung(r.positionen, r.rabattGesamt);
        const bezahlt = r.zahlungen.reduce((s, z) => s + z.betrag, 0);
        const offen = brutto - bezahlt;
        warnungen.push({
          id: r.id,
          schwere: tage > 30 ? "fehler" : "warnung",
          text: `Rechnung ${r.nummer} (${kunde?.firmenname || kunde?.nachname || "Kunde"}) ist seit ${tage} Tagen überfällig — ${offen.toFixed(2)} € offen.`,
          link: { route: "/rechnungen/$id", params: { id: r.id } },
        });
      }
    }
    for (const a of d.angebote) {
      if (a.status === "versendet" && a.versendetAm) {
        const tage = Math.floor((Date.now() - new Date(a.versendetAm).getTime()) / 86400000);
        if (tage >= 14) {
          const kunde = d.kunden.find((k) => k.id === a.kundeId);
          warnungen.push({
            id: a.id,
            schwere: "info",
            text: `Angebot ${a.nummer} an ${kunde?.firmenname || kunde?.nachname} ist seit ${tage} Tagen offen.`,
            link: { route: "/angebote/$id", params: { id: a.id } },
          });
        }
      }
    }
    result = warnungen;
  }

  // ---- Suche ----
  else if (m === "GET" && match(path.split("?")[0], "/search")) {
    const q = (query(path).get("q") ?? "").toLowerCase().trim();
    const treffer: SuchTreffer[] = [];
    if (q.length === 0) {
      result = treffer;
    } else {
      for (const k of d.kunden) {
        const name = k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim();
        if (`${name} ${k.nummer} ${k.email ?? ""}`.toLowerCase().includes(q)) {
          treffer.push({
            id: k.id,
            typ: "kunde",
            titel: name,
            untertitel: `${k.nummer} · ${k.ort ?? ""}`,
            link: { route: "/kunden/$id", params: { id: k.id } },
          });
        }
      }
      for (const o of d.objekte) {
        if (`${o.name} ${o.nummer} ${o.ort ?? ""}`.toLowerCase().includes(q)) {
          treffer.push({
            id: o.id,
            typ: "objekt",
            titel: o.name,
            untertitel: `${o.nummer}`,
            link: { route: "/objekte/$id", params: { id: o.id } },
          });
        }
      }
      for (const a of d.angebote) {
        if (`${a.nummer} ${a.titel}`.toLowerCase().includes(q)) {
          treffer.push({
            id: a.id,
            typ: "angebot",
            titel: `${a.nummer} – ${a.titel}`,
            link: { route: "/angebote/$id", params: { id: a.id } },
          });
        }
      }
      for (const r of d.rechnungen) {
        if (`${r.nummer} ${r.titel}`.toLowerCase().includes(q)) {
          treffer.push({
            id: r.id,
            typ: "rechnung",
            titel: `${r.nummer} – ${r.titel}`,
            link: { route: "/rechnungen/$id", params: { id: r.id } },
          });
        }
      }
      for (const dok of d.dokumente) {
        if (dok.titel.toLowerCase().includes(q)) {
          treffer.push({
            id: dok.id,
            typ: "dokument",
            titel: dok.titel,
            link: { route: "/dokumente", params: {} },
          });
        }
      }
      result = treffer.slice(0, 30);
    }
  }

  // ---- Aktivitäten / Benachrichtigungen ----
  else if (m === "GET" && match(path.split("?")[0], "/aktivitaeten")) {
    result = d.aktivitaeten.slice(0, 200);
  } else if (m === "GET" && match(path, "/benachrichtigungen")) {
    result = d.benachrichtigungen;
  } else if (matchRoute(m, path, "PATCH", "/benachrichtigungen/:id/gelesen")) {
    const id = match(path, "/benachrichtigungen/:id/gelesen")!.id;
    const b = d.benachrichtigungen.find((x) => x.id === id);
    if (b) b.gelesen = true;
    persist();
    return undefined as T;
  } else if (m === "POST" && match(path, "/benachrichtigungen/alle-gelesen")) {
    d.benachrichtigungen.forEach((b) => (b.gelesen = true));
    persist();
    return undefined as T;
  } else if (m === "POST" && match(path, "/dokumente/check-fristen")) {
    // Prüft alle Dokumente auf überfällige Fristen und legt fehlende Benachrichtigungen an.
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    let neue = 0;
    for (const dok of d.dokumente) {
      if (dok.erledigtAm) continue;
      if (!dok.faelligAm) continue;
      const fr = new Date(dok.faelligAm);
      fr.setHours(0, 0, 0, 0);
      if (fr.getTime() >= heute.getTime()) continue;
      // Schon eine offene Benachrichtigung für dieses Dokument?
      const existiert = d.benachrichtigungen.some(
        (b) => b.link?.params?.dokumentId === dok.id && !b.gelesen,
      );
      if (existiert) continue;
      const tageUeber = Math.round((heute.getTime() - fr.getTime()) / (24 * 60 * 60 * 1000));
      d.benachrichtigungen.unshift({
        id: uuid(),
        zeitpunkt: now(),
        typ: "warnung",
        titel: "Dokument überfällig",
        text: `"${dok.titel}" ist seit ${tageUeber} Tag(en) überfällig.`,
        gelesen: false,
        link: { route: "/dokumente", params: { dokumentId: dok.id } },
      });
      neue++;
    }
    if (neue > 0) persist();
    result = { neue };
  }

  // ---- Einstellungen ----
  else if (m === "GET" && match(path, "/einstellungen/firma")) {
    result = d.firmendaten;
  } else if (m === "PATCH" && match(path, "/einstellungen/firma")) {
    Object.assign(d.firmendaten, body);
    logAktivitaet("einstellung_geaendert", "Firmendaten aktualisiert");
    persist();
    result = d.firmendaten;
  } else if (m === "GET" && match(path, "/einstellungen/smtp")) {
    // Passwort NIEMALS im Response — Frontend bekommt nur passwortGesetzt-Flag.
    const { passwort: _ignored, ...safe } = d.smtp as SmtpEinstellungen & { passwort?: string };
    void _ignored;
    result = safe;
  } else if (m === "PATCH" && match(path, "/einstellungen/smtp")) {
    const incoming = body as Partial<SmtpEinstellungen> & { passwort?: string };
    const { passwort, ...rest } = incoming;
    Object.assign(d.smtp, rest);
    if (passwort && passwort.trim().length > 0) {
      d.smtp.passwortGesetzt = true;
      // Mock: das Klartext-Passwort wird NICHT persistiert. Auf dem Pi wird hier AES-GCM verschlüsselt.
    }
    logAktivitaet("einstellung_geaendert", "SMTP-Einstellungen aktualisiert");
    persist();
    const { passwort: _strip, ...safe } = d.smtp as SmtpEinstellungen & { passwort?: string };
    void _strip;
    result = safe;
  } else if (m === "POST" && match(path, "/einstellungen/smtp/test")) {
    // Demo-Modus: kein echter SMTP-Test im Browser möglich.
    result = {
      erfolg: false,
      demo: true,
      nachricht:
        "Demo-Modus — SMTP wird erst auf dem Pi-Backend tatsächlich geprüft. Im Browser kann keine echte Verbindung aufgebaut werden.",
    };
  } else if (m === "POST" && match(path, "/email/verify")) {
    // Demo-Modus: ehrliche Antwort statt Fake-Erfolg.
    await new Promise((r) => setTimeout(r, 400));
    result = {
      ok: false,
      demo: true,
      errorCode: "EDEMO",
      error:
        "Demo-Modus — eine echte SMTP-Verbindung ist erst nach Pi-Deployment möglich. Eingaben werden lokal gespeichert.",
    };
  } else if (m === "POST" && match(path, "/email/test")) {
    // Demo-Modus: KEINE Fake-Erfolg-Mail mehr — sonst denkt der User, es ginge raus.
    await new Promise((r) => setTimeout(r, 400));
    const an = (body as { an?: string } | undefined)?.an?.trim();
    if (!an) {
      result = { ok: false, errorCode: "EINPUT", error: "Empfängeradresse fehlt." };
    } else {
      result = {
        ok: false,
        demo: true,
        errorCode: "EDEMO",
        error:
          "Demo-Modus — Test-Mails werden im Browser NICHT real versendet. Aktiv erst nach Pi-Deployment.",
      };
    }

  } else if (m === "GET" && match(path, "/einstellungen/nummernkreise")) {
    result = d.nummernkreise;
  } else if (m === "PATCH" && match(path, "/einstellungen/nummernkreise")) {
    Object.assign(d.nummernkreise, body);
    persist();
    result = d.nummernkreise;
  } else if (m === "GET" && match(path, "/einstellungen/sicherheit")) {
    result = d.sicherheit;
  } else if (m === "PATCH" && match(path, "/einstellungen/sicherheit")) {
    Object.assign(d.sicherheit, body);
    persist();
    result = d.sicherheit;
  } else if (m === "GET" && match(path, "/einstellungen/erscheinung")) {
    result = d.appearance;
  } else if (m === "PATCH" && match(path, "/einstellungen/erscheinung")) {
    Object.assign(d.appearance, body);
    persist();
    result = d.appearance;
  } else if (m === "GET" && match(path, "/einstellungen/backup")) {
    result = d.backup;
  } else if (m === "PATCH" && match(path, "/einstellungen/backup")) {
    Object.assign(d.backup, body);
    logAktivitaet("einstellung_geaendert", "Backup-Einstellungen aktualisiert");
    persist();
    result = d.backup;
  } else if (m === "GET" && (match(path, "/einstellungen/backup/historie") || match(path, "/backup/historie"))) {
    result = d.backupHistorie ?? [];
  } else if (m === "GET" && match(path, "/einstellungen/stundenzettel")) {
    result = d.stundenzettel ?? { externeUrl: "" };
  } else if (m === "PATCH" && match(path, "/einstellungen/stundenzettel")) {
    const next = { externeUrl: String((body as { externeUrl?: unknown })?.externeUrl ?? "").trim() };
    d.stundenzettel = next;
    persist();
    result = next;
  } else if (m === "GET" && match(path, "/einstellungen/google-drive")) {
    result = d.googleDrive;
  } else if (m === "PATCH" && match(path, "/einstellungen/google-drive")) {
    Object.assign(d.googleDrive, body);
    logAktivitaet("einstellung_geaendert", "Google-Drive-Einstellungen aktualisiert");
    persist();
    result = d.googleDrive;
  } else if (m === "POST" && match(path, "/einstellungen/google-drive/connect")) {
    // Im Mock simulieren wir den OAuth-Authorize-Schritt: wir liefern eine
    // Pseudo-URL, die direkt auf die Einstellungs-Seite mit ?status=ok&mock=1
    // zurückspringt. Erst dort schaltet der Mock-Callback die Verbindung scharf.
    result = { authorizeUrl: "/einstellungen?tab=drive&status=ok&mock=1" };
  } else if (m === "GET" && match(path, "/einstellungen/google-drive/mock-callback")) {
    // Wird vom Frontend nach Lesen des ?status=ok&mock=1 angepingt.
    d.googleDrive.verbunden = true;
    d.googleDrive.kontoEmail = d.googleDrive.kontoEmail ?? "konto@beispiel.de";
    d.googleDrive.verbundenAm = now();
    d.googleDrive.rootOrdnerId = d.googleDrive.rootOrdnerId ?? "mock-root-" + uuid().slice(0, 8);
    d.googleDrive.letzterFehler = undefined;
    logAktivitaet("einstellung_geaendert", `Google Drive verbunden (${d.googleDrive.kontoEmail})`);
    persist();
    result = d.googleDrive;
  } else if (m === "POST" && match(path, "/einstellungen/google-drive/disconnect")) {
    d.googleDrive.verbunden = false;
    d.googleDrive.kontoEmail = undefined;
    d.googleDrive.verbundenAm = undefined;
    d.googleDrive.rootOrdnerId = undefined;
    d.googleDrive.letzteSynchronisation = undefined;
    d.googleDrive.letzterFehler = undefined;
    logAktivitaet("einstellung_geaendert", "Google Drive getrennt");
    persist();
    result = d.googleDrive;
  } else if (m === "POST" && match(path, "/einstellungen/google-drive/test")) {
    if (!d.googleDrive.verbunden) {
      result = { erfolg: false, nachricht: "Bitte zuerst Google Drive verbinden." };
    } else {
      d.googleDrive.letzteSynchronisation = now();
      d.googleDrive.letzterFehler = undefined;
      persist();
      result = {
        erfolg: true,
        nachricht: "Test-PDF erfolgreich nach Drive hochgeladen.",
        webViewLink: "https://drive.google.com/file/d/mock-test/view",
      };
    }
  } else if (m === "GET" && match(path, "/drive/uploads")) {
    result = mockDriveUploads();
  } else if (m === "POST" && (path.match(/^\/drive\/uploads\/[^/]+\/retry$/) !== null)) {
    const id = path.split("/")[3];
    const list = mockDriveUploads();
    const u = list.find((x) => x.id === id);
    if (u) {
      u.status = "pending";
      u.naechsterVersuchAt = now();
      u.fehlerText = null;
      u.geaendertAm = now();
    }
    result = { ok: true };
  } else if (m === "GET" && match(path, "/einstellungen/sitzungen")) {
    result = d.sitzungen ?? [];
  } else if (m === "POST" && match(path, "/einstellungen/sitzungen/alle-beenden")) {
    if (d.sitzungen) d.sitzungen = d.sitzungen.filter((s) => s.istAktuellesGeraet);
    persist();
    return undefined as T;
  } else if (m === "GET" && match(path, "/einstellungen/positionsvorlagen")) {
    result = d.positionsvorlagen;
  } else if (m === "POST" && match(path, "/einstellungen/positionsvorlagen")) {
    const v = { ...(body as Positionsvorlage), id: uuid() };
    d.positionsvorlagen.push(v);
    persist();
    result = v;
  } else if (matchRoute(m, path, "PATCH", "/einstellungen/positionsvorlagen/:id")) {
    const id = match(path, "/einstellungen/positionsvorlagen/:id")!.id;
    const v = d.positionsvorlagen.find((x) => x.id === id);
    if (!v) throw new ApiError("Vorlage nicht gefunden", 404);
    Object.assign(v, body);
    persist();
    result = v;
  } else if (matchRoute(m, path, "DELETE", "/einstellungen/positionsvorlagen/:id")) {
    const id = match(path, "/einstellungen/positionsvorlagen/:id")!.id;
    d.positionsvorlagen = d.positionsvorlagen.filter((x) => x.id !== id);
    persist();
    return undefined as T;
  } else if (m === "GET" && match(path, "/einstellungen/textvorlagen")) {
    result = d.textvorlagen;
  } else if (m === "POST" && match(path, "/einstellungen/textvorlagen")) {
    const v = { ...(body as Textvorlage), id: uuid() };
    d.textvorlagen.push(v);
    persist();
    result = v;
  } else if (matchRoute(m, path, "PATCH", "/einstellungen/textvorlagen/:id")) {
    const id = match(path, "/einstellungen/textvorlagen/:id")!.id;
    const v = d.textvorlagen.find((x) => x.id === id);
    if (!v) throw new ApiError("Vorlage nicht gefunden", 404);
    Object.assign(v, body);
    persist();
    result = v;
  } else if (matchRoute(m, path, "DELETE", "/einstellungen/textvorlagen/:id")) {
    const id = match(path, "/einstellungen/textvorlagen/:id")!.id;
    d.textvorlagen = d.textvorlagen.filter((x) => x.id !== id);
    persist();
    return undefined as T;
  }

  // ---- E-Mail-Vorlagen ----
  else if (m === "GET" && match(path, "/email/vorlagen")) {
    result = d.emailVorlagen;
  } else if (m === "POST" && match(path, "/email/vorlagen")) {
    const v = body as Partial<EmailVorlage>;
    const neu: EmailVorlage = {
      id: uuid(),
      name: v.name ?? "Neue Vorlage",
      kontext: v.kontext ?? "allgemein",
      betreff: v.betreff ?? "",
      koerperHtml: v.koerperHtml ?? "",
      istStandard: v.istStandard ?? false,
      erstelltAm: now(),
      aktualisiertAm: now(),
    };
    if (neu.istStandard) {
      d.emailVorlagen.filter((x) => x.kontext === neu.kontext).forEach((x) => (x.istStandard = false));
    }
    d.emailVorlagen.push(neu);
    persist();
    result = neu;
  } else if (matchRoute(m, path, "PATCH", "/email/vorlagen/:id")) {
    const id = match(path, "/email/vorlagen/:id")!.id;
    const v = d.emailVorlagen.find((x) => x.id === id);
    if (!v) throw new ApiError("Vorlage nicht gefunden", 404);
    Object.assign(v, body, { aktualisiertAm: now() });
    if (v.istStandard) {
      d.emailVorlagen
        .filter((x) => x.kontext === v.kontext && x.id !== v.id)
        .forEach((x) => (x.istStandard = false));
    }
    persist();
    result = v;
  } else if (matchRoute(m, path, "DELETE", "/email/vorlagen/:id")) {
    const id = match(path, "/email/vorlagen/:id")!.id;
    d.emailVorlagen = d.emailVorlagen.filter((x) => x.id !== id);
    persist();
    return undefined as T;
  }

  // ---- E-Mail-Signaturen ----
  else if (m === "GET" && match(path, "/email/signaturen")) {
    result = d.emailSignaturen;
  } else if (m === "POST" && match(path, "/email/signaturen")) {
    const s = body as Partial<EmailSignatur>;
    const neu: EmailSignatur = {
      id: uuid(),
      name: s.name ?? "Neue Signatur",
      html: s.html ?? "",
      istStandard: s.istStandard ?? false,
      erstelltAm: now(),
    };
    if (neu.istStandard) d.emailSignaturen.forEach((x) => (x.istStandard = false));
    d.emailSignaturen.push(neu);
    persist();
    result = neu;
  } else if (matchRoute(m, path, "PATCH", "/email/signaturen/:id")) {
    const id = match(path, "/email/signaturen/:id")!.id;
    const s = d.emailSignaturen.find((x) => x.id === id);
    if (!s) throw new ApiError("Signatur nicht gefunden", 404);
    Object.assign(s, body);
    if (s.istStandard) d.emailSignaturen.filter((x) => x.id !== s.id).forEach((x) => (x.istStandard = false));
    persist();
    result = s;
  } else if (matchRoute(m, path, "DELETE", "/email/signaturen/:id")) {
    const id = match(path, "/email/signaturen/:id")!.id;
    d.emailSignaturen = d.emailSignaturen.filter((x) => x.id !== id);
    persist();
    return undefined as T;
  }

  // ---- E-Mail-Versand ----
  else if (m === "GET" && match(path.split("?")[0], "/email/versand")) {
    const q = query(path);
    const belegId = q.get("belegId");
    const belegTyp = q.get("belegTyp");
    let liste = [...d.emailVersand];
    if (belegId) liste = liste.filter((v) => v.belegId === belegId);
    if (belegTyp) liste = liste.filter((v) => v.belegTyp === belegTyp);
    result = liste.sort((a, b) => (b.versendetAm ?? "").localeCompare(a.versendetAm ?? ""));
  } else if (m === "POST" && match(path, "/email/versand")) {
    const v = body as Partial<EmailVersand> & { mahnStufe?: MahnStufe; idempotenzKey?: string };
    // Idempotenz: gleicher Key → bestehenden Eintrag zurückgeben (kein zweiter Versand).
    if (v.idempotenzKey) {
      const dup = d.emailVersand.find((e) => (e as EmailVersand & { idempotenzKey?: string }).idempotenzKey === v.idempotenzKey);
      if (dup) { result = dup; persist(); }
    }
    if (!result) {
      // Demo-Modus: NIEMALS einen Fake-Versand simulieren. Echtes Versenden
      // passiert ausschließlich auf dem Pi-Backend. Wir liefern eine ehrliche
      // Fehlermeldung mit demo-Flag, damit die UI einen neutralen Hinweis zeigt.
      await new Promise((r) => setTimeout(r, 400));
      const eintrag: EmailVersand = {
        id: uuid(),
        belegTyp: v.belegTyp ?? "allgemein",
        belegId: v.belegId,
        kundeId: v.kundeId,
        empfaenger: v.empfaenger ?? [],
        cc: v.cc ?? [],
        bcc: v.bcc ?? [],
        betreff: v.betreff ?? "",
        koerperHtml: v.koerperHtml ?? "",
        vorlageId: v.vorlageId,
        signaturId: v.signaturId,
        anhaenge: v.anhaenge ?? [],
        status: "failed",
        versendetAm: now(),
        fehlerGrund:
          "Demo-Modus — die Mail wurde NICHT versendet. Realer Versand ist erst nach Pi-Deployment möglich.",
        messageId: undefined,
      };
      // Bewusst KEIN Eintrag in d.emailVersand, KEIN Statuswechsel am Beleg, KEIN Aktivitätslog.
      throw new ApiError(eintrag.fehlerGrund ?? "Demo-Modus", 503, { ...eintrag, demo: true });
    }
  }

  // ---- Mahnwesen ----
  else if (m === "GET" && match(path, "/einstellungen/mahnung")) {
    result = d.mahnung;
  } else if (m === "PATCH" && match(path, "/einstellungen/mahnung")) {
    Object.assign(d.mahnung, body);
    logAktivitaet("einstellung_geaendert", "Mahn-Einstellungen aktualisiert");
    persist();
    result = d.mahnung;
  } else if (matchRoute(m, path, "POST", "/rechnungen/:id/mahnung-pausieren")) {
    const id = match(path, "/rechnungen/:id/mahnung-pausieren")!.id;
    const r = d.rechnungen.find((x) => x.id === id);
    if (!r) throw new ApiError("Rechnung nicht gefunden", 404);
    const { bis } = (body as { bis?: string }) ?? {};
    r.mahnPausiertBis = bis;
    logAktivitaet(
      "einstellung_geaendert",
      bis
        ? `Mahnverfahren für ${r.nummer} pausiert bis ${bis}`
        : `Mahn-Pause für ${r.nummer} aufgehoben`,
      { typ: "rechnung", id: r.id },
    );
    persist();
    result = r;
  } else if (matchRoute(m, path, "POST", "/rechnungen/:id/inkasso-markieren")) {
    const id = match(path, "/rechnungen/:id/inkasso-markieren")!.id;
    const r = d.rechnungen.find((x) => x.id === id);
    if (!r) throw new ApiError("Rechnung nicht gefunden", 404);
    r.inkassoMarkiert = !r.inkassoMarkiert;
    logAktivitaet(
      "einstellung_geaendert",
      r.inkassoMarkiert
        ? `${r.nummer} für Inkasso-Übergabe markiert`
        : `Inkasso-Markierung von ${r.nummer} entfernt`,
      { typ: "rechnung", id: r.id },
    );
    persist();
    result = r;
  }

  // ---- Daueraufträge ----
  else if (m === "GET" && match(path, "/dauerauftraege")) {
    result = [...d.dauerauftraege];
  } else if (m === "POST" && match(path, "/dauerauftraege")) {
    const da = body as Partial<Dauerauftrag>;
    d.zaehler.dauerauftrag += 1;
    const heute = now().slice(0, 10);
    const nummer = `DA-${new Date().getFullYear()}-${String(d.zaehler.dauerauftrag).padStart(4, "0")}`;
    const neu: Dauerauftrag = {
      id: uuid(),
      nummer,
      kundeId: da.kundeId!,
      objektId: da.objektId,
      ansprechpartnerId: da.ansprechpartnerId,
      bezeichnung: da.bezeichnung ?? "Neuer Dauerauftrag",
      frequenz: da.frequenz ?? "monatlich",
      stichtag: da.stichtag ?? d.dauerauftragEinstellungen.defaultStichtag,
      laufzeitVon: da.laufzeitVon ?? heute,
      laufzeitBis: da.laufzeitBis,
      positionen: (da.positionen ?? []).map((p) => ({ ...p, id: uuid() })),
      rabattGesamt: da.rabattGesamt ?? 0,
      steuersatz: da.steuersatz ?? d.firmendaten.standardSteuersatz,
      betreffVorlage: da.betreffVorlage ?? "Reinigung {{lauf.zeitraum}}",
      textVorlage: da.textVorlage ?? "",
      modus: da.modus ?? d.dauerauftragEinstellungen.defaultModus,
      emailEmpfaenger: da.emailEmpfaenger,
      status: da.status ?? "aktiv",
      pausiertBis: da.pausiertBis,
      letzteAusfuehrung: undefined,
      notizen: da.notizen,
      erstelltAm: now(),
      geaendertAm: now(),
    };
    d.dauerauftraege.push(neu);
    logAktivitaet("dauerauftrag_angelegt", `Dauerauftrag ${neu.nummer} angelegt`, {
      typ: "dauerauftrag", id: neu.id,
    });
    persist();
    result = neu;
  } else if (matchRoute(m, path, "GET", "/dauerauftraege/:id")) {
    const id = match(path, "/dauerauftraege/:id")!.id;
    const da = d.dauerauftraege.find((x) => x.id === id);
    if (!da) throw new ApiError("Dauerauftrag nicht gefunden", 404);
    result = {
      ...da,
      laeufe: d.dauerauftragLaeufe.filter((l) => l.dauerauftragId === id)
        .sort((a, b) => b.geplantFuer.localeCompare(a.geplantFuer)),
      sonderpositionen: d.dauerauftragSonderpositionen.filter((sp) => sp.dauerauftragId === id),
    };
  } else if (matchRoute(m, path, "PATCH", "/dauerauftraege/:id")) {
    const id = match(path, "/dauerauftraege/:id")!.id;
    const da = d.dauerauftraege.find((x) => x.id === id);
    if (!da) throw new ApiError("Dauerauftrag nicht gefunden", 404);
    Object.assign(da, body, { geaendertAm: now() });
    persist();
    result = da;
  } else if (matchRoute(m, path, "DELETE", "/dauerauftraege/:id")) {
    const id = match(path, "/dauerauftraege/:id")!.id;
    d.dauerauftraege = d.dauerauftraege.filter((x) => x.id !== id);
    d.dauerauftragLaeufe = d.dauerauftragLaeufe.filter((l) => l.dauerauftragId !== id);
    d.dauerauftragSonderpositionen = d.dauerauftragSonderpositionen.filter((sp) => sp.dauerauftragId !== id);
    persist();
    return undefined as T;
  } else if (matchRoute(m, path, "POST", "/dauerauftraege/:id/sofort-lauf")) {
    const id = match(path, "/dauerauftraege/:id/sofort-lauf")!.id;
    const da = d.dauerauftraege.find((x) => x.id === id);
    if (!da) throw new ApiError("Dauerauftrag nicht gefunden", 404);
    const stichtag = new Date();
    const lauf = erzeugeLaufIntern(d, da, stichtag, true);
    persist();
    result = lauf;
  } else if (matchRoute(m, path, "POST", "/dauerauftraege/:id/pausieren")) {
    const id = match(path, "/dauerauftraege/:id/pausieren")!.id;
    const da = d.dauerauftraege.find((x) => x.id === id);
    if (!da) throw new ApiError("Dauerauftrag nicht gefunden", 404);
    const { bis } = (body as { bis?: string }) ?? {};
    da.pausiertBis = bis;
    da.status = bis ? "pausiert" : "aktiv";
    da.geaendertAm = now();
    persist();
    result = da;
  } else if (matchRoute(m, path, "POST", "/dauerauftraege/:id/beenden")) {
    const id = match(path, "/dauerauftraege/:id/beenden")!.id;
    const da = d.dauerauftraege.find((x) => x.id === id);
    if (!da) throw new ApiError("Dauerauftrag nicht gefunden", 404);
    const { zum } = (body as { zum?: string }) ?? {};
    da.laufzeitBis = zum ?? now().slice(0, 10);
    da.status = "beendet";
    da.geaendertAm = now();
    persist();
    result = da;
  }

  // ---- Sonderpositionen ----
  else if (m === "POST" && match(path, "/dauerauftrag-sonderpositionen")) {
    const sp = body as Partial<DauerauftragSonderposition>;
    const neu: DauerauftragSonderposition = {
      id: uuid(),
      dauerauftragId: sp.dauerauftragId!,
      fuerPeriode: sp.fuerPeriode!,
      position: { ...(sp.position as Position), id: uuid() },
    };
    d.dauerauftragSonderpositionen.push(neu);
    persist();
    result = neu;
  } else if (matchRoute(m, path, "DELETE", "/dauerauftrag-sonderpositionen/:id")) {
    const id = match(path, "/dauerauftrag-sonderpositionen/:id")!.id;
    d.dauerauftragSonderpositionen = d.dauerauftragSonderpositionen.filter((sp) => sp.id !== id);
    persist();
    return undefined as T;
  }

  // ---- Dauerauftrag-Läufe (Posteingang) ----
  else if (m === "GET" && match(path.split("?")[0], "/dauerauftrag-laeufe")) {
    const q = query(path);
    const status = q.get("status");
    let liste = [...d.dauerauftragLaeufe];
    if (status) liste = liste.filter((l) => l.status === status);
    result = liste.sort((a, b) => b.geplantFuer.localeCompare(a.geplantFuer));
  } else if (m === "POST" && match(path, "/dauerauftrag-laeufe/check")) {
    // Scheduler-Tick: prüft alle aktiven DAs auf fällige Läufe
    const erzeugte = pruefeFaelligeLaeufeIntern(d);
    persist();
    result = { erzeugteLaeufe: erzeugte.length, laeufe: erzeugte };
  }

  // ---- Einstellungen Dauerauftrag ----
  else if (m === "GET" && match(path, "/einstellungen/dauerauftrag")) {
    result = d.dauerauftragEinstellungen;
  } else if (m === "PATCH" && match(path, "/einstellungen/dauerauftrag")) {
    Object.assign(d.dauerauftragEinstellungen, body);
    persist();
    result = d.dauerauftragEinstellungen;
  }

  else if (m === "POST" && match(path, "/backup/erstellen")) {
    // ─────────────────────────────────────────────────────────────────────
    // FRONTEND-MOCK — im Pi-Backend wird hier:
    //   1. sqlite3 "VACUUM INTO" / .backup-API auf data.sqlite ausgeführt
    //   2. Datei mit gzip komprimiert
    //   3. nach DATA_DIR/backups/{kategorie}/{name}.sqlite.gz verschoben
    //   4. Eintrag in backup_history-Tabelle mit abgeschlossenAm=NOW
    //   5. Optional: Drive-Spiegel-Upload anstoßen
    //   6. Rotation: alte Backups jenseits behaltenDaily/Weekly/Monthly löschen
    // Kein Eintrag erscheint mit status="erfolg" bevor wirklich auf Disk!
    // ─────────────────────────────────────────────────────────────────────
    const eintrag = startBackupMock(d, "manuell", "manuell");
    persist();
    result = eintrag;
  } else if (m === "GET" && match(path, "/backup/in-arbeit")) {
    result = (d.backupHistorie ?? []).filter((b) => b.status === "in_arbeit");
  } else if (m === "GET" && match(path, "/backup/restore-status")) {
    result = { restore: null, maintenance: { active: false } };
  } else if (m === "POST" && (path.startsWith("/backup/") && path.endsWith("/restore"))) {
    // /backup/:id/restore — legt pre-restore-Backup an, simuliert Restore
    // SICHERHEIT: Passwort-Pflicht. Das Live-Pi-Backend MUSS bcrypt-vergleichen
    // und bei Fehler 401 zurückgeben. Daten-Verzeichnis wird beim Restore
    // ausschließlich durch den kontrollierten Restore-Flow berührt — sonst nie.
    const passwort = (body as { passwort?: string })?.passwort ?? "";
    if (!passwort.trim()) {
      throw new ApiError("Passwort erforderlich", 401);
    }
    const id = path.split("/")[2];
    const target = (d.backupHistorie ?? []).find((b) => b.id === id);
    if (!target || target.status !== "erfolg") {
      throw new ApiError("Backup nicht gefunden oder nicht abgeschlossen", 404);
    }
    startBackupMock(d, "vor-restore", "pre-restore");
    logAktivitaet("backup_erstellt", `Wiederherstellung gestartet: ${target.dateiname}`);
    persist();
    // FRONTEND-MOCK — im Live-Backend würde hier der Service kurz pausieren,
    // die Datei entpackt, atomar nach data.sqlite umbenannt und neu gestartet.
    result = { erfolg: true, restoredFrom: target.dateiname, restoredAt: target.zeitpunktStart };
  } else if (m === "POST" && match(path, "/backup/upload")) {
    // FRONTEND-MOCK — im Live-Backend kommt hier ein Multipart-Upload an,
    // die Datei wird in /tmp/backup-upload.sqlite.gz validiert (Header-Magic),
    // dann zur Restore-Bestätigung als Vorschau angeboten.
    const fileName = (body as { fileName?: string })?.fileName ?? "uploaded-backup.sqlite.gz";
    const sizeBytes = (body as { sizeBytes?: number })?.sizeBytes ?? 0;
    result = {
      uploadId: uuid(),
      fileName,
      sizeBytes,
      vermutetesDatum: extrahierteDatumAusName(fileName),
      valide: /\.(sqlite|sqlite\.gz|db)$/i.test(fileName),
    };
  } else if (m === "POST" && (path.startsWith("/backup/upload/") && path.endsWith("/restore"))) {
    // /backup/upload/:uploadId/restore — Passwort-pflichtig
    const passwort = (body as { passwort?: string })?.passwort ?? "";
    if (!passwort.trim()) {
      throw new ApiError("Passwort erforderlich", 401);
    }
    startBackupMock(d, "vor-restore", "pre-restore");
    persist();
    result = { erfolg: true };
  }

  // ─── System & Updates ───────────────────────────────────────────────
  else if (m === "GET" && match(path, "/system/info")) {
    result = ensureSystemInfo(d);
  } else if (m === "GET" && match(path, "/system/update/historie")) {
    result = ensureVersionen(d);
  } else if (m === "POST" && match(path, "/system/update/validate")) {
    // FRONTEND-MOCK — akzeptiert jetzt sowohl Multipart (file=paket) als auch
    // den alten JSON-Pfad ({ fileName, sizeBytes }) als Fallback.
    let fileName = "update.zip";
    let sizeBytes = 0;
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      const f = body.get("paket");
      if (f instanceof File) {
        fileName = f.name;
        sizeBytes = f.size;
      }
    } else if (body && typeof body === "object") {
      const b = body as { fileName?: string; sizeBytes?: number };
      fileName = b.fileName ?? fileName;
      sizeBytes = b.sizeBytes ?? sizeBytes;
    }
    const info = mockValidateUpdate(fileName, sizeBytes, d);
    if (!d.updateUploads) d.updateUploads = {};
    d.updateUploads[info.uploadId] = info;
    persist();
    result = info;
  } else if (m === "POST" && (path.startsWith("/system/update/install/"))) {
    // /system/update/install/:uploadId
    const uploadId = path.split("/")[4];
    const info = d.updateUploads?.[uploadId];
    if (!info || !info.valide) {
      throw new ApiError("Update-Paket nicht gefunden oder ungültig", 400);
    }
    const lauf = startUpdateLaufMock(d, info);
    persist();
    result = lauf;
  } else if (m === "GET" && match(path, "/system/update/lauf/aktuell")) {
    const lauf = d.updateLaeufe?.find((l) => l.status === "laeuft" || l.status === "rollback");
    if (!lauf) return null as T;
    result = lauf;
  } else if (m === "GET" && (path.startsWith("/system/update/lauf/"))) {
    const id = path.split("/")[4];
    const lauf = d.updateLaeufe?.find((l) => l.id === id);
    if (!lauf) throw new ApiError("Update-Lauf nicht gefunden", 404);
    result = lauf;
  } else if (m === "POST" && (path.startsWith("/system/update/rollback/"))) {
    // /system/update/rollback/:version
    // SICHERHEIT: Passwort-Pflicht (Re-Auth). Live-Backend MUSS bcrypt-vergleichen,
    // bei Fehler 401. Vor dem Code-Swap wird ein pre-rollback-{ts}.sqlite.gz
    // Sicherheitsbackup erstellt. Daten-Verzeichnis bleibt 100% unberührt.
    const passwort = (body as { passwort?: string })?.passwort ?? "";
    if (!passwort.trim()) {
      throw new ApiError("Passwort erforderlich", 401);
    }
    const version = decodeURIComponent(path.split("/")[4]);
    startBackupMock(d, "vor-restore", "pre-update");
    const lauf = startRollbackMock(d, version);
    persist();
    result = lauf;
  }

  // ─── Steuern (Step 10) ───────────────────────────────────────────────
  // In-Memory; keine Persist-Notwendigkeit für Demo. Bleibt zwischen Reloads
  // im LocalStorage-DB ungespeichert — Demo-Konto sieht jedes Mal Defaults.
  else if (path.startsWith("/steuern/")) {
    result = handleSteuernMock(m, path, body);
  }
  if (result === undefined) {
    throw new ApiError(`Mock-Endpoint nicht implementiert: ${m} ${path}`, 404);
  }
  return result as T;
}

// ─── Steuern Mock-State (Step 10) ────────────────────────────────────────────
const STEUER_DEFAULTS_MOCK = {
  kstSatz: 15, soliSatz: 5.5, gewstMesszahl: 3.5, gewstHebesatz: 525,
  ustRhythmus: "monatlich", ruecklageSatz: 35, ustPufferSatz: 10,
};
const steuerState = {
  einstellungen: { ...STEUER_DEFAULTS_MOCK, updatedAt: new Date().toISOString() } as Record<string, unknown>,
  manuell: [] as Array<Record<string, unknown>>,
  bezahlt: {} as Record<string, Record<string, unknown>>,
};

function handleSteuernMock(m: string, path: string, body: unknown): unknown {
  const seg = path.split("/").filter(Boolean); // ["steuern", ...]
  const sub = seg[1];
  if (sub === "einstellungen") {
    if (seg[2] === "reset" && m === "POST") {
      steuerState.einstellungen = { ...STEUER_DEFAULTS_MOCK, updatedAt: new Date().toISOString() };
      return steuerState.einstellungen;
    }
    if (m === "GET") return steuerState.einstellungen;
    if (m === "PATCH") {
      steuerState.einstellungen = { ...steuerState.einstellungen, ...(body as object), updatedAt: new Date().toISOString() };
      return steuerState.einstellungen;
    }
  }
  if (sub === "manuelle-posten") {
    if (m === "GET" && !seg[2]) return steuerState.manuell;
    if (m === "POST" && !seg[2]) {
      const id = `man-${Math.random().toString(36).slice(2, 10)}`;
      const p = { id, ...(body as object), erstelltAm: new Date().toISOString() };
      steuerState.manuell.push(p);
      return p;
    }
    if (m === "PATCH" && seg[2]) {
      const i = steuerState.manuell.findIndex((p) => p.id === seg[2]);
      if (i < 0) throw new ApiError("Posten nicht gefunden", 404);
      steuerState.manuell[i] = { ...steuerState.manuell[i], ...(body as object) };
      return steuerState.manuell[i];
    }
    if (m === "DELETE" && seg[2]) {
      steuerState.manuell = steuerState.manuell.filter((p) => p.id !== seg[2]);
      delete steuerState.bezahlt[seg[2]];
      return undefined;
    }
  }
  if (sub === "bezahlt") {
    if (m === "GET" && !seg[2]) return steuerState.bezahlt;
    if (m === "PUT" && seg[2]) {
      const id = decodeURIComponent(seg[2]);
      steuerState.bezahlt[id] = { postenId: id, ...(body as object), erstelltAm: new Date().toISOString() };
      return steuerState.bezahlt[id];
    }
    if (m === "DELETE" && seg[2]) {
      const id = decodeURIComponent(seg[2]);
      if (!steuerState.bezahlt[id]) throw new ApiError("Markierung nicht gefunden", 404);
      delete steuerState.bezahlt[id];
      return undefined;
    }
  }
  throw new ApiError(`Mock /steuern: ${m} ${path} nicht implementiert`, 404);
}

function matchRoute(method: string, path: string, expectedMethod: string, pattern: string): boolean {
  return method === expectedMethod && match(path, pattern) !== null;
}

// =============================================================================
// Dauerauftrag-Scheduler-Helpers (intern)
// =============================================================================

/**
 * Erzeugt aus einer wiederkehrenden Rechnung automatisch einen Dauerauftrag,
 * verknüpft den aktuellen Monat als bereits-erzeugten Lauf und gibt den DA zurück.
 */
function erzeugeDauerauftragAusRechnung(d: DB, rechnung: Rechnung): Dauerauftrag {
  const details = rechnung.optionen?.wiederkehrendDetails;
  const frequenz: DauerauftragFrequenz =
    details?.rhythmus === "quartalsweise"
      ? "quartalsweise"
      : details?.rhythmus === "jaehrlich"
        ? "jaehrlich"
        : "monatlich";

  d.zaehler.dauerauftrag += 1;
  const heute = now().slice(0, 10);
  const nummer = `DA-${new Date().getFullYear()}-${String(d.zaehler.dauerauftrag).padStart(4, "0")}`;
  const da: Dauerauftrag = {
    id: uuid(),
    nummer,
    kundeId: rechnung.kundeId,
    objektId: rechnung.objektId,
    ansprechpartnerId: rechnung.ansprechpartnerId,
    bezeichnung: rechnung.titel,
    frequenz,
    stichtag: d.dauerauftragEinstellungen.defaultStichtag,
    laufzeitVon: rechnung.rechnungsdatum ?? heute,
    laufzeitBis: undefined,
    positionen: rechnung.positionen.map((p) => ({ ...p, id: uuid() })),
    rabattGesamt: rechnung.rabattGesamt,
    steuersatz: rechnung.steuersatz,
    betreffVorlage: rechnung.titel,
    textVorlage: rechnung.introText ?? "",
    modus: d.dauerauftragEinstellungen.defaultModus,
    emailEmpfaenger: undefined,
    status: "aktiv",
    pausiertBis: undefined,
    letzteAusfuehrung: rechnung.rechnungsdatum,
    notizen: `Automatisch erzeugt aus Rechnung ${rechnung.nummer}.`,
    erstelltAm: now(),
    geaendertAm: now(),
  };
  d.dauerauftraege.push(da);

  // Lauf für die aktuelle Periode als „bereits erzeugt" markieren, damit der
  // Scheduler in diesem Monat keine zweite Rechnung anlegt.
  const stichtag = new Date(rechnung.rechnungsdatum ?? heute);
  const periode = periodeFuer(da, stichtag);
  d.dauerauftragLaeufe.push({
    id: uuid(),
    dauerauftragId: da.id,
    periode,
    geplantFuer: isoDate(stichtag),
    ausgefuehrtAm: now(),
    rechnungId: rechnung.id,
    status: "erzeugt",
  });

  logAktivitaet(
    "dauerauftrag_angelegt",
    `Dauerauftrag ${da.nummer} automatisch aus Rechnung ${rechnung.nummer} erzeugt`,
    { typ: "dauerauftrag", id: da.id },
  );

  return da;
}

/**
 * Erzeugt einen einzelnen Lauf für einen Dauerauftrag und die zugehörige Rechnung.
 * Idempotent: prüft (dauerauftragId, periode) — existiert der Lauf schon, liefert er ihn zurück.
 */
function erzeugeLaufIntern(
  d: DB,
  da: Dauerauftrag,
  stichtag: Date,
  forceEvenIfPaused = false,
): DauerauftragLauf {
  const periode = periodeFuer(da, stichtag);
  const existing = d.dauerauftragLaeufe.find(
    (l) => l.dauerauftragId === da.id && l.periode === periode,
  );
  if (existing) return existing;

  // Pausierung respektieren — Lauf wird als "uebersprungen" markiert
  if (!forceEvenIfPaused && istPausiert(da, stichtag)) {
    const lauf: DauerauftragLauf = {
      id: uuid(),
      dauerauftragId: da.id,
      periode,
      geplantFuer: isoDate(stichtag),
      status: "uebersprungen",
      ausgefuehrtAm: now(),
    };
    d.dauerauftragLaeufe.push(lauf);
    return lauf;
  }

  // Sonderpositionen für diese Periode konsumieren
  const sonderpositionen = d.dauerauftragSonderpositionen.filter(
    (sp) => sp.dauerauftragId === da.id && sp.fuerPeriode === periode && !sp.verbrauchtAm,
  );

  d.zaehler.rechnung += 1;
  const rechnungId = uuid();
  const rechnungNummer = nextCustomerNumber(d, da.kundeId, d.nummernkreise.rechnungPraefix, d.zaehler.rechnung);
  const kunde = d.kunden.find((k) => k.id === da.kundeId);

  try {
    const rechnung = erzeugeRechnungAusLauf({
      da,
      kunde,
      stichtag,
      sonderpositionen,
      rechnungId,
      rechnungNummer,
      jetztIso: now(),
    });
    d.rechnungen.push(rechnung);

    for (const sp of sonderpositionen) sp.verbrauchtAm = now();
    da.letzteAusfuehrung = isoDate(stichtag);

    const lauf: DauerauftragLauf = {
      id: uuid(),
      dauerauftragId: da.id,
      periode,
      geplantFuer: isoDate(stichtag),
      ausgefuehrtAm: now(),
      rechnungId: rechnung.id,
      status: "erzeugt",
    };
    d.dauerauftragLaeufe.push(lauf);

    logAktivitaet(
      "dauerauftrag_lauf_erzeugt",
      `Dauerauftrag ${da.nummer} → Rechnung ${rechnung.nummer} (${periode})`,
      { typ: "rechnung", id: rechnung.id },
    );

    if (da.modus === "vollautomatisch") {
      d.benachrichtigungen.unshift({
        id: uuid(),
        zeitpunkt: now(),
        typ: "info",
        titel: "Rechnung automatisch versendet",
        text: `${da.nummer}: Rechnung ${rechnung.nummer} (${periode}) wurde automatisch erstellt und versendet.`,
        gelesen: false,
        link: { route: "/rechnungen/$id", params: { id: rechnung.id } },
      });
    } else {
      d.benachrichtigungen.unshift({
        id: uuid(),
        zeitpunkt: now(),
        typ: "info",
        titel: "Neuer Rechnungs-Entwurf",
        text: `${da.nummer}: Rechnung ${rechnung.nummer} (${periode}) wartet im Posteingang.`,
        gelesen: false,
        link: { route: "/rechnungen", params: {} },
      });
    }

    return lauf;
  } catch (err) {
    const lauf: DauerauftragLauf = {
      id: uuid(),
      dauerauftragId: da.id,
      periode,
      geplantFuer: isoDate(stichtag),
      status: "fehler",
      fehlerGrund: err instanceof Error ? err.message : String(err),
    };
    d.dauerauftragLaeufe.push(lauf);
    return lauf;
  }
}

/**
 * Prüft alle aktiven Daueraufträge auf fällige Läufe.
 * Wird vom Frontend-Scheduler im Mock und vom Pi-Cron im Live-Modus aufgerufen.
 */
function pruefeFaelligeLaeufeIntern(d: DB): DauerauftragLauf[] {
  const heute = new Date();
  const erzeugte: DauerauftragLauf[] = [];

  for (const da of d.dauerauftraege) {
    if (da.status === "beendet") continue;

    const ab = da.letzteAusfuehrung
      ? (() => {
          const next = new Date(da.letzteAusfuehrung);
          next.setDate(next.getDate() + 1);
          return next;
        })()
      : new Date(da.laufzeitVon);

    // Sicherheitsbegrenzung: max. 24 nachzuholende Läufe pro Tick
    const stichtage = berechneNaechsteLauftermine(da, ab, 24).filter((t) => t <= heute);

    for (const stichtag of stichtage) {
      const periode = periodeFuer(da, stichtag);
      const exists = d.dauerauftragLaeufe.some(
        (l) => l.dauerauftragId === da.id && l.periode === periode,
      );
      if (exists) continue;
      const lauf = erzeugeLaufIntern(d, da, stichtag);
      if (lauf.status === "erzeugt") erzeugte.push(lauf);
    }
  }
  return erzeugte;
}

// =============================================================================
// Backup-Mock-Helfer
// =============================================================================
// FRONTEND-STUB-HINWEIS: Diese Funktionen simulieren auf dem Frontend, was
// das spätere Pi-Backend wirklich macht. Sie schreiben NIEMALS auf Disk und
// erzeugen keine echten SQLite-Dateien.
//
// Pi-Backend (POST /backup/erstellen) MUSS:
//   1. Eintrag mit status="in_arbeit", abgeschlossenAm=null in DB anlegen
//   2. sqlite3 .backup-API auf data.sqlite aufrufen
//   3. Komprimieren mit gzip
//   4. fs.rename atomar nach DATA_DIR/backups/{kategorie}/{name}.sqlite.gz
//   5. ERST DANN: status="erfolg", abgeschlossenAm=NOW() setzen
//   6. Bei Fehler: status="fehler" + Fehlertext, NICHTS in Liste anzeigen
//   7. Optional: Drive-Spiegel im Hintergrund
//   8. Rotation: alte Backups jenseits behaltenDaily/Weekly/Monthly löschen
// =============================================================================

function startBackupMock(
  d: DB,
  ausloeser: BackupAusloeserMock,
  kategorie: BackupKategorieMock,
): BackupEintrag {
  const id = uuid();
  const startISO = now();
  const datePart = startISO.slice(0, 10);
  const eintrag: BackupEintrag = {
    id,
    zeitpunkt: startISO,
    zeitpunktStart: startISO,
    abgeschlossenAm: null,
    kategorie,
    ausloeser,
    groesseBytes: 0,
    status: "in_arbeit",
    dateiname: `data-${kategorie}-${datePart}.sqlite.gz`,
    driveStatus: d.backup.driveSpiegel ? "pending" : undefined,
  };
  if (!d.backupHistorie) d.backupHistorie = [];
  d.backupHistorie.unshift(eintrag);

  // Nach 1500ms „abschließen" — simuliert echten sqlite3-Backup
  if (typeof setTimeout !== "undefined") {
    setTimeout(() => {
      const live = load();
      const x = live.backupHistorie.find((b) => b.id === id);
      if (!x) return;
      x.status = "erfolg";
      x.abgeschlossenAm = now();
      x.groesseBytes = 11_500_000 + Math.floor(Math.random() * 1_500_000);
      if (live.backup.driveSpiegel) {
        // Drive-Sync separat asynchron
        setTimeout(() => {
          const live2 = load();
          const x2 = live2.backupHistorie.find((b) => b.id === id);
          if (x2) {
            x2.driveStatus = "synced";
            persist();
          }
        }, 1200);
      }
      // Rotation anwenden
      rotateBackups(live);
      persist();
    }, 1500);
  }
  return eintrag;
}

type BackupKategorieMock = BackupEintrag["kategorie"];
type BackupAusloeserMock = BackupEintrag["ausloeser"];

function rotateBackups(d: DB) {
  const limits: Record<string, number> = {
    daily: d.backup.behaltenDaily,
    weekly: d.backup.behaltenWeekly,
    monthly: d.backup.behaltenMonthly,
  };
  const groups: Record<string, BackupEintrag[]> = { daily: [], weekly: [], monthly: [] };
  for (const b of d.backupHistorie) {
    if (b.status !== "erfolg") continue;
    if (groups[b.kategorie]) groups[b.kategorie].push(b);
  }
  for (const [kat, limit] of Object.entries(limits)) {
    const list = groups[kat]
      .sort((a, b) => (b.abgeschlossenAm ?? "").localeCompare(a.abgeschlossenAm ?? ""));
    const drop = list.slice(limit);
    for (const x of drop) {
      d.backupHistorie = d.backupHistorie.filter((b) => b.id !== x.id);
    }
  }
  // Sonderbackups (manuell, pre-restore, pre-update) max 30 Tage
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  d.backupHistorie = d.backupHistorie.filter((b) => {
    if (b.kategorie === "daily" || b.kategorie === "weekly" || b.kategorie === "monthly") return true;
    return new Date(b.abgeschlossenAm ?? b.zeitpunktStart).getTime() > cutoff;
  });
}

function extrahierteDatumAusName(name: string): string | undefined {
  const m1 = name.match(/(\d{4}-\d{2}-\d{2})/);
  return m1?.[1];
}

// =============================================================================
// System-Update-Mock
// =============================================================================
// FRONTEND-STUB-HINWEIS: Es wird KEIN Code installiert, KEIN ZIP entpackt.
// Die Steps sind reine UI-Simulation mit setTimeout.
//
// Pi-Backend (POST /system/update/install/:uploadId) MUSS:
//   1. Vor JEDEM Schritt loggen in update_runs-Tabelle
//   2. Sicherheits-Backup VOR npm install erstellen
//   3. Code in /opt/mycleancenter/quarantine/ entpacken
//   4. npm ci --production darin laufen lassen
//   5. node migrate.js auf data.sqlite ausführen (idempotent, schema_migrations)
//   6. Atomar via fs.rename zu /opt/mycleancenter/current/ wechseln
//      (alten Code zu /opt/mycleancenter/previous/ rotieren, max 1 Vorgänger)
//   7. systemctl restart mycleancenter
//   8. Smoke-Test: GET /api/health
//   9. Bei JEDEM Fehler: rename rückwärts, restart, Fehler an Frontend
//  10. Endpunkt nur für authentifizierte Admin-User, max 200MB Upload
// =============================================================================

function ensureSystemInfo(d: DB): SystemInfo {
  if (!d.systemInfo) {
    d.systemInfo = {
      appName: "myCleanCenter CRM",
      version: "1.4.2",
      installedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
      node: "20.11.0",
      sqlite: "3.45.1",
      hardware: "Raspberry Pi 5 · 8 GB RAM · USB-SSD",
    };
  }
  return d.systemInfo;
}

function ensureVersionen(d: DB): InstallierteVersion[] {
  if (!d.installedVersionen || d.installedVersionen.length === 0) {
    const aktiv = ensureSystemInfo(d);
    d.installedVersionen = [
      { version: aktiv.version, installedAt: aktiv.installedAt, istAktiv: true, rollbackVerfuegbar: false },
      {
        version: "1.4.1",
        installedAt: new Date(Date.now() - 17 * 24 * 3600 * 1000).toISOString(),
        istAktiv: false,
        rollbackVerfuegbar: true,
      },
      {
        version: "1.4.0",
        installedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        istAktiv: false,
        rollbackVerfuegbar: false,
      },
    ];
  }
  return d.installedVersionen;
}

function mockValidateUpdate(fileName: string, sizeBytes: number, d: DB): UpdatePackageInfo {
  const aktuell = ensureSystemInfo(d).version;
  const versionMatch = fileName.match(/(\d+\.\d+\.\d+)/);
  const detektiert = versionMatch?.[1];
  const valide = !!detektiert && /\.(zip)$/i.test(fileName) && sizeBytes <= 200 * 1024 * 1024;

  if (!valide) {
    return {
      uploadId: uuid(),
      fileName,
      sizeBytes,
      version: detektiert ?? "",
      pendingMigrations: [],
      warnings: [],
      valide: false,
      fehlerGrund: !detektiert
        ? "Versionsnummer im Dateinamen nicht gefunden (erwartet z.B. mycleancenter-1.5.0.zip)"
        : sizeBytes > 200 * 1024 * 1024
          ? "Datei größer als 200 MB"
          : "Nur .zip-Dateien werden akzeptiert",
    };
  }

  const migrations: string[] = [];
  if (detektiert && detektiert > aktuell) {
    migrations.push("005_add_property_address_history", "006_add_email_attachments");
  }
  return {
    uploadId: uuid(),
    fileName,
    sizeBytes,
    version: detektiert!,
    pendingMigrations: migrations,
    warnings: detektiert! < aktuell
      ? [`Downgrade von ${aktuell} auf ${detektiert} — Daten könnten inkompatibel sein`]
      : ["Backend-Service wird ~10 Sekunden neu starten"],
    valide: true,
  };
}

interface MockUpdateRunner {
  steps: { id: UpdateStepStatus["id"]; label: string; durationMs: number; tickDetail?: (i: number, total: number) => string }[];
}

function getUpdateRunner(): MockUpdateRunner {
  return {
    steps: [
      { id: "entpacken", label: "ZIP entpacken", durationMs: 600 },
      { id: "backup", label: "Sicherheits-Backup erstellen", durationMs: 1500 },
      { id: "quarantaene", label: "Code in Quarantäne kopieren", durationMs: 800 },
      {
        id: "install",
        label: "Abhängigkeiten installieren",
        durationMs: 6000,
        tickDetail: (i, total) => `${i} / ${total} Pakete`,
      },
      { id: "migrations", label: "Datenbank-Migrations ausführen", durationMs: 1200 },
      { id: "neustart", label: "Service neu starten", durationMs: 2000 },
      { id: "smoketest", label: "Smoke-Test", durationMs: 800 },
    ],
  };
}

function startUpdateLaufMock(d: DB, info: UpdatePackageInfo): UpdateLauf {
  const runner = getUpdateRunner();
  const aktiveVersion = ensureSystemInfo(d).version;
  const lauf: UpdateLauf = {
    id: uuid(),
    von: aktiveVersion,
    zu: info.version,
    startetAm: now(),
    beendetAm: null,
    status: "laeuft",
    steps: runner.steps.map((s) => ({ id: s.id, label: s.label, status: "wartet" })),
  };
  if (!d.updateLaeufe) d.updateLaeufe = [];
  d.updateLaeufe.unshift(lauf);

  if (typeof setTimeout === "undefined") return lauf;

  let cumulative = 0;
  runner.steps.forEach((step, idx) => {
    // Step-Start
    setTimeout(() => {
      const live = load();
      const liveLauf = live.updateLaeufe?.find((l) => l.id === lauf.id);
      if (!liveLauf || liveLauf.status !== "laeuft") return;
      const liveStep = liveLauf.steps[idx];
      liveStep.status = "laeuft";
      persist();

      // Optional: tickDetail
      if (step.tickDetail) {
        const total = 120;
        const tickIv = Math.max(120, Math.floor(step.durationMs / 30));
        let i = 0;
        const handle = setInterval(() => {
          i = Math.min(total, i + Math.ceil(total / (step.durationMs / tickIv)));
          const live2 = load();
          const lauf2 = live2.updateLaeufe?.find((l) => l.id === lauf.id);
          if (!lauf2 || lauf2.status !== "laeuft") {
            clearInterval(handle);
            return;
          }
          lauf2.steps[idx].detail = step.tickDetail!(i, total);
          persist();
          if (i >= total) clearInterval(handle);
        }, tickIv);
      }
    }, cumulative);

    cumulative += step.durationMs;

    // Step-Ende
    setTimeout(() => {
      const live = load();
      const liveLauf = live.updateLaeufe?.find((l) => l.id === lauf.id);
      if (!liveLauf || liveLauf.status !== "laeuft") return;
      liveLauf.steps[idx].status = "ok";
      persist();
    }, cumulative);
  });

  // Gesamterfolg
  setTimeout(() => {
    const live = load();
    const liveLauf = live.updateLaeufe?.find((l) => l.id === lauf.id);
    if (!liveLauf || liveLauf.status !== "laeuft") return;
    liveLauf.status = "erfolg";
    liveLauf.beendetAm = now();
    // Versionen umstellen
    const versionen = ensureVersionen(live);
    for (const v of versionen) {
      v.istAktiv = false;
      v.rollbackVerfuegbar = false;
    }
    versionen.unshift({
      version: info.version,
      installedAt: now(),
      istAktiv: true,
      rollbackVerfuegbar: false,
    });
    if (versionen[1]) versionen[1].rollbackVerfuegbar = true;
    if (live.systemInfo) {
      live.systemInfo.version = info.version;
      live.systemInfo.installedAt = now();
    }
    logAktivitaet("einstellung_geaendert", `Update auf Version ${info.version} installiert`);
    persist();
  }, cumulative + 200);

  return lauf;
}

function startRollbackMock(d: DB, version: string): UpdateLauf {
  const aktiv = ensureSystemInfo(d).version;
  const lauf: UpdateLauf = {
    id: uuid(),
    von: aktiv,
    zu: version,
    startetAm: now(),
    beendetAm: null,
    status: "rollback",
    steps: [
      { id: "rollback", label: `Rollback auf ${version}`, status: "laeuft" },
      { id: "neustart", label: "Service neu starten", status: "wartet" },
      { id: "smoketest", label: "Smoke-Test", status: "wartet" },
    ],
  };
  if (!d.updateLaeufe) d.updateLaeufe = [];
  d.updateLaeufe.unshift(lauf);

  if (typeof setTimeout === "undefined") return lauf;

  setTimeout(() => {
    const live = load();
    const l = live.updateLaeufe?.find((x) => x.id === lauf.id);
    if (!l) return;
    l.steps[0].status = "ok";
    l.steps[1].status = "laeuft";
    persist();
  }, 2000);
  setTimeout(() => {
    const live = load();
    const l = live.updateLaeufe?.find((x) => x.id === lauf.id);
    if (!l) return;
    l.steps[1].status = "ok";
    l.steps[2].status = "laeuft";
    persist();
  }, 4000);
  setTimeout(() => {
    const live = load();
    const l = live.updateLaeufe?.find((x) => x.id === lauf.id);
    if (!l) return;
    l.steps[2].status = "ok";
    l.status = "erfolg";
    l.beendetAm = now();
    const versionen = ensureVersionen(live);
    for (const v of versionen) {
      v.istAktiv = v.version === version;
      v.rollbackVerfuegbar = false;
    }
    if (live.systemInfo) live.systemInfo.version = version;
    logAktivitaet("einstellung_geaendert", `Rollback auf Version ${version}`);
    persist();
  }, 5000);

  return lauf;
}
