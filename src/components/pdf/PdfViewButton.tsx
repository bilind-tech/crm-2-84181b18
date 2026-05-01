import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAngebotPdf, useRechnungPdf } from "@/hooks/useBelegPdf";
import type { Angebot, Rechnung } from "@/lib/api/types";
import { PdfViewerDialog } from "./PdfViewerDialog";
import { cn } from "@/lib/utils";

type Props =
  | {
      kind: "angebot";
      beleg: Angebot;
      label?: string;
      variant?: "icon" | "icon-text";
      className?: string;
    }
  | {
      kind: "rechnung";
      beleg: Rechnung;
      label?: string;
      variant?: "icon" | "icon-text";
      className?: string;
    };

export function PdfViewButton(props: Props) {
  const [open, setOpen] = useState(false);
  const variant = props.variant ?? "icon";
  const titlePrefix = props.kind === "angebot" ? "Angebot" : "Rechnung";

  return (
    <>
      <Button
        variant="ghost"
        size={variant === "icon" ? "icon" : "sm"}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        className={cn(
          variant === "icon" ? "h-8 w-8" : "h-8 px-2",
          props.className,
        )}
        title={`${titlePrefix} ${props.beleg.nummer} ansehen`}
        aria-label={`${titlePrefix} ${props.beleg.nummer} ansehen`}
      >
        <Eye className={cn("h-4 w-4", variant === "icon-text" && "mr-1.5")} />
        {variant === "icon-text" && (props.label ?? "Ansehen")}
      </Button>
      {open &&
        (props.kind === "angebot" ? (
          <AngebotViewer beleg={props.beleg} open={open} onOpenChange={setOpen} />
        ) : (
          <RechnungViewer beleg={props.beleg} open={open} onOpenChange={setOpen} />
        ))}
    </>
  );
}

function AngebotViewer({
  beleg,
  open,
  onOpenChange,
}: {
  beleg: Angebot;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const pdf = useAngebotPdf(beleg);
  return (
    <PdfViewerDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Angebot ${beleg.nummer} — ${beleg.titel}`}
      pdfUrl={pdf.url}
      status={pdf.status}
      errorMessage={pdf.error}
      fileName={`${beleg.nummer}.pdf`}
      drive={beleg.drive}
    />
  );
}

function RechnungViewer({
  beleg,
  open,
  onOpenChange,
}: {
  beleg: Rechnung;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const pdf = useRechnungPdf(beleg);
  return (
    <PdfViewerDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Rechnung ${beleg.nummer} — ${beleg.titel}`}
      pdfUrl={pdf.url}
      status={pdf.status}
      errorMessage={pdf.error}
      fileName={`${beleg.nummer}.pdf`}
      drive={beleg.drive}
    />
  );
}
