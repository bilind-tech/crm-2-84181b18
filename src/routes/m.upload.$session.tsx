import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent } from "react";
import { Camera, Trash2, Check, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUploadDateienToSession } from "@/hooks/useApi";
import { compressImage } from "@/lib/dokument/upload";

export const Route = createFileRoute("/m/upload/$session")({
  component: MobileUploadPage,
});

interface FotoEntry {
  id: string;
  dataUrl: string;
  groesse: number;
}

function MobileUploadPage() {
  const { session: token } = Route.useParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<FotoEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const upload = useUploadDateienToSession(token);

  async function onCapture(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    for (const f of files) {
      try {
        const dataUrl = await compressImage(f, 1600, 0.8);
        setFotos((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).slice(2),
            dataUrl,
            groesse: Math.round(dataUrl.length * 0.75),
          },
        ]);
      } catch {
        toast.error("Foto konnte nicht verarbeitet werden");
      }
    }
  }

  function entferne(id: string) {
    setFotos((p) => p.filter((f) => f.id !== id));
  }

  async function alleHochladen() {
    if (fotos.length === 0) return;
    setUploading(true);
    try {
      const stamp = new Date();
      const datum = stamp.toISOString().slice(0, 10);
      await upload.mutateAsync(
        fotos.map((f, i) => ({
          titel: `Foto ${stamp.toLocaleDateString("de-DE")} #${i + 1}`,
          dateiname: `foto-${datum}-${i + 1}.jpg`,
          mimeType: "image/jpeg",
          groesseBytes: f.groesse,
          url: f.dataUrl,
          typ: "bild" as const,
          dokumentdatum: datum,
          steuerrelevant: false,
        })),
      );
      setFotos([]);
      setDone(true);
      toast.success("Fotos hochgeladen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <h1 className="text-base font-semibold">Fotos hochladen</h1>
        <p className="text-xs text-muted-foreground">
          Mache Fotos und sende sie an deinen PC.
        </p>
      </header>

      <main className="flex-1 space-y-4 p-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={onCapture}
        />

        <button
          type="button"
          onClick={() => {
            setDone(false);
            inputRef.current?.click();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-5 text-base font-semibold text-primary-foreground shadow-sm active:opacity-90"
        >
          <Camera className="h-6 w-6" />
          {fotos.length === 0 ? "Foto aufnehmen" : "Noch ein Foto"}
        </button>

        {done && fotos.length === 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 p-4 text-sm text-success">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success/20">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Fertig — am PC sichtbar.</p>
              <p className="text-xs opacity-80">Du kannst weitere Fotos machen.</p>
            </div>
          </div>
        )}

        {fotos.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{fotos.length} Foto(s) vorbereitet</p>
            <div className="grid grid-cols-3 gap-2">
              {fotos.map((f) => (
                <div
                  key={f.id}
                  className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
                >
                  <img src={f.dataUrl} alt="" className="h-full w-full object-cover" />
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

      {fotos.length > 0 && (
        <div className="sticky bottom-0 border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={alleHochladen}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-success px-4 py-4 text-base font-semibold text-success-foreground shadow-sm active:opacity-90 disabled:opacity-60"
          >
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Wird hochgeladen…
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                Alle hochladen ({fotos.length})
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
