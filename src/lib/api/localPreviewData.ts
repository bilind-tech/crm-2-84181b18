import type {
  Angebot,
  DashboardKennzahlen,
  Dauerauftrag,
  DauerauftragEinstellungen,
  DauerauftragFrequenz,
  DauerauftragLauf,
  DauerauftragSonderposition,
  Firmendaten,
  Kunde,
  Nummernkreise,
  Rechnung,
  UmsatzPunkt,
} from "@/lib/api/types";
import { vorschauBelegnummer } from "@/lib/belegNummer";

const now = new Date();
const isoNow = now.toISOString();
const today = isoNow.slice(0, 10);
const due = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);
const month = today.slice(0, 7);
const STORAGE_KEY = "mcc.localPreview.belege.v1";

const optionen = {
  materialBereitgestellt: true,
  standardAnschreiben: true,
  wiederkehrend: false,
};

export const previewFirma: Firmendaten = {
  firmenname: "My Clean Center GmbH",
  rechtsform: "GmbH",
  strasse: "Musterstraße 12",
  plz: "53757",
  ort: "Sankt Augustin",
  land: "Deutschland",
  telefon: "+49 2241 000000",
  email: "info@mycleancenter.cm",
  webseite: "mycleancenter.cm",
  ustId: "DE000000000",
  handelsregister: "HRB 00000",
  geschaeftsfuehrer: "Geschäftsführung",
  bankName: "Musterbank",
  iban: "DE00 0000 0000 0000 0000 00",
  bic: "MUSTERXXX",
  standardSteuersatz: 19,
  standardZahlungszielTage: 14,
};

export const previewKunden: Kunde[] = [
  {
    id: "preview-kunde-1",
    nummer: "K-0001",
    kuerzel: "GFU",
    typ: "firma",
    firmenname: "Gebäudereinigung Futura GmbH",
    strasse: "Beispielweg 5",
    plz: "53757",
    ort: "Sankt Augustin",
    land: "Deutschland",
    email: "kontakt@futura.test",
    telefon: "+49 2241 123456",
    zahlungszielTage: 14,
    standardSteuersatz: 19,
    standardRabatt: 0,
    tags: ["Preview"],
    status: "aktiv",
    archiviert: false,
    erstelltAm: isoNow,
    geaendertAm: isoNow,
  },
];

export const previewAngebote: Angebot[] = [
  {
    id: "preview-angebot-1",
    nummer: "GFU0526/01",
    kundeId: "preview-kunde-1",
    titel: "Unterhaltsreinigung Büroflächen",
    positionen: [
      {
        id: "pos-a-1",
        beschreibung: "Regelmäßige Unterhaltsreinigung\n- Arbeitsplätze\n- Sanitärbereiche\n- Küchenbereich",
        menge: 1,
        einheit: "pauschal",
        einzelpreisNetto: 0,
        steuersatz: 19,
        rabatt: 0,
        modus: "pauschal",
        pauschalpreisNetto: 850,
        ausfuehrung: "Mo–Fr · monatlich",
      },
    ],
    rabattGesamt: 0,
    steuersatz: 19,
    gueltigBis: due,
    status: "versendet",
    archiviert: false,
    optionen,
    erstelltAm: isoNow,
    geaendertAm: isoNow,
  },
];

export const previewRechnungen: Rechnung[] = [
  {
    id: "preview-rechnung-1",
    nummer: "GFU0526/02",
    kundeId: "preview-kunde-1",
    titel: "Unterhaltsreinigung Mai",
    positionen: [
      {
        id: "pos-r-1",
        beschreibung: "Unterhaltsreinigung Büroflächen",
        menge: 1,
        einheit: "pauschal",
        einzelpreisNetto: 0,
        steuersatz: 19,
        rabatt: 0,
        modus: "pauschal",
        pauschalpreisNetto: 850,
        ausfuehrung: "Mai",
      },
    ],
    rabattGesamt: 0,
    steuersatz: 19,
    rechnungsdatum: today,
    faelligkeitsdatum: due,
    status: "versendet",
    archiviert: false,
    zahlungen: [],
    optionen,
    erstelltAm: isoNow,
    geaendertAm: isoNow,
  },
];

