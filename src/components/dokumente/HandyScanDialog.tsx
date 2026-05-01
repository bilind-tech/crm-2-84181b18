import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, X, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useBeendeUploadSession,
  useCreateUploadSession,
  useUploadSessionLive,
} from "@/hooks/useApi";
import type { UploadSession } from "@/lib/api/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function HandyScanDialog({ open, onOpenChange }: Props) {
  const [session, setSession] = useState<UploadSession | null>(null);
  const [copied, setCopied] = useState(false);
  const create = useCreateUploadSession();
  const beenden = useBeendeUploadSession();
  const live = useUploadSessionLive(session?.token);

  const uploadUrl = useMemo(() => {
    if (!session || typeof window === "undefined") return "";
    return `${window.location.origin}/m/upload/${session.token}`;
  }, [session]);

  // Beim Öffnen: Session anlegen
  useEffect(() => {
    if (open && !session && !create.isPending) {
      create.mutateAsync().then(setSession).catch(() => {
        toast.error("Sitzung konnte nicht gestartet werden");
        onOpenChange(false);
      });
    }
    if (!open) {
      // Beim Schließen: Session beenden + zurücksetzen
      if (session) {
        beenden.mutate(session.token);
      }
      setSession(null);
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dateien = live.data?.dateien ?? [];
  const status: "warten" | "aktiv" =
    dateien.length > 0 ? "aktiv" : "warten";

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(uploadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Kopieren nicht möglich");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Vom Handy scannen
          </DialogTitle>
          <DialogDescription>
            Scanne den QR-Code mit deinem Handy. Die Fotos erscheinen automatisch hier.
          </DialogDescription>
        </DialogHeader>

        {!session ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            Sitzung wird gestartet…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center rounded-2xl border border-border bg-white p-5">
              <QRCodeSVG value={uploadUrl} size={260} level="M" />
            </div>

            <button
              type="button"
              onClick={copyUrl}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground transition hover:bg-muted"
            >
              <span className="truncate">{uploadUrl}</span>
              {copied ? (
                <Check className="h-4 w-4 shrink-0 text-success" />
              ) : (
                <Copy className="h-4 w-4 shrink-0" />
              )}
            </button>

            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {status === "warten" ? "Warte auf Fotos…" : `${dateien.length} Foto(s) empfangen`}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${status === "aktiv" ? "bg-success animate-pulse" : "bg-muted-foreground/40"}`} />
                  {status === "aktiv" ? "verbunden" : "wartet"}
                </span>
              </div>

              {dateien.length > 0 && (
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {dateien.map((d) => (
                    <div
                      key={d.id}
                      className="aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                    >
                      {d.url ? (
                        <img
                          src={d.url}
                          alt={d.titel}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
              >
                <X className="h-4 w-4" />
                Sitzung beenden
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
