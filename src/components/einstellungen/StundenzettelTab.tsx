// Einstellungen-Tab für die externe Stundenzettel-App.
// Die URL liegt im Backend — alle Geräte im LAN sehen denselben Stand.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Save as SaveIcon, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useStundenzettelUrl, useSetStundenzettelUrl } from "@/lib/stundenzettel/config";
import { ApiError } from "@/lib/api/client";
import { PiApiError } from "@/lib/api/piClient";

export function StundenzettelTab() {
  const { url: serverUrl, isLoading } = useStundenzettelUrl();
  const setUrl = useSetStundenzettelUrl();
  const [draft, setDraft] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(serverUrl);
  }, [serverUrl]);

  const dirty = draft.trim() !== serverUrl.trim();
  const valid = !draft.trim() || /^https?:\/\/.+/i.test(draft.trim());

  const save = () => {
    setServerError(null);
    if (!valid) {
      toast.error("URL muss mit http:// oder https:// beginnen.");
      return;
    }
    setUrl.mutate(draft, {
      onSuccess: () => toast.success("Stundenzettel-URL gespeichert"),
      onError: (err) => {
        let msg = "Speichern fehlgeschlagen";
        if (err instanceof ApiError || err instanceof PiApiError) {
          const body = (err as { body?: unknown }).body;
          if (body && typeof body === "object") {
            const m =
              (body as { message?: string; error?: string }).message ??
              (body as { error?: string }).error;
            if (typeof m === "string" && m.trim()) msg = m;
          } else if (err.message) {
            msg = err.message;
          }
        }
        setServerError(msg);
        toast.error(msg);
      },
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-start gap-3">
          <div className="grid h-10 w-10 place-content-center rounded-lg bg-muted">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Stundenzettel-App</h2>
            <p className="text-sm text-muted-foreground">
              Externe App, die auf dem Pi unter einer eigenen Adresse läuft. Wird im CRM eingebettet
              im Bereich „Stundenzettel" angezeigt.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Adresse der Stundenzettel-App</Label>
            <Input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setServerError(null);
              }}
              placeholder="z. B. http://mycleancenter.local:4001"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Lokale LAN-Adresse oder eigene Domain. Gilt geräteübergreifend für alle Browser im
              Netzwerk. Leer lassen, solange die App noch nicht eingerichtet ist.
            </p>
            {!valid && (
              <p className="text-xs text-destructive">
                URL muss mit http:// oder https:// beginnen.
              </p>
            )}
            {valid && serverError && <p className="text-xs text-destructive">{serverError}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={save}
              disabled={!dirty || !valid || setUrl.isPending}
              className="gap-1.5 rounded-full px-5"
            >
              <SaveIcon className="h-4 w-4" />
              {setUrl.isPending ? "Speichern…" : "Speichern"}
            </Button>
            {serverUrl && (
              <Button
                variant="outline"
                className="gap-1.5 rounded-full px-5"
                onClick={() => window.open(serverUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-4 w-4" />
                In neuem Tab öffnen
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-sm">
        <p className="mb-2 font-medium">So richtest du das später auf dem Pi ein:</p>
        <ol className="ml-5 list-decimal space-y-1 text-muted-foreground">
          <li>
            Stundenzettel-App-Ordner auf den Pi kopieren (z. B. nach
            <code className="mx-1 rounded bg-background px-1.5 py-0.5">
              /opt/mycleancenter-stundenzettel/
            </code>
            ).
          </li>
          <li>
            Als <code className="mx-1 rounded bg-background px-1.5 py-0.5">systemd</code>-Dienst
            einrichten, damit sie automatisch beim Boot startet und 24/7 läuft.
          </li>
          <li>
            Eigenen Port wählen (z. B.{" "}
            <code className="mx-1 rounded bg-background px-1.5 py-0.5">4001</code>), damit sie nicht
            mit dem CRM-Backend kollidiert.
          </li>
          <li>
            Die LAN-Adresse (z. B.{" "}
            <code className="mx-1 rounded bg-background px-1.5 py-0.5">
              http://mycleancenter.local:4001
            </code>
            ) oben eintragen und speichern.
          </li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Wenn die andere App das Einbetten in iframes blockiert (CSP/X-Frame-Options), öffnet sich
          der Link automatisch in einem neuen Tab.
        </p>
      </div>
    </div>
  );
}
