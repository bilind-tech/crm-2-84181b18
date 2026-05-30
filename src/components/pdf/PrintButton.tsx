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
import {
  initializePrintTab,
  printPdfBlob,
  printPdfBlobUrl,
  printRequiresOpenWindow,
  showPrintTabError,
} from "@/lib/pdf/printBlob";
import { cn } from "@/lib/utils";

type Common = {
  label?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
  disabled?: boolean;
};

type Props = Common & {
  blob?: Blob | null;
  url?: string | null;
  getBlob?: () => Promise<Blob>;
};

export function PrintButton(props: Props) {
  const { label = "Drucken", variant = "outline", size = "sm", className, disabled } = props;
  const [busy, setBusy] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    // Safari/iOS: Tab MUSS synchron im Click-Handler geöffnet werden,
    // sonst blockiert der Popup-Blocker. Im sonstigen Pfad (Chromium/FF)
    // bleibt winRef null und wir drucken im aktuellen Tab via iframe.
    let winRef: Window | null = null;
    if (printRequiresOpenWindow() && (props.blob || props.url || props.getBlob)) {
      try {
        winRef = window.open("", "_blank");
        initializePrintTab(winRef);
      } catch {
        winRef = null;
      }
    }
    try {
      // Blob bevorzugen — vermeidet fetch(blobUrl), das in WebKit/Safari mit
      // „Load failed" abbricht, sobald die Blob-URL revoked wurde.
      if (props.blob) {
        setBusy(true);
        await printPdfBlob(props.blob, winRef);
        return;
      }
      if (props.url) {
        setBusy(true);
        await printPdfBlobUrl(props.url, winRef);
        return;
      }
      if (props.getBlob) {
        setBusy(true);
        const blob = await props.getBlob();
        await printPdfBlob(blob, winRef);
        return;
      }
      if (winRef) {
        try { winRef.close(); } catch { /* noop */ }
      }
      toast.error("PDF ist noch nicht bereit.");
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      if (winRef && printRequiresOpenWindow()) {
        showPrintTabError(winRef, "PDF konnte nicht vorbereitet werden.");
      } else if (winRef) {
        try { winRef.close(); } catch { /* noop */ }
      }
      toast.error(`Drucken fehlgeschlagen: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const hasSource = !!props.blob || !!props.url || !!props.getBlob;
  const isDisabled = disabled || busy || !hasSource;

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
