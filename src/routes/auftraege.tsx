import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/auftraege")({ component: Page });

function Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Aufträge"
        title="Aufträge"
        subtitle="Aktive und abgeschlossene Reinigungsaufträge verwalten."
      />
      <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ClipboardList className="h-7 w-7" />
        </div>
        <p className="text-base font-medium">Auftragsverwaltung folgt</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Hier entstehen wiederkehrende Reinigungsaufträge mit Tourenplanung — sobald das Pi-Backend
          bereitsteht.
        </p>
      </div>
    </div>
  );
}
