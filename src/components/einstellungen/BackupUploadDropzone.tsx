// Drag & Drop für Backup-Dateien (.sqlite / .sqlite.gz / .db).
import { useRef, useState } from "react";
import { Upload, FileArchive } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPT = ".sqlite,.sqlite.gz,.db,.gz";
const MAX_BYTES = 500 * 1024 * 1024;

export function BackupUploadDropzone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = (file: File) => {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("Datei größer als 500 MB.");
      return;
    }
    if (!/\.(sqlite|sqlite\.gz|db|gz)$/i.test(file.name)) {
      setError("Erwartete Endung: .sqlite, .sqlite.gz oder .db");
      return;
    }
    onFile(file);
  };

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setHover(true);
        }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHover(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handle(f);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 transition",
          hover ? "border-primary bg-primary/5" : "border-border bg-muted/20",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <FileArchive className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Backup-Datei hier ablegen</p>
        <p className="text-xs text-muted-foreground">
          oder klicken zum Auswählen · .sqlite, .sqlite.gz, .db · max 500 MB
        </p>
        <input
          ref={ref}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handle(f);
            e.target.value = "";
          }}
        />
      </button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
