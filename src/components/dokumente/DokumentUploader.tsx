import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { Upload, FileUp } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { ACCEPT_PATTERN, uploadDokument } from "@/lib/dokument/upload";
import { cn } from "@/lib/utils";

interface Props {
  /** Wenn true: kompakte Variante (Button statt großer Drop-Zone). */
  compact?: boolean;
  kundeId?: string;
  objektId?: string;
}

export function DokumentUploader({ compact, kundeId, objektId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  async function verarbeite(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    let ok = 0;
    let fehler = 0;
    for (const file of list) {
      try {
        await uploadDokument(file, { kundeId, objektId, quelle: "upload" });
        ok++;
      } catch (e) {
        fehler++;
        toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen");
      }
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["dokumente"] });
    if (ok > 0) toast.success(`${ok} Dokument(e) hochgeladen`);
    if (fehler > 0 && ok === 0) toast.error("Kein Dokument hochgeladen");
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) verarbeite(e.target.files);
    e.target.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files?.length) verarbeite(e.dataTransfer.files);
  }

  const hidden = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={ACCEPT_PATTERN}
      className="sr-only"
      onChange={onChange}
    />
  );

  if (compact) {
    return (
      <>
        {hidden}
        <PrimaryAction
          icon={Upload}
          label={busy ? "Wird hochgeladen…" : "Dokument hochladen"}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        />
      </>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card p-8 text-center transition sm:p-10",
        drag
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/60 hover:bg-muted/30",
        busy && "pointer-events-none opacity-70",
      )}
    >
      {hidden}
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <FileUp className="h-6 w-6" />
      </div>
      <p className="text-base font-semibold">
        {busy ? "Wird hochgeladen…" : "Dateien hierher ziehen oder klicken"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Bilder oder PDF, jeweils bis 20 MB. Mehrere Dateien gleichzeitig möglich.
      </p>
    </div>
  );
}
