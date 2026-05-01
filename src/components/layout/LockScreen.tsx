import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import logo from "@/assets/logo.png";

export function LockScreen() {
  const { unlock, loading } = useAuth();
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    try {
      await unlock(passwort);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 p-4">
      <Card className="w-full max-w-md border-border/60 p-2 shadow-2xl">
        <CardHeader className="text-center">
          <img
            src={logo}
            alt="My Clean Center"
            className="mx-auto mb-4 h-28 w-28 object-contain drop-shadow-md"
          />
          <h1 className="text-2xl tracking-tight">
            <span className="font-light">My </span>
            <span className="font-extrabold">Clean</span>
            <span className="font-light"> Center</span>
          </h1>
          <CardDescription className="mt-1">
            Bitte gib dein Passwort ein, um zu entsperren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">Passwort</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="pw"
                  type="password"
                  autoFocus
                  className="pl-9"
                  value={passwort}
                  onChange={(e) => setPasswort(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            {fehler && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {fehler}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entsperren …" : "Entsperren"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
