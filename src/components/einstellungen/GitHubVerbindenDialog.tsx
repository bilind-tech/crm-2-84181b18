// Dialog: GitHub-Repository verbinden (PAT eintragen, Verbindung testen).
// Wird aus SystemUpdateTab geöffnet. Nach erfolgreichem Save schließt sich
// der Dialog automatisch und der Status-Cache ist aktualisiert.
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Github, ExternalLink, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useGithubVerbinden } from "@/hooks/useApi";
import type { GithubUpdateStatus } from "@/lib/api/types";

interface Props {
  current: GithubUpdateStatus | null;
  open: boolean;
  onClose: () => void;
}

export function GitHubVerbindenDialog({ current, open, onClose }: Props) {
  const verbinden = useGithubVerbinden();
  const [repo, setRepo] = useState(current?.repo ?? "");
  const [branch, setBranch] = useState(current?.branch ?? "main");
  const [autoCheck, setAutoCheck] = useState(current?.autoCheck ?? true);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const isEditingExisting = !!current?.tokenIsSet;

  function submit() {
    if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo.trim())) {
      toast.error("Repository im Format besitzer/repo angeben");
      return;
    }
    if (!isEditingExisting && token.trim().length < 20) {
      toast.error("Personal Access Token (mind. 20 Zeichen) ist erforderlich");
      return;
    }
    verbinden.mutate(
      {
        repo: repo.trim(),
        branch: branch.trim() || "main",
        autoCheck,
        token: token.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          toast.success(
            data.remoteCommit
              ? `Verbunden mit ${data.repo}@${data.remoteCommit.slice(0, 7)}`
              : `Verbunden mit ${data.repo}`,
          );
          onClose();
        },
        onError: (e) => {
          const err = e as { status?: number; message?: string };
          toast.error(`Verbindung fehlgeschlagen: ${err.message ?? "Unbekannter Fehler"}`);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !verbinden.isPending && onClose()}>
      <DialogContent className="bg-background sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            {isEditingExisting ? "GitHub-Verbindung anpassen" : "Mit GitHub verbinden"}
          </DialogTitle>
          <DialogDescription className="pt-1">
            Verbinde dein eigenes Repository, damit du Updates per Klick aus dem Pi
            heraus laden kannst. Daten werden bei einem Update niemals verändert —
            es wird ausschließlich der Programmcode getauscht.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="gh-repo">Repository</Label>
            <Input
              id="gh-repo"
              placeholder="besitzer/repo"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              disabled={verbinden.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Beispiel: <span className="font-mono">manuel-acme/mycleancenter</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gh-branch">Branch</Label>
            <Input
              id="gh-branch"
              placeholder="main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={verbinden.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Standard ist <span className="font-mono">main</span>. Empfehlung: lass es so —
              Updates landen direkt durch deinen letzten Push live.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gh-token">
              Personal Access Token
              {isEditingExisting && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (leer lassen, um den vorhandenen Token zu behalten)
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="gh-token"
                type={showToken ? "text" : "password"}
                placeholder={isEditingExisting ? "•••••••• (gespeichert)" : "github_pat_…"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={verbinden.isPending}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowToken((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showToken ? "Token verbergen" : "Token anzeigen"}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">So holst du dir den Token (einmalig, ~2 min):</p>
              <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
                <li>github.com → Settings → Developer settings → Personal access tokens</li>
                <li>„Fine-grained tokens" → „Generate new token"</li>
                <li>Repository access: <strong>Only select repositories</strong> → dein Repo wählen</li>
                <li>Permissions → Repository → <strong>Contents: Read-only</strong></li>
                <li>Generieren, hier einfügen</li>
              </ol>
              <a
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-primary hover:underline"
              >
                Token jetzt erstellen <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <div>
              <Label htmlFor="gh-auto" className="cursor-pointer">Automatisch auf Updates prüfen</Label>
              <p className="text-xs text-muted-foreground">Alle 30 Minuten im Hintergrund</p>
            </div>
            <Switch
              id="gh-auto"
              checked={autoCheck}
              onCheckedChange={setAutoCheck}
              disabled={verbinden.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={verbinden.isPending}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={verbinden.isPending || !repo.trim()}>
            {verbinden.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            {isEditingExisting ? "Speichern & testen" : "Verbinden & testen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
