import { createFileRoute } from "@tanstack/react-router";
import { Calculator } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/steuer-export")({ component: Page });

function Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Steuer-Export"
        title="Steuer-Export"
        subtitle="DATEV/CSV-Export für Steuerberater und Buchhaltung."
      />
      <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Calculator className="h-7 w-7" />
        </div>
        <p className="text-base font-medium">Export folgt</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          DATEV-, CSV- und PDF-Exports für die Steuerberatung — kommt im nächsten Schritt.
        </p>
      </div>
    </div>
  );
}
