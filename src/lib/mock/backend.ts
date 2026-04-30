// In-Memory Mock-Backend mit localStorage-Persistenz.
// Deckt alle in API_SPEC.md beschriebenen Routen ab.
// Im Live-Modus (VITE_USE_MOCK=false) wird stattdessen das echte Pi-Backend kontaktiert.

import type {
  Aktivitaet,
  Angebot,
  Ansprechpartner,
  AppearanceEinstellungen,
  BackupEinstellungen,
  Benachrichtigung,
  DashboardKennzahlen,
  Dokument,
  Firmendaten,
  ID,
  Kunde,
  Notiz,
  Nummernkreise,
  Objekt,
  Position,
  Positionsvorlage,
  Rechnung,
  RechnungStatus,
  SicherheitsEinstellungen,
  SmtpEinstellungen,
  SuchTreffer,
  Textvorlage,
  UmsatzPunkt,
  Warnung,
  Zahlung,
} from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { seed } from "@/lib/mock/seed";

const STORAGE_KEY = "mcc_mock_db_v2";

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
  firmendaten: Firmendaten;
  smtp: SmtpEinstellungen;
  nummernkreise: Nummernkreise;
  sicherheit: SicherheitsEinstellungen;
  appearance: AppearanceEinstellungen;
  backup: BackupEinstellungen;
  zaehler: { kunde: number; objekt: number; angebot: number; rechnung: number };
}

let db: DB | null = null;

function load(): DB {
  if (db) return db;
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
      return db;
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

function nextNumber(praefix: string, n: number): string {
  const year = new Date().getFullYear();
  return praefix
    .replace("{YYYY}", String(year))
    .replace("{####}", String(n).padStart(4, "0"))
    .replace("{###}", String(n).padStart(3, "0"));
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
  } else if (m === "POST" && match(path, "/kunden")) {
    const k = body as Partial<Kunde>;
    d.zaehler.kunde += 1;
    const neu: Kunde = {
      id: uuid(),
      nummer: nextNumber(d.nummernkreise.kundePraefix, d.zaehler.kunde),
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
    Object.assign(k, body, { geaendertAm: now() });
    logAktivitaet("kunde_geaendert", `Kunde ${k.firmenname || k.nachname} geändert`, { typ: "kunde", id: k.id });
    persist();
    result = k;
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
      nummer: nextNumber(d.nummernkreise.angebotPraefix, d.zaehler.angebot),
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
      nummer: nextNumber(d.nummernkreise.rechnungPraefix, d.zaehler.rechnung),
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
      nummer: nextNumber(d.nummernkreise.angebotPraefix, d.zaehler.angebot),
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
      nummer: nextNumber(d.nummernkreise.rechnungPraefix, d.zaehler.rechnung),
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
    persist();
    result = neu;
  } else if (matchRoute(m, path, "GET", "/rechnungen/:id")) {
    const id = match(path, "/rechnungen/:id")!.id;
    const r = d.rechnungen.find((x) => x.id === id);
    if (!r) throw new ApiError("Rechnung nicht gefunden", 404);
    result = { ...r, status: rechnungStatusAuto(r) };
  } else if (matchRoute(m, path, "PATCH", "/rechnungen/:id")) {
    const id = match(path, "/rechnungen/:id")!.id;
    const r = d.rechnungen.find((x) => x.id === id);
    if (!r) throw new ApiError("Rechnung nicht gefunden", 404);
    Object.assign(r, body, { geaendertAm: now() });
    persist();
    result = r;
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
    };
    d.dokumente.push(neu);
    logAktivitaet("dokument_hochgeladen", `Dokument ${neu.titel} hochgeladen`, { typ: "dokument", id: neu.id });
    persist();
    result = neu;
  } else if (matchRoute(m, path, "DELETE", "/dokumente/:id")) {
    const id = match(path, "/dokumente/:id")!.id;
    d.dokumente = d.dokumente.filter((x) => x.id !== id);
    persist();
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
  else if (m === "GET" && match(path, "/dashboard/kennzahlen")) {
    const aktiveKunden = d.kunden.filter((k) => k.status === "aktiv" && !k.archiviert).length;
    const aktiveObjekte = d.objekte.filter((o) => o.status === "aktiv" && !o.archiviert).length;
    const offeneAngebote = d.angebote.filter(
      (a) => a.status === "versendet" || a.status === "entwurf",
    ).length;
    const rechnungenLive = d.rechnungen.map((r) => ({ ...r, status: rechnungStatusAuto(r) }));
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
    const monate: Record<string, UmsatzPunkt> = {};
    const heute = new Date();
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(heute.getFullYear(), heute.getMonth() - i, 1);
      const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      monate[k] = { monat: k, netto: 0, brutto: 0 };
    }
    for (const r of d.rechnungen) {
      if (r.status === "storniert" || r.status === "entwurf") continue;
      const k = r.rechnungsdatum.slice(0, 7);
      if (!monate[k]) continue;
      const { netto, brutto } = summenRechnung(r.positionen, r.rabattGesamt);
      monate[k].netto += netto;
      monate[k].brutto += brutto;
    }
    result = Object.values(monate);
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
    result = d.smtp;
  } else if (m === "PATCH" && match(path, "/einstellungen/smtp")) {
    const incoming = body as Partial<SmtpEinstellungen> & { passwort?: string };
    Object.assign(d.smtp, incoming);
    if (incoming.passwort) d.smtp.passwortGesetzt = true;
    persist();
    result = d.smtp;
  } else if (m === "POST" && match(path, "/einstellungen/smtp/test")) {
    // Mock: simulieren
    result = { erfolg: true, nachricht: "Testmail (simuliert) erfolgreich versendet." };
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
    persist();
    result = d.backup;
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

  // ---- Backup ----
  else if (m === "POST" && match(path, "/backup/erstellen")) {
    logAktivitaet("backup_erstellt", "Backup erstellt (Mock)");
    result = {
      erfolg: true,
      nachricht: "Backup im Mock-Modus simuliert. Im Live-Modus liefert das Pi-Backend ein ZIP.",
      groesseBytes: JSON.stringify(d).length,
    };
  }

  if (result === undefined) {
    throw new ApiError(`Mock-Endpoint nicht implementiert: ${m} ${path}`, 404);
  }
  return result as T;
}

function matchRoute(method: string, path: string, expectedMethod: string, pattern: string): boolean {
  return method === expectedMethod && match(path, pattern) !== null;
}
