import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent } from "react";
import { Camera, Trash2, Check, Upload, Loader2, FolderOpen, FileText } from "lucide-react";
import { toast } from "sonner";
import { uploadDokumentToSession, MAX_BYTES } from "@/lib/dokument/upload";
import { PrimaryAction } from "@/components/layout/PrimaryAction";

export const Route = createFileRoute("/m/upload/$session")({
  component: MobileUploadPage,
});

interface DateiEntry {
  id: string;
  file: File;
  previewUrl: string; // local object URL für Preview
  istBild: boolean;
}

function MobileUploadPage() {
  const { session: token } = Route.useParams();
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const [dateien, setDateien] = useState<DateiEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  function verarbeite(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setDone(false);
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
      });
    }
    if (neue.length) setDateien((prev) => [...prev, ...neue]);
  }

  function onCamera(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    e.target.value = "";
    if (files) verarbeite(files);
  }

  function onPicker(e: ChangeEvent<HTMLInputElement>) {
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

  async function alleHochladen() {
    if (dateien.length === 0) return;
    setUploading(true);
    const stamp = new Date();
    const datum = stamp.toISOString().slice(0, 10);
    let ok = 0;
    try {
      for (let i = 0; i < dateien.length; i++) {
        const d = dateien[i];
        const titel = d.istBild
          ? `Foto ${stamp.toLocaleDateString("de-DE")} #${i + 1}`
          : d.file.name.replace(/\.[^.]+$/, "");
        try {
          await uploadDokumentToSession(token, d.file, {
            titel,
            dokumentdatum: datum,
            quelle: "handy-scan",
            steuerrelevant: false,
          });
          if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
          ok++;
        } catch (e) {
          toast.error(
            e instanceof Error ? `${d.file.name}: ${e.message}` : "Upload fehlgeschlagen",
          );
        }
      }
      if (ok > 0) {
        setDateien([]);
        setDone(true);
        toast.success(`${ok} an den PC gesendet`);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <h1 className="text-base font-semibold">Dateien hochladen</h1>
        <p className="text-xs text-muted-foreground">
          Foto aufnehmen oder Bild/PDF aus deinen Dateien auswählen.
        </p>
      </header>

      <main className="flex-1 space-y-3 p-4">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={onCamera}
        />
        <input
          ref={pickerRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="sr-only"
          onChange={onPicker}
        />

        <PrimaryAction
          icon={Camera}
          label={dateien.length === 0 ? "Foto aufnehmen" : "Noch ein Foto"}
          size="lg"
          fullWidth
          onClick={() => cameraRef.current?.click()}
        />
        <PrimaryAction
          icon={FolderOpen}
          label="Aus Galerie / Dateien"
          size="lg"
          fullWidth
          onClick={() => pickerRef.current?.click()}
        />

        {done && dateien.length === 0 && (
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

        {dateien.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium">{dateien.length} Datei(en) vorbereitet</p>
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

      {dateien.length > 0 && (
        <div className="sticky bottom-0 border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <PrimaryAction
            icon={uploading ? Loader2 : Upload}
            label={uploading ? "Wird hochgeladen…" : `Alle senden (${dateien.length})`}
            size="lg"
            fullWidth
            disabled={uploading}
            onClick={alleHochladen}
            className={uploading ? "[&_svg]:animate-spin" : undefined}
          />
        </div>
      )}
    </div>
  );
}
