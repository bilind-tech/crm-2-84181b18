// Editor-Route für ein Protokoll.
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, ArrowLeft } from "lucide-react";
import { useProtokoll } from "@/hooks/useApi";
import { NotFoundState } from "@/components/layout/NotFoundState";
import { Button } from "@/components/ui/button";
import { ProtokollEditorLayout } from "@/components/protokoll-editor/ProtokollEditorLayout";

export const Route = createFileRoute("/protokolle/$id/bearbeiten")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const q = useProtokoll(id);

  if (q.isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">Editor wird vorbereitet …</p>
      </div>
    );
  }
  if (!q.data) {
    return (
      <div className="space-y-4">
        <NotFoundState
          title="Protokoll nicht gefunden"
          description="Dieses Protokoll wurde gelöscht oder die Adresse ist ungültig."
          backTo="/protokolle"
          backLabel="Zurück zu Protokollen"
        />
        <div className="flex justify-center">
          <Button variant="ghost" asChild><Link to="/protokolle"><ArrowLeft className="mr-1.5 h-4 w-4" />Zurück</Link></Button>
        </div>
      </div>
    );
  }
  return <ProtokollEditorLayout protokoll={q.data} />;
}
