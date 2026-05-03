import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/angebote/neu")({ component: Page });
function Page() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Neues Angebot</h1>
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Positionseditor mit Vorlagen folgt im nächsten Schritt.
        </CardContent>
      </Card>
      <Button variant="outline" onClick={() => navigate({ to: "/angebote" })}>
        Zurück
      </Button>
    </div>
  );
}
