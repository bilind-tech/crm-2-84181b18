import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { Smartphone, Receipt, AlertTriangle, X, Upload, FolderPlus, ChevronRight, Home, FolderInput, MoreVertical, Trash2, RefreshCw } from "lucide-react";
import { useDokumente, useKunden, useObjekte } from "@/hooks/useApi";
import { useDriveRetry, useDriveDriftCheck, useOrdnerDriveStatus } from "@/hooks/useDriveSync";
import { formatEUR, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { FilterBar } from "@/routes/angebote";
import {
  DokumentUploadPanel,
  type DokumentUploadPanelHandle,
} from "@/components/dokumente/DokumentUploadPanel";
import { HandyScanDialog } from "@/components/dokumente/HandyScanDialog";
import { DokumentBearbeitenDialog } from "@/components/dokumente/DokumentBearbeitenDialog";
import { DokumentViewer } from "@/components/dokumente/DokumentViewer";
import { DriveSyncBadge } from "@/components/dokumente/DriveSyncBadge";
import { GlobalDriveSyncBadge } from "@/components/dokumente/GlobalDriveSyncBadge";
import { DokumentThumb } from "@/components/dokumente/DokumentThumb";
import { OrdnerBaum } from "@/components/dokumente/OrdnerBaum";
import { NeuerOrdnerDialog } from "@/components/dokumente/NeuerOrdnerDialog";
import { OrdnerLoeschenDialog } from "@/components/dokumente/OrdnerLoeschenDialog";
import { OrdnerUmbenennenDialog } from "@/components/dokumente/OrdnerUmbenennenDialog";
import { OrdnerPickerSheet } from "@/components/dokumente/OrdnerPickerSheet";
import { useDokumentOrdner, useUpdateOrdner, useBulkMoveDokumente } from "@/hooks/useDokumentOrdner";
import { ordnerPfad } from "@/lib/dokumente/ordnerApi";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDeleteDokument } from "@/hooks/useApi";
import { fristStatus, FRIST_LABEL, fristBadgeClass } from "@/lib/dokument/frist";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Dokument, DokumentOrdner } from "@/lib/api/types";

export const Route = createFileRoute("/dokumente")({
  component: Page,
  validateSearch: (s: Record<string, unknown>): { focus?: string; ordner?: string; recursive?: boolean } => ({
    focus: typeof s.focus === "string" ? s.focus : undefined,
    ordner: typeof s.ordner === "string" ? s.ordner : undefined,
    recursive: s.recursive === true || s.recursive === "true",
  }),
});

