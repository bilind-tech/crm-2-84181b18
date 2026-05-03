// Passwort-Ändern-Dialog. Aus dem alten UserMenu extrahiert,
// damit er im SicherheitTab wiederverwendbar ist.
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { PiApiError } from "@/lib/api/piClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function PasswortAendernDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { changePassword } = useAuth();
  const [alt, setAlt] = useState("");
  const [neu, setNeu] = useState("");
  const [neu2, setNeu2] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    if (neu !== neu2) {
      setFehler("Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(alt, neu);
      toast.success("Passwort geändert");
      onOpenChange(false);
      setAlt("");
      setNeu("");
      setNeu2("");
    } catch (err) {
      if (err instanceof PiApiError) {
        if (err.status === 401) setFehler("Aktuelles Passwort ist falsch.");
        else if (err.status === 422)
          setFehler("Neues Passwort: min. 12 Zeichen, 1 Ziffer + 1 Sonderzeichen.");
        else setFehler(err.message);
      } else setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Passwort ändern</DialogTitle>
          <DialogDescription>
            Min. 12 Zeichen, mindestens 1 Ziffer und 1 Sonderzeichen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="alt">Aktuelles Passwort</Label>
            <Input
              id="alt"
              type="password"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="neu">Neues Passwort</Label>
            <Input
              id="neu"
              type="password"
              value={neu}
              onChange={(e) => setNeu(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="neu2">Wiederholen</Label>
            <Input
              id="neu2"
              type="password"
              value={neu2}
              onChange={(e) => setNeu2(e.target.value)}
              required
            />
          </div>
          {fehler && (
            <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {fehler}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Speichere …" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
