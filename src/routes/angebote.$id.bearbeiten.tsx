import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Loader2, ArrowLeft, AlertCircle } from "lucide-react";
import { useAngebot, useKunde, useFirmendaten } from "@/hooks/useApi";
import { NotFoundState } from "@/components/layout/NotFoundState";
import { Button } from "@/components/ui/button";
import { PdfEditorLayout } from "@/components/pdf-editor/PdfEditorLayout";

export const Route = createFileRoute("/angebote/$id/bearbeiten")({
  component: Page,
  errorComponent: ErrorView,
});

function Page() {
  const { id } = Route.useParams();
  const { data: angebot, isLoading: angebotLoading } = useAngebot(id);
  const { data: kunde, isLoading: kundeLoading } = useKunde(angebot?.kundeId ?? "");
  const { data: firma, isLoading: firmaLoading } = useFirmendaten();
  const ansprechpartner = kunde?.ansprechpartner?.find((a) => a.id === angebot?.ansprechpartnerId);

  // Beleg wird primär geladen — solange laden, Skeleton mit klarem Hinweis
  if (angebotLoading) {
    return <EditorLoading label="Angebot wird geladen …" />;
  }
  if (!angebot) {
    return (
      <NotFoundState
        title="Angebot nicht gefunden"
        description="Dieses Angebot wurde gelöscht oder die Adresse ist ungültig."
        backTo="/angebote"
        backLabel="Zurück zu den Angeboten"
      />
    );
  }
  // Beleg da, aber Kunde/Firma noch nicht — Spinner statt Skeleton, sonst „passiert nichts"-Effekt
  if (kundeLoading || firmaLoading || !kunde || !firma) {
    return <EditorLoading label="Editor wird vorbereitet …" />;
  }

  return (
    <PdfEditorLayout
      kind="angebot"
      beleg={angebot}
      kunde={kunde}
      firma={firma}
      ansprechpartner={ansprechpartner}
      backTo={{ to: "/angebote/$id", params: { id } }}
    />
  );
}

function EditorLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function ErrorView({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="h-6 w-6" />
      </div>
      <div className="max-w-md space-y-1">
        <h2 className="text-lg font-semibold">Editor konnte nicht geladen werden</h2>
        <p className="text-sm text-muted-foreground">
          {error.message || "Unbekannter Fehler beim Laden des PDF-Editors."}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" asChild>
          <Link to="/angebote">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Zurück zu Angeboten
          </Link>
        </Button>
        <Button
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Erneut versuchen
        </Button>
      </div>
    </div>
  );
}