function Page() {
  const navigate = Route.useNavigate();
  const { focus, ordner: ordnerSearch, recursive } = Route.useSearch();
  // ordnerSearch: undefined = Root, "root" = explizit Root, sonst Ordner-ID
  const aktuellerOrdnerId: string | null =
    !ordnerSearch || ordnerSearch === "root" ? null : ordnerSearch;
  const { data: ordnerListe } = useDokumentOrdner();
  const { data: alle = [] } = useDokumente({
    ordnerId: recursive && aktuellerOrdnerId ? aktuellerOrdnerId : aktuellerOrdnerId,
    recursive: !!(recursive && aktuellerOrdnerId),
  });
  const { data: kunden = [] } = useKunden();
  const [filter, setFilter] = useState("alle");
  const [q, setQ] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [editing, setEditing] = useState<Dokument | null>(null);
  const [viewing, setViewing] = useState<Dokument | null>(null);
  const [kundeFilter, setKundeFilter] = useState<string>("alle");
  const [objektFilter, setObjektFilter] = useState<string>("alle");
  const [neuOrdnerParent, setNeuOrdnerParent] = useState<string | null | undefined>(undefined);
  const [loeschOrdner, setLoeschOrdner] = useState<DokumentOrdner | null>(null);
  const [umbenennOrdner, setUmbenennOrdner] = useState<DokumentOrdner | null>(null);
  const [verschiebeOrdner, setVerschiebeOrdner] = useState<DokumentOrdner | null>(null);
  const [verschiebeDokument, setVerschiebeDokument] = useState<Dokument | null>(null);
  const { data: objekteFuerFilter = [] } = useObjekte(
    kundeFilter !== "alle" ? kundeFilter : undefined,
  );
  const uploadRef = useRef<DokumentUploadPanelHandle>(null);
  const uploadPanelRef = useRef<HTMLDivElement>(null);
  const updateOrdner = useUpdateOrdner();
  const bulkMove = useBulkMoveDokumente();
  const deleteDokument = useDeleteDokument();
  const driveRetry = useDriveRetry();
  const driftCheck = useDriveDriftCheck();
  const { data: ordnerDriveStatus } = useOrdnerDriveStatus();
  const retryDok = (id: string) => driveRetry.mutate({ belegArt: "dokument", belegId: id });

  const pfad = useMemo(
    () => ordnerPfad(ordnerListe?.ordner ?? [], aktuellerOrdnerId),
    [ordnerListe, aktuellerOrdnerId],
  );

  function setOrdner(id: string | null) {
    navigate({ search: (s: Record<string, unknown>) => ({ ...s, ordner: id ?? undefined, recursive: undefined }) });
  }
  function setRecursive(v: boolean) {
    navigate({ search: (s: Record<string, unknown>) => ({ ...s, recursive: v ? true : undefined }) });
  }

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

  const tabCounts = useMemo(
    () => ({
      alle: alle.length,
      offen: alle.filter((d) => {
        const s = fristStatus(d);
        return s === "offen" || s === "bald" || s === "ueberfaellig";
      }).length,
      ueberfaellig: alle.filter((d) => fristStatus(d) === "ueberfaellig").length,
      erledigt: alle.filter((d) => fristStatus(d) === "erledigt").length,
      bilder: alle.filter((d) => d.typ === "bild").length,
      steuer: alle.filter((d) => d.steuerrelevant).length,
    }),
    [alle],
  );

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
      const prio: Record<string, number> = {
        ueberfaellig: 0,
        bald: 1,
        offen: 2,
        ohne: 3,
        erledigt: 4,
      };
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => driftCheck.mutate()}
              disabled={driftCheck.isPending}
              className="rounded-lg"
              title="Alles gegen Google Drive abgleichen"
            >
              <RefreshCw className={`mr-1.5 h-4 w-4 ${driftCheck.isPending ? "animate-spin" : ""}`} />
              Drive prüfen
            </Button>
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

      {aktuellerOrdnerId && (
        <div className="flex justify-end">
          <label className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={!!recursive} onChange={(e) => setRecursive(e.target.checked)} />
            inkl. Unterordner
          </label>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Ordner-Sidebar */}
        <aside className="hidden lg:block">
          <div className="rounded-2xl border border-border bg-card p-2">
            <OrdnerBaum
              daten={ordnerListe}
              aktivId={aktuellerOrdnerId}
              onSelect={setOrdner}
              onNeuerOrdner={(p) => setNeuOrdnerParent(p)}
              onUmbenennen={setUmbenennOrdner}
              onVerschieben={setVerschiebeOrdner}
              onLoeschen={setLoeschOrdner}
              driveStatus={ordnerDriveStatus}
            />
          </div>
        </aside>

        <div className="space-y-4 min-w-0">
      <div ref={uploadPanelRef}>
        <DokumentUploadPanel ref={uploadRef} defaultMeta={{ ordnerId: aktuellerOrdnerId ?? undefined }} key={aktuellerOrdnerId ?? "root"} />
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
          <SelectTrigger className="h-9 sm:w-64">
            <SelectValue placeholder="Alle Kunden" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Kunden</SelectItem>
            {kunden.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim() || k.nummer}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={objektFilter}
          onValueChange={setObjektFilter}
          disabled={kundeFilter === "alle"}
        >
          <SelectTrigger className="h-9 sm:w-64">
            <SelectValue
              placeholder={kundeFilter === "alle" ? "Erst Kunde wählen" : "Alle Objekte"}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Objekte</SelectItem>
            {objekteFuerFilter.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
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
            {aktuellerOrdnerId
              ? "Dieser Ordner ist leer. Lade Dokumente hoch oder verschiebe welche hierher."
              : "Lade dein erstes Dokument oben per Drag & Drop hoch — oder scanne es mit dem Handy."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobil: Karten-Liste */}
          <div className="grid gap-3 sm:hidden">
            {filtered.map((d) => (
              <DokumentCard
                key={d.id}
                d={d}
                kundeName={d.kundeId ? kundeMap.get(d.kundeId) : undefined}
                onClick={() => setViewing(d)}
                onMove={() => setVerschiebeDokument(d)}
                onDelete={() => { if (confirm("Dokument löschen?")) deleteDokument.mutate(d.id); }}
              />
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
                  <th className="px-2 py-3" />
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
                              <DriveSyncBadge
                                dokument={d}
                                onRetry={() => retryDok(d.id)}
                                retryPending={driveRetry.isPending && driveRetry.variables?.belegId === d.id}
                              />
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
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${fristBadgeClass(status)}`}
                          >
                            {status === "ueberfaellig" && (
                              <AlertTriangle className="mr-1 h-3 w-3" />
                            )}
                            {FRIST_LABEL[status]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {d.betrag ? formatEUR(d.betrag) : "—"}
                      </td>
                      <td className="px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setVerschiebeDokument(d)}>
                              <FolderInput className="mr-2 h-4 w-4" /> Verschieben nach…
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm("Dokument löschen?")) deleteDokument.mutate(d.id); }}>
                              <Trash2 className="mr-2 h-4 w-4" /> Löschen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
        </div>
      </div>

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

      {/* Ordner-Dialoge */}
      <NeuerOrdnerDialog
        open={neuOrdnerParent !== undefined}
        onOpenChange={(v) => { if (!v) setNeuOrdnerParent(undefined); }}
        parentId={neuOrdnerParent ?? null}
        parentName={
          neuOrdnerParent
            ? ordnerListe?.ordner.find((o) => o.id === neuOrdnerParent)?.name
            : undefined
        }
      />
      <OrdnerUmbenennenDialog
        ordner={umbenennOrdner}
        open={!!umbenennOrdner}
        onOpenChange={(v) => !v && setUmbenennOrdner(null)}
      />
      <OrdnerLoeschenDialog
        ordner={loeschOrdner}
        open={!!loeschOrdner}
        onOpenChange={(v) => !v && setLoeschOrdner(null)}
        onDeleted={() => { if (loeschOrdner?.id === aktuellerOrdnerId) setOrdner(loeschOrdner?.parentId ?? null); }}
      />
      <OrdnerPickerSheet
        open={!!verschiebeOrdner}
        onOpenChange={(v) => !v && setVerschiebeOrdner(null)}
        excludeId={verschiebeOrdner?.id}
        title={`„${verschiebeOrdner?.name ?? ""}" verschieben nach…`}
        onSelect={(zielId) => {
          if (!verschiebeOrdner) return;
          updateOrdner.mutate(
            { id: verschiebeOrdner.id, parentId: zielId },
            { onSuccess: () => setVerschiebeOrdner(null) },
          );
        }}
      />
      <OrdnerPickerSheet
        open={!!verschiebeDokument}
        onOpenChange={(v) => !v && setVerschiebeDokument(null)}
        title={`„${verschiebeDokument?.titel ?? ""}" verschieben nach…`}
        onSelect={(zielId) => {
          if (!verschiebeDokument) return;
          bulkMove.mutate(
            { ids: [verschiebeDokument.id], ordnerId: zielId },
            { onSuccess: () => setVerschiebeDokument(null) },
          );
        }}
      />
    </div>
  );
}

function DokumentCard({
  d,
  kundeName,
  onClick,
  onMove,
  onDelete,
}: {
  d: Dokument;
  kundeName?: string;
  onClick: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const status = fristStatus(d);
  return (
    <div className="flex w-full gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition active:bg-muted">
      <button type="button" onClick={onClick} className="flex flex-1 gap-3 text-left">
      <DokumentThumb dokument={d} className="h-16 w-16" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{d.titel}</p>
          <DriveSyncBadge dokument={d} />
        </div>
        <p className="truncate text-xs text-muted-foreground">{d.dateiname}</p>
        {kundeName && <p className="truncate text-xs text-muted-foreground">{kundeName}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {status !== "ohne" && (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${fristBadgeClass(status)}`}
            >
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
      {d.betrag ? (
        <div className="text-right text-sm font-semibold">{formatEUR(d.betrag)}</div>
      ) : null}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"><MoreVertical className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onMove}><FolderInput className="mr-2 h-4 w-4" /> Verschieben…</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" /> Löschen</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
