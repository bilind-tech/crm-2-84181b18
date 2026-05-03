// Eingebettete Ansicht der externen Stundenzettel-App per iframe.
// Erklärt klar, warum Einbettung in der Cloud-Preview nicht geht und auf dem Pi schon.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  ExternalLink,
  RefreshCw,
  Settings as SettingsIcon,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { useStundenzettelUrl } from "@/lib/stundenzettel/config";

export const Route = createFileRoute("/stundenzettel")({ component: Page });

type Hindernis =
  | { typ: "mixed-content"; details: string }
  | { typ: "lan-aus-cloud"; details: string }
  | { typ: "ungueltige-url"; details: string }
  | null;

function analysiereUmfeld(url: string): Hindernis {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { typ: "ungueltige-url", details: "Die hinterlegte Adresse ist keine gültige URL." };
  }

  const seiteIstHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const zielIstHttp = u.protocol === "http:";
  const istLanHost =
    /\.local$/i.test(u.hostname) ||
    /^localhost$/i.test(u.hostname) ||
    /^127\./.test(u.hostname) ||
    /^10\./.test(u.hostname) ||
    /^192\.168\./.test(u.hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(u.hostname);

  const seiteIstCloudPreview =
    typeof window !== "undefined" &&
    /\.(lovable\.app|lovableproject\.com)$/i.test(window.location.hostname);

  if (seiteIstCloudPreview && istLanHost) {
    return {
      typ: "lan-aus-cloud",
      details:
        "Du betrachtest das CRM gerade über die Lovable-Cloud-Vorschau. Eine LAN-Adresse wie deine Stundenzettel-App ist von dort aus technisch nicht erreichbar. Sobald das CRM produktiv auf dem Pi läuft, sind beide Apps im selben Netz und die Einbettung funktioniert ohne weitere Schritte.",
    };
  }

  if (seiteIstHttps && zielIstHttp) {
    return {
      typ: "mixed-content",
      details:
        'Diese Seite läuft über HTTPS, die Stundenzettel-App über HTTP. Browser blockieren das aus Sicherheitsgründen („Mixed Content"). Auf dem Pi laufen später beide unter derselben Adresse — dann funktioniert es automatisch.',
    };
  }

  return null;
}

