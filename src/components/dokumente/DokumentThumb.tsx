import { ImageIcon, FileText } from "lucide-react";
import { useDokumentBlobUrl } from "@/hooks/useDokumentBlobUrl";
import type { Dokument } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface Props {
  dokument: Pick<Dokument, "id" | "url" | "mimeType" | "typ">;
  className?: string;
}

export function DokumentThumb({ dokument, className }: Props) {
  const istBild = dokument.mimeType?.startsWith("image/");
  const { url } = useDokumentBlobUrl(istBild ? dokument : null);
  if (istBild && url) {
    return (
      <img
        src={url}
        alt=""
        className={cn("shrink-0 rounded-lg border border-border object-cover", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
        className,
      )}
    >
      {dokument.typ === "bild" ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
    </div>
  );
}
