// Stapel-Upload-Panel mit Live-Progress, gemeinsamen Meta-Feldern und
// 3 parallelen Uploads. Wird auf /dokumente, in Kunden- und Objekt-Detail
// genutzt. Kein automatischer Versand, kein Auto-Anhang — alles auf
// expliziten Klick "Alle hochladen".

import {
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  forwardRef,
} from "react";
import { FileUp, FileText, Image as ImageIcon, X, RefreshCw, ChevronDown, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ACCEPT_PATTERN, MAX_BYTES, uploadDokument } from "@/lib/dokument/upload";
import { runWithConcurrency } from "@/lib/util/concurrency";
import { useKunden, useObjekte } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Dokument, DokumentTyp } from "@/lib/api/types";

const ACCEPT_MIMES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf",
]);
const CONCURRENCY = 3;

type Status = "wartet" | "laedt" | "fertig" | "fehler" | "ungueltig";

interface StapelItem {
  id: string;
  file: File;
  previewUrl?: string;
  status: Status;
  progress: number;
  fehler?: string;
  result?: Dokument;
}

interface BulkMeta {
  kundeId?: string;
  objektId?: string;
  typ?: DokumentTyp;
  faelligAm?: string;
  steuerrelevant?: boolean;
}

export interface DokumentUploadPanelProps {
  /** Vorgegebener Kunde — Felder werden im Panel ausgeblendet. */
  kundeId?: string;
  /** Vorgegebenes Objekt — Felder werden im Panel ausgeblendet. */
  objektId?: string;
  /** Optionaler Default für die Bulk-Felder. */
  defaultMeta?: BulkMeta;
  /** Callback nach erfolgreichem Upload aller Dateien. */
  onUploaded?: (dokumente: Dokument[]) => void;
  /** Kompakte Variante (nur Button + ggf. Stapel). */
  compact?: boolean;
  className?: string;
}

