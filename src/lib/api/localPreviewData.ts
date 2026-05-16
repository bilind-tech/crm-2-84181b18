import type {
  Angebot,
  DashboardKennzahlen,
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
  firmenname: "My Clean Center",
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
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readStore(): PreviewStore {
  if (typeof window === "undefined") return { angebote: [], rechnungen: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { angebote: [], rechnungen: [] };
    const parsed = JSON.parse(raw) as Partial<PreviewStore>;
    return {
      angebote: Array.isArray(parsed.angebote) ? parsed.angebote : [],
      rechnungen: Array.isArray(parsed.rechnungen) ? parsed.rechnungen : [],
    };
  } catch {
    return { angebote: [], rechnungen: [] };
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

export const previewMahnungStatus = {
  einstellungen: {
    autoVorschlagAktiv: false,
    modus: "vorschlag",
    cronZeit: "09:00",
    nurAnWerktagen: true,
    benachrichtigungBeiVorschlag: true,
    benachrichtigungBeiAutoversand: false,
    stufen: [],
  },
  letzterLauf: null,
};

export const previewMahnEinstellungen = previewMahnungStatus.einstellungen;

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
  if (cleanPath === "/einstellungen/mahnung") return previewMahnEinstellungen as T;
  if (cleanPath === "/dashboard/kennzahlen") return previewDashboardKennzahlen() as T;
  if (cleanPath === "/dashboard/umsatz") return previewUmsatz() as T;
  if (cleanPath === "/dashboard/warnungen") return [] as T;
  if (cleanPath === "/dauerauftraege") return [] as T;
  if (cleanPath === "/dauerauftrag-laeufe") return [] as T;
  if (cleanPath === "/aktivitaeten") return [] as T;
  if (cleanPath === "/benachrichtigungen") return [] as T;
  if (cleanPath === "/einstellungen/firma") return previewFirma as T;
  if (cleanPath === "/einstellungen/nummernkreise") return previewNummernkreise as T;
  if (cleanPath === "/mahnung/status") return previewMahnungStatus as T;
  if (cleanPath === "/mahnung/laeufe") return [] as T;
  return null;
}

export function localPreviewMutate<T>(method: string, path: string, body?: unknown): T | null {
  const cleanPath = path.split("?")[0];
  const store = readStore();
  const timestamp = new Date().toISOString();

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
    writeStore(store);
    return rechnung as T;
  }

  return null;
}
