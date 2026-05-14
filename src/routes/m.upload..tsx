import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, Trash2, Check, Loader2, FolderOpen, FileText, AlertTriangle, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { uploadDokumentToSessionMitProgress, MAX_BYTES } from "@/lib/dokument/upload";

export const Route = createFileRoute("/m/upload/")({
  component: MobileUploadPage,
});

type Status = "wartet" | "laeuft" | "fertig" | "fehler";

interface DateiEntry {
  id: string;
  file: File;
  previewUrl: string;
  istBild: boolean;
  status: Status;
  progress: number;
  versuche: number;
  fehler?: string;
}

const MAX_PARALLEL = 2;
const MAX_VERSUCHE = 3;

// FileButton ist absichtlich AUF MODUL-EBENE definiert (stabiler Komponententyp).
// Innerhalb der Page-Funktion definiert würde iOS Safari den <input type="file">
// bei jedem Re-Render unmounten und der `change`-Event käme nicht zuverlässig an.
function FileButton({
  icon: Icon,
  label,
  accept,
  capture,
  multiple,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  accept: string;
  capture?: "environment" | "user";
  multiple?: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="relative">
      <div
        className={
          "pointer-events-none flex h-14 w-full items-center justify-center gap-2 rounded-lg px-5 text-base font-semibold text-white " +
          "bg-[linear-gradient(180deg,#3B82F6_0%,#2563EB_55%,#1D4ED8_100%)] " +
          "shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_22px_-8px_rgba(37,99,235,0.55),0_1px_2px_rgba(15,23,42,0.18)] " +
          "ring-1 ring-inset ring-white/15"
        }
      >
        <Icon className="h-5 w-5" />
        <span>{label}</span>
      </div>
      <input
        type="file"
        accept={accept}
        {...(capture ? { capture } : {})}
        {...(multiple ? { multiple: true } : {})}
        onChange={onChange}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={label}
      />
    </div>
  );
}

