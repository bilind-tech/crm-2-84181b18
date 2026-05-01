import { FileQuestion } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  description?: string;
  /** Pfad zur passenden Listen-Seite (z. B. „/kunden"). */
  backTo: "/kunden" | "/angebote" | "/rechnungen" | "/objekte";
  backLabel: string;
}

/**
 * Sichtbarer „Nicht gefunden"-Zustand für Detail-Seiten —
 * ersetzt die unauffällige Textzeile.
 */
export function NotFoundState({ title, description, backTo, backLabel }: Props) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
      <div className="grid h-14 w-14 place-content-center rounded-2xl bg-muted">
        <FileQuestion className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <Button asChild className="rounded-lg">
        <Link to={backTo}>{backLabel}</Link>
      </Button>
    </div>
  );
}