export interface DokumentUploadPanelHandle {
  /** Externe API: Dateien (z. B. aus GlobalDropZone) hinzufügen. */
  addFiles: (files: FileList | File[]) => void;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function validateFile(file: File): { ok: boolean; grund?: string } {
  if (file.size > MAX_BYTES) {
    return { ok: false, grund: `Größer als 20 MB (${(file.size / 1024 / 1024).toFixed(1)} MB)` };
  }
  const mime = file.type || "";
  if (!ACCEPT_MIMES.has(mime) && !mime.startsWith("image/")) {
    return { ok: false, grund: `Dateityp ${mime || "unbekannt"} nicht erlaubt` };
  }
  return { ok: true };
}

function makePreview(file: File): string | undefined {
  if (file.type.startsWith("image/")) {
    try { return URL.createObjectURL(file); } catch { return undefined; }
  }
  return undefined;
}

export const DokumentUploadPanel = forwardRef<DokumentUploadPanelHandle, DokumentUploadPanelProps>(
  function DokumentUploadPanel(props, ref) {
    const { kundeId, objektId, defaultMeta, onUploaded, compact, className } = props;
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [drag, setDrag] = useState(false);
    const [items, setItems] = useState<StapelItem[]>([]);
    const [busy, setBusy] = useState(false);
    const [metaOffen, setMetaOffen] = useState(false);
    const qc = useQueryClient();

    const [bulk, setBulk] = useState<BulkMeta>({
      kundeId: kundeId ?? defaultMeta?.kundeId,
      objektId: objektId ?? defaultMeta?.objektId,
      typ: defaultMeta?.typ,
      faelligAm: defaultMeta?.faelligAm,
      steuerrelevant: defaultMeta?.steuerrelevant,
    });

    const { data: kunden = [] } = useKunden();
    const { data: objekte = [] } = useObjekte(bulk.kundeId);

    // Cleanup ObjectURLs
    useEffect(() => {
      return () => {
        for (const it of items) if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function addFiles(list: FileList | File[]): void {
      const arr = Array.from(list);
      if (arr.length === 0) return;
      const neu: StapelItem[] = arr.map((file) => {
        const v = validateFile(file);
        return {
          id: uid(),
          file,
          previewUrl: makePreview(file),
          status: v.ok ? "wartet" : "ungueltig",
          progress: 0,
          fehler: v.grund,
        };
      });
      setItems((prev) => [...prev, ...neu]);
    }

    useImperativeHandle(ref, () => ({ addFiles }));

    function entferne(id: string): void {
      setItems((prev) => {
        const removed = prev.find((p) => p.id === id);
        if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        return prev.filter((p) => p.id !== id);
      });
    }

    function leeren(): void {
      for (const it of items) if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      setItems([]);
    }

    function setItem(id: string, patch: Partial<StapelItem>): void {
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    }

    async function uploadOne(item: StapelItem): Promise<Dokument> {
      setItem(item.id, { status: "laedt", progress: 0, fehler: undefined });
      const meta = {
        kundeId: kundeId ?? bulk.kundeId,
        objektId: objektId ?? bulk.objektId,
        typ: bulk.typ,
        faelligAm: bulk.faelligAm || undefined,
        steuerrelevant: bulk.steuerrelevant,
      };
      const dok = await uploadDokument(item.file, meta, {
        onProgress: (r) => setItem(item.id, { progress: r }),
      });
      setItem(item.id, { status: "fertig", progress: 1, result: dok });
      return dok;
    }

    async function alleHochladen(): Promise<void> {
      const offen = items.filter((it) => it.status === "wartet" || it.status === "fehler");
      if (offen.length === 0) return;
      setBusy(true);
      const results = await runWithConcurrency(offen, CONCURRENCY, async (it) => {
        try {
          return await uploadOne(it);
        } catch (e) {
          setItem(it.id, {
            status: "fehler",
            fehler: e instanceof Error ? e.message : "Upload fehlgeschlagen",
          });
          throw e;
        }
      });
      setBusy(false);
      const ok = results.filter((r) => r.ok).length;
      const fehler = results.length - ok;
      qc.invalidateQueries({ queryKey: ["dokumente"] });
      if (kundeId) qc.invalidateQueries({ queryKey: ["dokumente", "kunde", kundeId] });
      if (ok > 0) {
        toast.success(
          fehler === 0
            ? `${ok} Dokument${ok === 1 ? "" : "e"} hochgeladen`
            : `${ok} hochgeladen, ${fehler} fehlgeschlagen`,
        );
      } else if (fehler > 0) {
        toast.error("Kein Dokument hochgeladen");
      }
      const okDocs = results
        .filter((r): r is { ok: true; value: Dokument } => r.ok)
        .map((r) => r.value);
      if (okDocs.length > 0) onUploaded?.(okDocs);
    }

    function onChange(e: ChangeEvent<HTMLInputElement>): void {
      if (e.target.files) addFiles(e.target.files);
      e.target.value = "";
    }

    function onDrop(e: DragEvent): void {
      e.preventDefault();
      setDrag(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    }

    const wartendCount = items.filter((it) => it.status === "wartet" || it.status === "fehler").length;
    const showBulk = !kundeId; // Wenn schon am Kunden, müssen wir Kunde nicht abfragen

    const hidden = (
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={ACCEPT_PATTERN}
        className="sr-only"
        onChange={onChange}
      />
    );

    return (
      <div className={cn("space-y-4", className)}>
        {hidden}

        {/* Drop-Zone */}
        {!compact && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card p-6 text-center transition sm:p-10",
              drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/30",
              busy && "pointer-events-none opacity-70",
            )}
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileUp className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold">Dateien hierher ziehen oder klicken</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Bilder oder PDF · jeweils bis 20 MB · mehrere möglich
            </p>
          </div>
        )}

        {compact && (
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-xl"
            disabled={busy}
          >
            <Upload className="mr-2 h-4 w-4" />
            Dateien wählen
          </Button>
        )}

        {/* Stapel */}
        {items.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
            {items.map((it) => (
              <StapelZeile key={it.id} item={it} onRemove={() => entferne(it.id)} onRetry={() => uploadOne(it).catch(() => {/* state schon gesetzt */})} />
            ))}
          </div>
        )}

        {/* Gemeinsame Meta — nur sichtbar wenn nicht im Kunden-Kontext */}
        {items.length > 0 && showBulk && (
          <div className="rounded-2xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setMetaOffen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"
            >
              <span>Allen Dokumenten zuweisen <span className="text-muted-foreground">(optional)</span></span>
              <ChevronDown className={cn("h-4 w-4 transition", metaOffen && "rotate-180")} />
            </button>
            {metaOffen && (
              <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Kunde</Label>
                  <Select
                    value={bulk.kundeId ?? "none"}
                    onValueChange={(v) => setBulk((b) => ({ ...b, kundeId: v === "none" ? undefined : v, objektId: undefined }))}
                  >
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Kein Kunde —</SelectItem>
                      {kunden.map((k) => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim() || k.nummer}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Objekt</Label>
                  <Select
                    value={bulk.objektId ?? "none"}
                    onValueChange={(v) => setBulk((b) => ({ ...b, objektId: v === "none" ? undefined : v }))}
                    disabled={!bulk.kundeId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={bulk.kundeId ? "—" : "Erst Kunde wählen"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Kein Objekt —</SelectItem>
                      {objekte.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Typ</Label>
                  <Select
                    value={bulk.typ ?? "auto"}
                    onValueChange={(v) => setBulk((b) => ({ ...b, typ: v === "auto" ? undefined : (v as DokumentTyp) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automatisch</SelectItem>
                      <SelectItem value="rechnung">Rechnung</SelectItem>
                      <SelectItem value="quittung">Quittung</SelectItem>
                      <SelectItem value="bild">Bild</SelectItem>
                      <SelectItem value="vertrag">Vertrag</SelectItem>
                      <SelectItem value="sonstiges">Sonstiges</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Fällig am</Label>
                  <Input
                    type="date"
                    value={bulk.faelligAm ?? ""}
                    onChange={(e) => setBulk((b) => ({ ...b, faelligAm: e.target.value || undefined }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3 sm:col-span-2">
                  <div>
                    <p className="text-sm font-medium">Steuerrelevant</p>
                    <p className="text-xs text-muted-foreground">Für die Jahres-Übersicht markieren.</p>
                  </div>
                  <Switch
                    checked={!!bulk.steuerrelevant}
                    onCheckedChange={(v) => setBulk((b) => ({ ...b, steuerrelevant: v }))}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Aktionen */}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={leeren} disabled={busy} className="rounded-xl">
              Liste leeren
            </Button>
            <Button
              type="button"
              onClick={alleHochladen}
              disabled={busy || wartendCount === 0}
              className="rounded-xl"
            >
              <Upload className="mr-2 h-4 w-4" />
              {busy ? "Lädt hoch…" : `Alle hochladen${wartendCount > 0 ? ` (${wartendCount})` : ""}`}
            </Button>
          </div>
        )}
      </div>
    );
  },
);

function StapelZeile({
  item, onRemove, onRetry,
}: {
  item: StapelItem;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const istBild = item.file.type.startsWith("image/");
  const sizeMb = (item.file.size / 1024 / 1024).toFixed(1);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-2 sm:p-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : istBild ? (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{item.file.name}</p>
          <span className="shrink-0 text-xs text-muted-foreground">{sizeMb} MB</span>
        </div>
        <div className="mt-1">
          <StatusZeile item={item} />
        </div>
      </div>
      {(item.status === "fehler" || item.status === "wartet") && item.status === "fehler" && (
        <Button type="button" variant="ghost" size="icon" onClick={onRetry} className="h-8 w-8" title="Erneut">
          <RefreshCw className="h-4 w-4" />
        </Button>
      )}
      {item.status !== "laedt" && (
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="h-8 w-8" title="Entfernen">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function StatusZeile({ item }: { item: StapelItem }) {
  if (item.status === "ungueltig") {
    return <p className="text-xs text-destructive">{item.fehler ?? "Ungültig"}</p>;
  }
  if (item.status === "fehler") {
    return <p className="text-xs text-destructive">Fehler: {item.fehler ?? "Upload fehlgeschlagen"}</p>;
  }
  if (item.status === "fertig") {
    return <p className="text-xs text-emerald-600 dark:text-emerald-400">Hochgeladen</p>;
  }
  if (item.status === "laedt") {
    const pct = Math.round(item.progress * 100);
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
      </div>
    );
  }
  return <p className="text-xs text-muted-foreground">Bereit zum Hochladen</p>;
}
