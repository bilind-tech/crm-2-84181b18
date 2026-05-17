import { createFileRoute } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/einstellungen/datenbank")({
  component: DatenbankPage,
});

function DatenbankPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Datenbank"
        subtitle="Verwaltung und Übersicht der lokalen SQLite-Datenbank"
      />

      <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-12 text-center">
        <Database className="mx-auto h-10 w-10 text-muted-foreground/60" />
        <h2 className="mt-4 text-base font-medium text-foreground">
          Wird in Kürze gebaut
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Hier entsteht der Bereich für die Datenbank-Verwaltung — Tabellenübersicht,
          Statistiken und manuelle Werkzeuge.
        </p>
      </div>
    </div>
  );
}