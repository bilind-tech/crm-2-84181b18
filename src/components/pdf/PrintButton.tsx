// Wiederverwendbarer „Drucken"-Button.
//
// Zwei Modi:
//  - `url`: bereits vorhandene Blob-URL (z. B. aus useAngebotPdf/useRechnungPdf).
//  - `getBlob`: erzeugt PDF on demand (für Werkzeuge wie Übergabeprotokoll).
//
// Der Button löst den nativen Druck-Dialog des Browsers aus — im selben Tab
// per verstecktem iframe; bei Safari/iOS automatisch via neuem Tab.

import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { printPdfBlob, printPdfBlobUrl } from "@/lib/pdf/printBlob";
import { cn } from "@/lib/utils";

type Common = {
  label?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
  disabled?: boolean;
};

type Props =
  | (Common & { blob: Blob | null | undefined; url?: string | null | undefined; getBlob?: never })
  | (Common & { url: string | null | undefined; blob?: never; getBlob?: never })
  | (Common & { getBlob: () => Promise<Blob>; url?: never; blob?: never });

export function PrintButton(props: Props) {
  const { label = "Drucken", variant = "outline", size = "sm", className, disabled } = props;
  const [busy, setBusy] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    try {
      if ("blob" in props && props.blob) {
        setBusy(true);
        await printPdfBlob(props.blob);
        return;
      }
      if ("url" in props && props.url) {
        setBusy(true);
        await printPdfBlobUrl(props.url);
        return;
      }
      if ("getBlob" in props && props.getBlob) {
        setBusy(true);
        const blob = await props.getBlob();
        await printPdfBlob(blob);
        return;
      }
      toast.error("PDF ist noch nicht bereit.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Drucken fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const isDisabled =
    disabled ||
    busy ||
    ("blob" in props && !props.blob && !("url" in props && props.url)) ||
    ("url" in props && !("blob" in props) && !props.url);

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("rounded-lg", className)}
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={label}
      title={label}
    >
      {busy ? (
        <Loader2 className={cn("h-4 w-4 animate-spin", size !== "icon" && "mr-1.5")} />
      ) : (
        <Printer className={cn("h-4 w-4", size !== "icon" && "mr-1.5")} />
      )}
      {size !== "icon" && label}
    </Button>
  );
}
