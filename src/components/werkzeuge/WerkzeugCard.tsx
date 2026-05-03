import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { WerkzeugDefinition } from "@/lib/werkzeuge/registry";
import { Button } from "@/components/ui/button";

interface Props {
  werkzeug: WerkzeugDefinition;
}

export function WerkzeugCard({ werkzeug }: Props) {
  const Icon = werkzeug.icon;
  return (
    <div className="group flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-content-center rounded-xl border bg-muted/40">
          <Icon className="h-5 w-5 text-foreground/80" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight">{werkzeug.titel}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{werkzeug.beschreibung}</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button asChild size="sm" variant="secondary">
          <Link to={werkzeug.route}>
            Öffnen
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