function Page() {
  const { url } = useStundenzettelUrl();
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [headerBlocked, setHeaderBlocked] = useState(false);

  const hindernis = useMemo(() => analysiereUmfeld(url), [url]);

  useEffect(() => {
    if (!url || hindernis) return;
    setLoaded(false);
    setHeaderBlocked(false);
    const t = setTimeout(() => {
      setHeaderBlocked((prev) => (loaded ? prev : true));
    }, 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloadKey, hindernis]);

  if (!url) {
    return (
      <div className="space-y-6">
        <PageHeader title="Stundenzettel" subtitle="Externe App für Arbeitszeit-Erfassung." />
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <Clock className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="mb-1 text-lg font-semibold">Noch nicht eingerichtet</h2>
          <p className="mx-auto mb-5 max-w-md text-sm text-muted-foreground">
            Die Stundenzettel-App läuft als eigener Dienst auf dem Pi. Hinterlege ihre Adresse in
            den Einstellungen, dann erscheint sie hier eingebettet.
          </p>
          <Button asChild className="gap-1.5 rounded-full px-5">
            <Link to="/einstellungen">
              <SettingsIcon className="h-4 w-4" />
              Zu den Einstellungen
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Stundenzettel</h1>
          <span className="truncate text-xs text-muted-foreground">{url}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Neu laden
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full"
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            In neuem Tab
          </Button>
        </div>
      </div>

      {hindernis ? (
        <HindernisInfo hindernis={hindernis} url={url} />
      ) : (
        <div className="relative flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {headerBlocked && !loaded && (
            <div className="absolute inset-0 z-10 grid place-content-center bg-background/95 p-6 text-center">
              <div className="mx-auto max-w-lg space-y-4">
                <div className="mx-auto grid h-12 w-12 place-content-center rounded-full bg-warning/10">
                  <AlertTriangle className="h-6 w-6 text-warning" />
                </div>
                <h3 className="text-base font-semibold">
                  Stundenzettel-App verbietet das Einbetten
                </h3>
                <p className="text-sm text-muted-foreground">
                  Die App ist erreichbar, sendet aber einen Header, der das Anzeigen in iframes
                  verbietet (<code className="rounded bg-muted px-1.5 py-0.5">X-Frame-Options</code>{" "}
                  oder CSP <code className="rounded bg-muted px-1.5 py-0.5">frame-ancestors</code>).
                  Diese Einstellung muss in der Stundenzettel-App selbst geändert werden — nicht
                  hier.
                </p>
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
                  <p className="mb-1 font-medium text-foreground">
                    Lösung in der Stundenzettel-App:
                  </p>
                  <p className="font-mono text-[11px]">
                    Content-Security-Policy: frame-ancestors 'self' http://mycleancenter.local
                  </p>
                  <p className="mt-1">
                    und kein{" "}
                    <code className="rounded bg-background px-1 py-0.5">X-Frame-Options: DENY</code>{" "}
                    setzen.
                  </p>
                </div>
                <div className="flex justify-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setReloadKey((k) => k + 1)}
                    className="gap-1.5 rounded-full px-5"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Erneut versuchen
                  </Button>
                  <Button
                    onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                    className="gap-1.5 rounded-full px-5"
                  >
                    <ExternalLink className="h-4 w-4" />
                    In neuem Tab öffnen
                  </Button>
                </div>
              </div>
            </div>
          )}
          <iframe
            key={reloadKey}
            src={url}
            title="Stundenzettel"
            className="h-full w-full"
            onLoad={() => {
              setLoaded(true);
              setHeaderBlocked(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function HindernisInfo({ hindernis, url }: { hindernis: NonNullable<Hindernis>; url: string }) {
  const titel: Record<NonNullable<Hindernis>["typ"], string> = {
    "lan-aus-cloud": "Funktioniert erst auf dem Pi",
    "mixed-content": "Browser blockiert HTTP-Inhalt in HTTPS-Seite",
    "ungueltige-url": "Adresse ungültig",
  };

  return (
    <div className="flex-1 overflow-auto rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-content-center rounded-full bg-primary/10">
            <Info className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{titel[hindernis.typ]}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{hindernis.details}</p>
          </div>
        </div>

        {hindernis.typ === "lan-aus-cloud" && (
          <div className="rounded-xl border border-border bg-muted/30 p-5">
            <p className="mb-2 text-sm font-medium">Was du jetzt schon tun kannst:</p>
            <ul className="ml-5 list-disc space-y-1.5 text-sm text-muted-foreground">
              <li>
                Die Adresse{" "}
                <code className="rounded bg-background px-1.5 py-0.5 text-xs">{url}</code> bleibt
                gespeichert.
              </li>
              <li>
                Klick rechts oben auf <strong>„In neuem Tab"</strong>, um die App aus deinem
                Heim-Netz aufzurufen — falls du gerade dort bist.
              </li>
              <li>
                Sobald das CRM produktiv auf dem Pi läuft (z. B. unter{" "}
                <code className="rounded bg-background px-1.5 py-0.5 text-xs">
                  http://mycleancenter.local
                </code>
                ), wird die Stundenzettel-App hier ohne weitere Schritte eingebettet angezeigt.
              </li>
            </ul>
          </div>
        )}

        {hindernis.typ === "mixed-content" && (
          <div className="rounded-xl border border-border bg-muted/30 p-5">
            <p className="mb-2 text-sm font-medium">Lösungen:</p>
            <ul className="ml-5 list-disc space-y-1.5 text-sm text-muted-foreground">
              <li>
                Die Stundenzettel-App ebenfalls über <strong>HTTPS</strong> ausliefern (z. B. mit
                einem Reverse-Proxy auf dem Pi).
              </li>
              <li>
                Oder das CRM aus derselben Quelle aufrufen wie die Stundenzettel-App (z. B. beide
                unter{" "}
                <code className="rounded bg-background px-1.5 py-0.5 text-xs">
                  http://mycleancenter.local
                </code>
                ) — dann ist kein Mixed-Content mehr.
              </li>
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            className="gap-1.5 rounded-full px-5"
          >
            <ExternalLink className="h-4 w-4" />
            Stundenzettel in neuem Tab
          </Button>
          <Button asChild variant="outline" className="gap-1.5 rounded-full px-5">
            <Link to="/einstellungen">
              <SettingsIcon className="h-4 w-4" />
              Adresse ändern
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
