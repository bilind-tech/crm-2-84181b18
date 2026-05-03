import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { Smartphone, Receipt, AlertTriangle, X, Upload } from "lucide-react";
import { useDokumente, useKunden, useObjekte } from "@/hooks/useApi";
import { formatEUR, formatDate } from "@/lib/format";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { FilterBar } from "@/routes/angebote";
import { DokumentUploadPanel, type DokumentUploadPanelHandle } from "@/components/dokumente/DokumentUploadPanel";
import { HandyScanDialog } from "@/components/dokumente/HandyScanDialog";
import { DokumentBearbeitenDialog } from "@/components/dokumente/DokumentBearbeitenDialog";
import { DokumentViewer } from "@/components/dokumente/DokumentViewer";
import { DriveSyncBadge } from "@/components/dokumente/DriveSyncBadge";
import { GlobalDriveSyncBadge } from "@/components/dokumente/GlobalDriveSyncBadge";
import { DokumentThumb } from "@/components/dokumente/DokumentThumb";
import { fristStatus, FRIST_LABEL, fristBadgeClass } from "@/lib/dokument/frist";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Dokument } from "@/lib/api/types";

export const Route = createFileRoute("/dokumente")({
  component: Page,
  validateSearch: (s: Record<string, unknown>): { focus?: string } => ({
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
});

function Page() {
  const { focus } = Route.useSearch();
  const { data: alle = [] } = useDokumente();
  const { data: kunden = [] } = useKunden();
  const [filter, setFilter] = useState("alle");
  const [q, setQ] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [editing, setEditing] = useState<Dokument | null>(null);
  const [viewing, setViewing] = useState<Dokument | null>(null);
  const [kundeFilter, setKundeFilter] = useState<string>("alle");
  const [objektFilter, setObjektFilter] = useState<string>("alle");
  const { data: objekteFuerFilter = [] } = useObjekte(
    kundeFilter !== "alle" ? kundeFilter : undefined,
  );
  const jahr = new Date().getFullYear();
  const uploadRef = useRef<DokumentUploadPanelHandle>(null);
  const uploadPanelRef = useRef<HTMLDivElement>(null);

  // Aus globaler Suche: gewünschtes Dokument öffnen, sobald die Liste geladen ist.
  useEffect(() => {
    if (!focus || alle.length === 0) return;
    const dok = alle.find((d) => d.id === focus);
    if (dok) setViewing(dok);
  }, [focus, alle]);

  const handlePickFiles = () => {
    uploadPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    uploadRef.current?.openPicker();
  };

  const kundeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const k of kunden) {
      m.set(k.id, k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim() || k.nummer);
    }
    return m;
  }, [kunden]);

  const counts = useMemo(() => {
    const ueberfaellig = alle.filter((d) => fristStatus(d) === "ueberfaellig").length;
    const offen = alle.filter((d) => {
      const s = fristStatus(d);
      return s === "offen" || s === "bald" || s === "ueberfaellig";
    }).length;
    const steuer = alle.filter((d) => d.steuerrelevant && d.dokumentdatum?.startsWith(String(jahr)));
    return {
      gesamt: alle.length,
      offen,
      ueberfaellig,
      steuerrelevant: steuer.length,
      summe: steuer.reduce((a, d) => a + (d.betrag ?? 0), 0),
    };
  }, [alle, jahr]);

  const tabCounts = useMemo(() => ({
    alle: alle.length,
    offen: alle.filter((d) => {
      const s = fristStatus(d);
      return s === "offen" || s === "bald" || s === "ueberfaellig";
    }).length,
    ueberfaellig: alle.filter((d) => fristStatus(d) === "ueberfaellig").length,
    erledigt: alle.filter((d) => fristStatus(d) === "erledigt").length,
    bilder: alle.filter((d) => d.typ === "bild").length,
    steuer: alle.filter((d) => d.steuerrelevant).length,
  }), [alle]);

  const filtered = useMemo(() => {
    let list = alle;
    if (filter === "offen") {
      list = list.filter((d) => {
        const s = fristStatus(d);
        return s === "offen" || s === "bald" || s === "ueberfaellig";
      });
    } else if (filter === "ueberfaellig") {
      list = list.filter((d) => fristStatus(d) === "ueberfaellig");
    } else if (filter === "erledigt") {
      list = list.filter((d) => fristStatus(d) === "erledigt");
    } else if (filter === "bilder") {
      list = list.filter((d) => d.typ === "bild");
    } else if (filter === "steuer") {
      list = list.filter((d) => d.steuerrelevant);
    }
    if (kundeFilter !== "alle") list = list.filter((d) => d.kundeId === kundeFilter);
    if (objektFilter !== "alle") list = list.filter((d) => d.objektId === objektFilter);
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter((d) => {
        const kundenName = d.kundeId ? (kundeMap.get(d.kundeId) ?? "").toLowerCase() : "";
        return (
          d.titel.toLowerCase().includes(t) ||
          d.dateiname.toLowerCase().includes(t) ||
          (d.beschreibung ?? "").toLowerCase().includes(t) ||
          kundenName.includes(t)
        );
      });
    }
    return [...list].sort((a, b) => {
      // Überfällige zuerst, dann nach Frist, dann nach Hochgeladen-Datum
      const sa = fristStatus(a);
      const sb = fristStatus(b);
      const prio: Record<string, number> = { ueberfaellig: 0, bald: 1, offen: 2, ohne: 3, erledigt: 4 };
      if (prio[sa] !== prio[sb]) return prio[sa] - prio[sb];
      return new Date(b.hochgeladenAm).getTime() - new Date(a.hochgeladenAm).getTime();
    });
  }, [alle, filter, q, kundeFilter, objektFilter, kundeMap]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dokumente"
        subtitle="Quittungen, Rechnungen und Belege zentral ablegen — mit Frist und Erinnerung."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <GlobalDriveSyncBadge dokumente={alle} />
            <PrimaryAction
              icon={Smartphone}
              label="Vom Handy scannen"
              onClick={() => setScanOpen(true)}
            />
            <Button onClick={handlePickFiles} className="rounded-xl">
              <Upload className="mr-2 h-4 w-4" />
              Datei wählen
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Dokumente gesamt" value={counts.gesamt} tone="primary" />
        <KpiCard label="Offen" value={counts.offen} tone={counts.offen > 0 ? "warning" : "default"} />
        <KpiCard label="Überfällig" value={counts.ueberfaellig} tone={counts.ueberfaellig > 0 ? "danger" : "default"} />
        <KpiCard label={`Steuerrelevant ${jahr}`} value={counts.steuerrelevant} tone="success" sublabel={formatEUR(counts.summe)} />
      </div>

      <div ref={uploadPanelRef}>
        <DokumentUploadPanel ref={uploadRef} />
      </div>
      <FilterBar
        filter={filter}
        setFilter={setFilter}
        q={q}
        setQ={setQ}
        tabs={[
          { value: "alle", label: "Alle", count: tabCounts.alle },
          { value: "offen", label: "Offen", count: tabCounts.offen },
          { value: "ueberfaellig", label: "Überfällig", count: tabCounts.ueberfaellig },
          { value: "erledigt", label: "Erledigt", count: tabCounts.erledigt },
          { value: "bilder", label: "Bilder", count: tabCounts.bilder },
          { value: "steuer", label: "Steuer", count: tabCounts.steuer },
        ]}
        placeholder="Suche nach Titel, Dateiname, Beschreibung, Kunde…"
      />

      {/* Kunde + Objekt Filter */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:p-2">
        <Select
          value={kundeFilter}
          onValueChange={(v) => {
            setKundeFilter(v);
            setObjektFilter("alle");
          }}
        >
          <SelectTrigger className="h-9 sm:w-64"><SelectValue placeholder="Alle Kunden" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Kunden</SelectItem>
            {kunden.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim() || k.nummer}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={objektFilter} onValueChange={setObjektFilter} disabled={kundeFilter === "alle"}>
          <SelectTrigger className="h-9 sm:w-64">
            <SelectValue placeholder={kundeFilter === "alle" ? "Erst Kunde wählen" : "Alle Objekte"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Objekte</SelectItem>
            {objekteFuerFilter.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(kundeFilter !== "alle" || objektFilter !== "alle") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setKundeFilter("alle");
              setObjektFilter("alle");
            }}
            className="rounded-lg"
          >
            <X className="mr-1 h-4 w-4" /> Filter zurücksetzen
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Receipt className="h-7 w-7" />
          </div>
          <p className="text-base font-semibold">Keine Dokumente</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Lade dein erstes Dokument oben per Drag & Drop hoch — oder scanne es mit dem Handy.
          </p>
        </div>
      ) : (
        <>
          {/* Mobil: Karten-Liste */}
          <div className="grid gap-3 sm:hidden">
            {filtered.map((d) => (
              <DokumentCard key={d.id} d={d} kundeName={d.kundeId ? kundeMap.get(d.kundeId) : undefined} onClick={() => setViewing(d)} />
            ))}
          </div>

          {/* Desktop: Tabelle */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Titel</th>
                  <th className="px-4 py-3 font-medium">Typ</th>
                  <th className="px-4 py-3 font-medium">Kunde</th>
                  <th className="px-4 py-3 font-medium">Frist</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const status = fristStatus(d);
                  const kundenName = d.kundeId ? kundeMap.get(d.kundeId) : undefined;
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setViewing(d)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <DokumentThumb dokument={d} className="h-10 w-10" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate font-medium">{d.titel}</p>
                              <DriveSyncBadge dokument={d} />
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{d.dateiname}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{d.typ}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {kundenName ?? <span className="text-xs italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {d.faelligAm ? formatDate(d.faelligAm) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {status !== "ohne" && (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${fristBadgeClass(status)}`}>
                            {status === "ueberfaellig" && <AlertTriangle className="mr-1 h-3 w-3" />}
                            {FRIST_LABEL[status]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{d.betrag ? formatEUR(d.betrag) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <HandyScanDialog open={scanOpen} onOpenChange={setScanOpen} />
      <DokumentViewer
        dokument={viewing}
        open={!!viewing}
        onOpenChange={(v) => !v && setViewing(null)}
        onEdit={(d) => setEditing(d)}
      />
      <DokumentBearbeitenDialog
        dokument={editing}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
      />
    </div>
  );
}

function DokumentCard({
  d,
  kundeName,
  onClick,
}: {
  d: Dokument;
  kundeName?: string;
  onClick: () => void;
}) {
  const status = fristStatus(d);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition active:bg-muted"
    >
      <DokumentThumb dokument={d} className="h-16 w-16" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{d.titel}</p>
          <DriveSyncBadge dokument={d} />
        </div>
        <p className="truncate text-xs text-muted-foreground">{d.dateiname}</p>
        {kundeName && (
          <p className="truncate text-xs text-muted-foreground">{kundeName}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {status !== "ohne" && (
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${fristBadgeClass(status)}`}>
              {status === "ueberfaellig" && <AlertTriangle className="mr-0.5 h-3 w-3" />}
              {FRIST_LABEL[status]}
            </span>
          )}
          {d.faelligAm && status !== "erledigt" && (
            <span className="text-muted-foreground">bis {formatDate(d.faelligAm)}</span>
          )}
          {!d.faelligAm && d.dokumentdatum && (
            <span className="text-muted-foreground">{formatDate(d.dokumentdatum)}</span>
          )}
        </div>
      </div>
      {d.betrag ? <div className="text-right text-sm font-semibold">{formatEUR(d.betrag)}</div> : null}
    </button>
  );
}
