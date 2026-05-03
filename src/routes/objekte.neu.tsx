import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/objekte/neu")({ component: Page });
function Page() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Neues Objekt</h1>
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Detail-Formular folgt im nächsten Schritt.
        </CardContent>
      </Card>
      <Button variant="outline" onClick={() => navigate({ to: "/objekte" })}>
        Zurück
      </Button>
    </div>
  );
}
