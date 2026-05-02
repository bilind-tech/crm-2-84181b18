// Mobile-/Direkt-Route „Neuer Kunde".
// Rendert dieselbe vollständige `KundeForm` wie der Desktop-SlideOver.
// Frühere abgespeckte Version (ohne Kürzel/Dauerauftrag) ist absichtlich
// entfernt — Desktop und Handy nutzen jetzt denselben Anlage-Flow.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KundeForm } from "@/components/forms/KundeForm";

export const Route = createFileRoute("/kunden/neu")({ component: Page });

function Page() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4 sm:px-0 sm:py-0">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/kunden" })}
          className="-ml-2 gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Zurück
        </Button>
      </div>
      <h1 className="text-2xl font-semibold">Neuer Kunde</h1>
      <div className="rounded-2xl border border-border bg-background p-4 sm:p-6">
        <KundeForm onClose={() => navigate({ to: "/kunden" })} />
      </div>
    </div>
  );
}
