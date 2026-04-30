import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/mahnwesen")({ component: Page });

function Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Mahnwesen"
        title="Mahnwesen"
        subtitle="Überfällige Rechnungen automatisch nachverfolgen und mahnen."
      />
      <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/15 text-warning">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <p className="text-base font-medium">Mahnwesen folgt</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Mehrstufige Mahnungen mit konfigurierbaren Fristen — kommt mit dem Backend.
        </p>
      </div>
    </div>
  );
}