const previewNummernkreise: Nummernkreise = {
  rechnungFormat: "{KUERZEL}{MM}{YY}/{NN}",
  angebotFormat: "A-{KUERZEL}{MM}{YY}/{NN}",
  startNummer: 1,
};

interface PreviewStore {
  angebote: Angebot[];
  rechnungen: Rechnung[];
  dauerauftraege: Dauerauftrag[];
  dauerauftragLaeufe: DauerauftragLauf[];
  dauerauftragSonderpos: DauerauftragSonderposition[];
  dauerauftragEinstellungen?: DauerauftragEinstellungen;
  dauerauftragSeq?: number;
  firma?: Firmendaten;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readStore(): PreviewStore {
  if (typeof window === "undefined") {
    return { angebote: [], rechnungen: [], dauerauftraege: [], dauerauftragLaeufe: [], dauerauftragSonderpos: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { angebote: [], rechnungen: [], dauerauftraege: [], dauerauftragLaeufe: [], dauerauftragSonderpos: [] };
    const parsed = JSON.parse(raw) as Partial<PreviewStore>;
    return {
      angebote: Array.isArray(parsed.angebote) ? parsed.angebote : [],
      rechnungen: Array.isArray(parsed.rechnungen) ? parsed.rechnungen : [],
      dauerauftraege: Array.isArray(parsed.dauerauftraege) ? parsed.dauerauftraege : [],
      dauerauftragLaeufe: Array.isArray(parsed.dauerauftragLaeufe) ? parsed.dauerauftragLaeufe : [],
      dauerauftragSonderpos: Array.isArray(parsed.dauerauftragSonderpos) ? parsed.dauerauftragSonderpos : [],
      dauerauftragEinstellungen: parsed.dauerauftragEinstellungen,
      dauerauftragSeq: typeof parsed.dauerauftragSeq === "number" ? parsed.dauerauftragSeq : 0,
      firma: parsed.firma,
    };
  } catch {
    return { angebote: [], rechnungen: [], dauerauftraege: [], dauerauftragLaeufe: [], dauerauftragSonderpos: [] };
  }
}

function writeStore(store: PreviewStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function allAngebote(): Angebot[] {
  return [...previewAngebote, ...readStore().angebote];
}

function allRechnungen(): Rechnung[] {
  return [...previewRechnungen, ...readStore().rechnungen];
}

function nextBelegnummer(kind: "angebot" | "rechnung", kundeId: string): string {
  const kunde = previewKunden.find((k) => k.id === kundeId);
  const count = kind === "angebot"
    ? allAngebote().filter((a) => a.kundeId === kundeId).length
    : allRechnungen().filter((r) => r.kundeId === kundeId).length;
  return vorschauBelegnummer(
    kunde?.kuerzel,
    kind === "angebot" ? previewNummernkreise.angebotFormat : previewNummernkreise.rechnungFormat,
    count + 1,
  );
}

export const previewGoogleDrive = {
  verbunden: false,
  email: null,
  rootOrdnerId: null,
  rootOrdnerName: "mycleancenter.cm",
  rootWebLink: null,
  clientIdGesetzt: false,
  clientSecretGesetzt: false,
  aktualisiertAm: isoNow,
};

export function previewDashboardKennzahlen(): DashboardKennzahlen {
  const angebote = allAngebote();
  const rechnungen = allRechnungen();
  return {
    aktiveKunden: previewKunden.length,
    aktiveObjekte: 0,
    offeneAngebote: angebote.filter((a) => a.status === "entwurf" || a.status === "versendet").length,
    offeneRechnungen: rechnungen.filter((r) => r.status !== "bezahlt" && r.status !== "storniert").length,
    ausstehendEUR: 1011.5,
  };
}

export function previewUmsatz(): UmsatzPunkt[] {
  return [{ monat: month, netto: 850, brutto: 1011.5 }];
}

// ---------- Daueraufträge (Preview-Mock) ----------

const DA_DEFAULT_EINSTELLUNGEN: DauerauftragEinstellungen = {
  laufzeitTagBeforeFaellig: 5,
  autoVersand: false,
};

function mapRhythmusZuFrequenz(rh: string | undefined): DauerauftragFrequenz {
  if (rh === "quartalsweise" || rh === "halbjaehrlich" || rh === "jaehrlich") return rh;
  return "monatlich";
}

function periodeFuerFrequenz(freq: DauerauftragFrequenz, d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (freq === "monatlich") return `${y}-${String(m).padStart(2, "0")}`;
  if (freq === "quartalsweise") return `${y}-Q${Math.ceil(m / 3)}`;
  if (freq === "halbjaehrlich") return `${y}-H${m <= 6 ? 1 : 2}`;
  return `${y}`;
}

function nextDauerauftragNummer(store: PreviewStore): string {
  const seq = (store.dauerauftragSeq ?? 0) + 1;
  store.dauerauftragSeq = seq;
  return `DA-${now.getFullYear()}-${String(seq).padStart(3, "0")}`;
}

function createPreviewDauerauftrag(
  store: PreviewStore,
  input: {
    kundeId: string;
    objektId?: string | null;
    ansprechpartnerId?: string | null;
    bezeichnung?: string;
    frequenz: DauerauftragFrequenz;
    positionen: Rechnung["positionen"];
    rabattGesamt: number;
    steuersatz: number;
    rechnungsdatum?: string;
    introText?: string;
    outroText?: string;
    notizen?: string | null;
  },
  timestamp: string,
): Dauerauftrag {
  const da: Dauerauftrag = {
    id: `preview-da-${crypto.randomUUID()}`,
    nummer: nextDauerauftragNummer(store),
    kundeId: input.kundeId,
    objektId: input.objektId ?? undefined,
    ansprechpartnerId: input.ansprechpartnerId ?? undefined,
    bezeichnung: (input.bezeichnung ?? "Dauerauftrag").trim() || "Dauerauftrag",
    frequenz: input.frequenz,
    stichtag: { typ: "monatstag", wert: 1 },
    laufzeitVon: input.rechnungsdatum ?? today,
    positionen: clone(input.positionen ?? []),
    rabattGesamt: input.rabattGesamt ?? 0,
    steuersatz: input.steuersatz ?? 19,
    betreffVorlage: "{{lauf.zeitraum}}",
    textVorlage: input.introText ?? "",
    modus: "entwurf",
    status: "aktiv",
    notizen: input.notizen ?? undefined,
    erstelltAm: timestamp,
    geaendertAm: timestamp,
  };
  store.dauerauftraege.push(da);
  return da;
}

export function localPreviewGet<T>(path: string): T | null {
  const [cleanPath, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  if (cleanPath === "/auth/me") {
    return { user: { id: "preview-user", username: "lokal" }, expiresAt: new Date(Date.now() + 86400000).toISOString() } as T;
  }
  if (cleanPath === "/kunden") return previewKunden as T;
  if (cleanPath.startsWith("/kunden/")) {
    const id = cleanPath.split("/")[2];
    const kunde = previewKunden.find((k) => k.id === id);
    if (!kunde) return null;
    return {
      ...kunde,
      ansprechpartner: [],
      objekte: [],
      angebote: allAngebote().filter((a) => a.kundeId === id),
      rechnungen: allRechnungen().filter((r) => r.kundeId === id),
      dokumente: [],
      notizen: [],
    } as T;
  }
  if (cleanPath.endsWith("/zaehler") && cleanPath.startsWith("/kunden/")) {
    return { periode: month, naechsterStart: 1 } as T;
  }
  if (cleanPath === "/angebote") {
    const kundeId = params.get("kundeId");
    const status = params.get("status");
    return allAngebote().filter((a) => (!kundeId || a.kundeId === kundeId) && (!status || a.status === status)) as T;
  }
  if (cleanPath.startsWith("/angebote/")) {
    return (allAngebote().find((a) => a.id === cleanPath.split("/")[2]) ?? null) as T | null;
  }
  if (cleanPath === "/rechnungen") {
    const kundeId = params.get("kundeId");
    const status = params.get("status");
    return allRechnungen().filter((r) => (!kundeId || r.kundeId === kundeId) && (!status || r.status === status)) as T;
  }
  if (cleanPath.startsWith("/rechnungen/")) {
    return (allRechnungen().find((r) => r.id === cleanPath.split("/")[2]) ?? null) as T | null;
  }
  if (cleanPath === "/objekte") return [] as T;
  if (cleanPath === "/dokumente") return [] as T;
  if (cleanPath === "/protokolle") return [] as T;
  if (cleanPath === "/drive/uploads") return [] as T;
  if (cleanPath === "/email/versand") return [] as T;
  if (cleanPath === "/email/vorlagen") return [] as T;
  if (cleanPath === "/email/signaturen") return [] as T;
  if (cleanPath === "/einstellungen/smtp") return { host: "", port: 587, secure: false, user: "", passwortGesetzt: false, absenderName: "My Clean Center", absenderEmail: "" } as T;
  if (cleanPath === "/einstellungen/google-drive") return previewGoogleDrive as T;
  if (cleanPath === "/dashboard/kennzahlen") return previewDashboardKennzahlen() as T;
  if (cleanPath === "/dashboard/umsatz") return previewUmsatz() as T;
  if (cleanPath === "/dashboard/warnungen") return [] as T;
  if (cleanPath === "/dauerauftraege") return readStore().dauerauftraege as T;
  if (cleanPath.startsWith("/dauerauftraege/")) {
    const id = cleanPath.split("/")[2];
    const s = readStore();
    const da = s.dauerauftraege.find((d) => d.id === id);
    if (!da) return null;
    return {
      ...da,
      laeufe: s.dauerauftragLaeufe.filter((l) => l.dauerauftragId === id),
      sonderpositionen: s.dauerauftragSonderpos.filter((p) => p.dauerauftragId === id),
    } as T;
  }
  if (cleanPath === "/dauerauftrag-laeufe") {
    const status = params.get("status");
    const all = readStore().dauerauftragLaeufe;
    return (status ? all.filter((l) => l.status === status) : all) as T;
  }
  if (cleanPath === "/einstellungen/dauerauftrag") {
    return (readStore().dauerauftragEinstellungen ?? DA_DEFAULT_EINSTELLUNGEN) as T;
  }
  if (cleanPath === "/aktivitaeten") return [] as T;
  if (cleanPath === "/benachrichtigungen") return [] as T;
  if (cleanPath === "/einstellungen/firma") return (readStore().firma ?? previewFirma) as T;
  if (cleanPath === "/einstellungen/nummernkreise") return previewNummernkreise as T;
  return null;
}

export function localPreviewMutate<T>(method: string, path: string, body?: unknown): T | null {
  const cleanPath = path.split("?")[0];
  const store = readStore();
  const timestamp = new Date().toISOString();

  if (method === "POST" && cleanPath === "/drive/backfill") {
    return { ok: true, angebote: 0, rechnungen: 0, dokumente: 0, skipped: 0 } as T;
  }
  if (method === "POST" && cleanPath === "/drive/uploads/enqueue") {
    return { ok: true } as T;
  }

  if (method === "POST" && cleanPath === "/angebote") {
    const input = (body ?? {}) as Partial<Angebot>;
    const angebot: Angebot = {
      id: `preview-angebot-${crypto.randomUUID()}`,
      nummer: nextBelegnummer("angebot", input.kundeId ?? "preview-kunde-1"),
      kundeId: input.kundeId ?? "preview-kunde-1",
      objektId: input.objektId,
      ansprechpartnerId: input.ansprechpartnerId,
      titel: input.titel?.trim() || "Neues Angebot",
      introText: input.introText,
      outroText: input.outroText,
      positionen: clone(input.positionen ?? []),
      rabattGesamt: input.rabattGesamt ?? 0,
      steuersatz: input.steuersatz ?? 19,
      gueltigBis: input.gueltigBis,
      notizen: input.notizen,
      status: input.status ?? "entwurf",
      archiviert: false,
      optionen: input.optionen,
      erstelltAm: timestamp,
      geaendertAm: timestamp,
    };
    store.angebote.push(angebot);
    writeStore(store);
    return angebot as T;
  }

  if (method === "POST" && cleanPath === "/rechnungen") {
    const input = (body ?? {}) as Partial<Rechnung>;
    const rechnung: Rechnung = {
      id: `preview-rechnung-${crypto.randomUUID()}`,
      nummer: nextBelegnummer("rechnung", input.kundeId ?? "preview-kunde-1"),
      kundeId: input.kundeId ?? "preview-kunde-1",
      objektId: input.objektId,
      ansprechpartnerId: input.ansprechpartnerId,
      quellAngebotId: input.quellAngebotId,
      titel: input.titel?.trim() || "Neue Rechnung",
      introText: input.introText,
      outroText: input.outroText,
      positionen: clone(input.positionen ?? []),
      rabattGesamt: input.rabattGesamt ?? 0,
      steuersatz: input.steuersatz ?? 19,
      rechnungsdatum: input.rechnungsdatum ?? today,
      faelligkeitsdatum: input.faelligkeitsdatum ?? due,
      notizen: input.notizen,
      status: input.status ?? "entwurf",
      archiviert: false,
      zahlungen: clone(input.zahlungen ?? []),
      optionen: input.optionen,
      erstelltAm: timestamp,
      geaendertAm: timestamp,
    };
    store.rechnungen.push(rechnung);
    const opt = (input.optionen ?? {}) as {
      wiederkehrend?: boolean;
      wiederkehrendDetails?: { rhythmus?: string };
    };
    let dauerauftragNeu: { id: string; nummer: string } | undefined;
    if (opt.wiederkehrend === true) {
      const freq = mapRhythmusZuFrequenz(opt.wiederkehrendDetails?.rhythmus);
      const da = createPreviewDauerauftrag(
        store,
        {
          kundeId: rechnung.kundeId,
          objektId: rechnung.objektId,
          ansprechpartnerId: rechnung.ansprechpartnerId,
          bezeichnung: rechnung.titel,
          frequenz: freq,
          positionen: rechnung.positionen,
          rabattGesamt: rechnung.rabattGesamt,
          steuersatz: rechnung.steuersatz,
          rechnungsdatum: rechnung.rechnungsdatum,
          introText: rechnung.introText,
          outroText: rechnung.outroText,
        },
        timestamp,
      );
      dauerauftragNeu = { id: da.id, nummer: da.nummer };
      (rechnung as Rechnung & { dauerauftragId?: string }).dauerauftragId = da.id;
    }
    writeStore(store);
    return (dauerauftragNeu ? { ...rechnung, dauerauftragNeu } : rechnung) as T;
  }

  // ---------- Daueraufträge ----------

  if (method === "POST" && cleanPath === "/dauerauftraege") {
    const input = (body ?? {}) as Partial<Dauerauftrag> & { frequenz?: DauerauftragFrequenz };
    const da = createPreviewDauerauftrag(
      store,
      {
        kundeId: input.kundeId ?? "preview-kunde-1",
        objektId: input.objektId,
        ansprechpartnerId: input.ansprechpartnerId,
        bezeichnung: input.bezeichnung ?? "Dauerauftrag",
        frequenz: input.frequenz ?? "monatlich",
        positionen: input.positionen ?? [],
        rabattGesamt: input.rabattGesamt ?? 0,
        steuersatz: input.steuersatz ?? 19,
        rechnungsdatum: input.laufzeitVon,
        notizen: input.notizen ?? null,
      },
      timestamp,
    );
    writeStore(store);
    return da as T;
  }

  if (cleanPath.startsWith("/dauerauftraege/")) {
    const parts = cleanPath.split("/");
    const id = parts[2];
    const action = parts[3];
    const idx = store.dauerauftraege.findIndex((d) => d.id === id);

    if (method === "PATCH" && !action) {
      if (idx < 0) return null;
      const patch = (body ?? {}) as Partial<Dauerauftrag>;
      const updated: Dauerauftrag = {
        ...store.dauerauftraege[idx],
        ...patch,
        id: store.dauerauftraege[idx].id,
        nummer: store.dauerauftraege[idx].nummer,
        geaendertAm: timestamp,
      };
      store.dauerauftraege[idx] = updated;
      writeStore(store);
      return updated as T;
    }
    if (method === "DELETE" && !action) {
      if (idx < 0) return null;
      store.dauerauftraege.splice(idx, 1);
      store.dauerauftragLaeufe = store.dauerauftragLaeufe.filter((l) => l.dauerauftragId !== id);
      store.dauerauftragSonderpos = store.dauerauftragSonderpos.filter((p) => p.dauerauftragId !== id);
      writeStore(store);
      return {} as T;
    }
    if (method === "POST" && action === "pausieren") {
      if (idx < 0) return null;
      const b = (body ?? {}) as { bis?: string | null };
      store.dauerauftraege[idx] = {
        ...store.dauerauftraege[idx],
        status: "pausiert",
        pausiertBis: b.bis ?? undefined,
        geaendertAm: timestamp,
      };
      writeStore(store);
      return store.dauerauftraege[idx] as T;
    }
    if (method === "POST" && action === "beenden") {
      if (idx < 0) return null;
      const b = (body ?? {}) as { zum?: string };
      store.dauerauftraege[idx] = {
        ...store.dauerauftraege[idx],
        status: "beendet",
        laufzeitBis: b.zum ?? today,
        geaendertAm: timestamp,
      };
      writeStore(store);
      return store.dauerauftraege[idx] as T;
    }
    if (method === "POST" && action === "sofort-lauf") {
      if (idx < 0) return null;
      const da = store.dauerauftraege[idx];
      const b = (body ?? {}) as { periode?: string };
      const periode = b.periode ?? periodeFuerFrequenz(da.frequenz, new Date());
      const existing = store.dauerauftragLaeufe.find(
        (l) => l.dauerauftragId === da.id && l.periode === periode,
      );
      if (existing) return existing as T;
      // Neue Rechnung aus DA erzeugen
      const rechnung: Rechnung = {
        id: `preview-rechnung-${crypto.randomUUID()}`,
        nummer: nextBelegnummer("rechnung", da.kundeId),
        kundeId: da.kundeId,
        objektId: da.objektId,
        ansprechpartnerId: da.ansprechpartnerId,
        titel: `${da.bezeichnung} — ${periode}`,
        introText: da.textVorlage || undefined,
        positionen: clone(da.positionen),
        rabattGesamt: da.rabattGesamt,
        steuersatz: da.steuersatz,
        rechnungsdatum: today,
        faelligkeitsdatum: due,
        status: "entwurf",
        archiviert: false,
        zahlungen: [],
        erstelltAm: timestamp,
        geaendertAm: timestamp,
      } as Rechnung;
      (rechnung as Rechnung & { dauerauftragId?: string }).dauerauftragId = da.id;
      store.rechnungen.push(rechnung);
      const lauf: DauerauftragLauf = {
        id: `preview-lauf-${crypto.randomUUID()}`,
        dauerauftragId: da.id,
        periode,
        geplantFuer: today,
        ausgefuehrtAm: timestamp,
        rechnungId: rechnung.id,
        status: "erzeugt",
      };
      store.dauerauftragLaeufe.push(lauf);
      store.dauerauftraege[idx] = { ...da, letzteAusfuehrung: today, geaendertAm: timestamp };
      writeStore(store);
      return lauf as T;
    }
  }

  if (method === "POST" && cleanPath === "/dauerauftrag-sonderpositionen") {
    const input = (body ?? {}) as { dauerauftragId: string; fuerPeriode: string; position: DauerauftragSonderposition["position"] };
    const sp: DauerauftragSonderposition = {
      id: `preview-sopo-${crypto.randomUUID()}`,
      dauerauftragId: input.dauerauftragId,
      fuerPeriode: input.fuerPeriode,
      position: input.position,
    };
    store.dauerauftragSonderpos.push(sp);
    writeStore(store);
    return sp as T;
  }
  if (method === "DELETE" && cleanPath.startsWith("/dauerauftrag-sonderpositionen/")) {
    const id = cleanPath.split("/")[2];
    store.dauerauftragSonderpos = store.dauerauftragSonderpos.filter((p) => p.id !== id);
    writeStore(store);
    return {} as T;
  }

  if (method === "PATCH" && cleanPath === "/einstellungen/dauerauftrag") {
    const current = store.dauerauftragEinstellungen ?? DA_DEFAULT_EINSTELLUNGEN;
    const next = { ...current, ...(body as Partial<DauerauftragEinstellungen>) };
    store.dauerauftragEinstellungen = next;
    writeStore(store);
    return next as T;
  }

  if (method === "PATCH" && cleanPath === "/einstellungen/firma") {
    const current = store.firma ?? previewFirma;
    const next: Firmendaten = { ...current, ...(body as Partial<Firmendaten>) };
    store.firma = next;
    writeStore(store);
    return next as T;
  }

  return null;
}