function MobileUploadPage() {
  const { session: token } = Route.useParams();
  const [dateien, setDateien] = useState<DateiEntry[]>([]);
  const dateienRef = useRef<DateiEntry[]>([]);
  dateienRef.current = dateien;

  const updateEntry = useCallback((id: string, patch: Partial<DateiEntry>) => {
    setDateien((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const starteUpload = useCallback(
    async (id: string) => {
      const e = dateienRef.current.find((x) => x.id === id);
      if (!e) return;
      updateEntry(id, { status: "laeuft", progress: 0, fehler: undefined });
      const stamp = new Date();
      const datum = stamp.toISOString().slice(0, 10);
      const titel = e.istBild
        ? `Foto ${stamp.toLocaleDateString("de-DE")} ${stamp
            .toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`
        : e.file.name.replace(/\.[^.]+$/, "");
      try {
        await uploadDokumentToSessionMitProgress(
          token,
          e.file,
          { titel, dokumentdatum: datum, quelle: "handy-scan", steuerrelevant: false },
          (ratio) => updateEntry(id, { progress: ratio }),
        );
        if (e.previewUrl) {
          // Preview behalten für Anzeige – aber später beim Entfernen revoken.
        }
        updateEntry(id, { status: "fertig", progress: 1 });
      } catch (err) {
        const status = (err as { status?: number })?.status ?? 0;
        const versuche = (dateienRef.current.find((x) => x.id === id)?.versuche ?? 0) + 1;
        const msg =
          err instanceof Error ? err.message : "Upload fehlgeschlagen";
        if (status === 429 && versuche < MAX_VERSUCHE) {
          updateEntry(id, { status: "wartet", versuche, fehler: undefined });
          setTimeout(() => starteUpload(id), 2000);
          return;
        }
        updateEntry(id, { status: "fehler", versuche, fehler: msg });
      }
    },
    [token, updateEntry],
  );

  // Queue: solange < MAX_PARALLEL laufen, nächsten "wartet"-Eintrag starten.
  useEffect(() => {
    const laufend = dateien.filter((e) => e.status === "laeuft").length;
    if (laufend >= MAX_PARALLEL) return;
    const naechster = dateien.find((e) => e.status === "wartet");
    if (!naechster) return;
    starteUpload(naechster.id);
  }, [dateien, starteUpload]);

  function verarbeite(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const neue: DateiEntry[] = [];
    for (const f of list) {
      if (f.size > MAX_BYTES) {
        toast.error(`"${f.name}" ist größer als 20 MB`);
        continue;
      }
      const istBild = f.type.startsWith("image/");
      neue.push({
        id: Math.random().toString(36).slice(2),
        file: f,
        previewUrl: istBild ? URL.createObjectURL(f) : "",
        istBild,
        status: "wartet",
        progress: 0,
        versuche: 0,
      });
    }
    if (neue.length) setDateien((prev) => [...prev, ...neue]);
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    e.target.value = "";
    if (files) verarbeite(files);
  }

  function entferne(id: string) {
    setDateien((p) => {
      const x = p.find((f) => f.id === id);
      if (x?.previewUrl) URL.revokeObjectURL(x.previewUrl);
      return p.filter((f) => f.id !== id);
    });
  }

  // Object-URLs am Ende aufräumen.
  useEffect(() => {
    return () => {
      dateienRef.current.forEach((e) => {
        if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
      });
    };
  }, []);

  const total = dateien.length;
  const fertig = dateien.filter((e) => e.status === "fertig").length;
  const fehler = dateien.filter((e) => e.status === "fehler").length;
  const aktiv = dateien.filter((e) => e.status === "laeuft" || e.status === "wartet").length;
  const allesFertig = total > 0 && fertig === total;
  const overallProgress = total === 0 ? 0 : (fertig + dateien.reduce((s, e) => s + (e.status === "laeuft" ? e.progress : 0), 0)) / total;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <h1 className="text-base font-semibold">Dateien hochladen</h1>
        <p className="text-xs text-muted-foreground">
          Foto aufnehmen oder Datei wählen — Upload läuft automatisch.
        </p>
      </header>

      <main className="flex-1 space-y-3 p-4 pb-32">
        <FileButton
          icon={Camera}
          label={total === 0 ? "Foto aufnehmen" : "Noch ein Foto"}
          accept="image/*"
          capture="environment"
          onChange={onPick}
        />
        <FileButton
          icon={FolderOpen}
          label="Aus Galerie / Dateien"
          accept="image/*,application/pdf"
          multiple
          onChange={onPick}
        />

        {allesFertig && (
          <div className="flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 p-4 text-sm text-success">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success/20">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Fertig — am PC sichtbar.</p>
              <p className="text-xs opacity-80">Du kannst weitere Dateien hinzufügen.</p>
            </div>
          </div>
        )}

        {total > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium">
              {total} Datei{total === 1 ? "" : "en"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {dateien.map((f) => (
                <div
                  key={f.id}
                  className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
                >
                  {f.istBild ? (
                    <img src={f.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
                      <FileText className="h-7 w-7 text-muted-foreground" />
                      <span className="line-clamp-2 break-all text-[10px] text-muted-foreground">
                        {f.file.name}
                      </span>
                    </div>
                  )}

                  {/* Status-Overlay */}
                  {f.status === "laeuft" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/55 backdrop-blur-[1px]">
                      <Loader2 className="h-6 w-6 animate-spin text-white drop-shadow" />
                      <span className="text-[10px] font-medium text-white drop-shadow">
                        {Math.round(f.progress * 100)}%
                      </span>
                    </div>
                  )}
                  {f.status === "wartet" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                      <Loader2 className="h-5 w-5 animate-spin text-white/80" />
                    </div>
                  )}
                  {f.status === "fertig" && (
                    <div className="absolute right-1 bottom-1 flex h-7 w-7 items-center justify-center rounded-full bg-success text-white shadow">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                  {f.status === "fehler" && (
                    <button
                      type="button"
                      onClick={() => starteUpload(f.id)}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-destructive/85 text-white"
                      aria-label="Erneut versuchen"
                    >
                      <AlertTriangle className="h-5 w-5" />
                      <span className="flex items-center gap-1 text-[10px] font-semibold">
                        <RotateCw className="h-3 w-3" /> Erneut
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => entferne(f.id)}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-destructive shadow"
                    aria-label="Entfernen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {total > 0 && !allesFertig && (
        <div className="sticky bottom-0 border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {fertig} von {total} gesendet
              {fehler > 0 ? ` · ${fehler} Fehler` : ""}
            </span>
            <span>{aktiv > 0 ? "läuft…" : ""}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${Math.round(overallProgress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
