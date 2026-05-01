import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateKunde } from "@/hooks/useApi";
import { toast } from "sonner";

export const Route = createFileRoute("/kunden/neu")({ component: Page });

function Page() {
  const create = useCreateKunde();
  const navigate = useNavigate();
  const [form, setForm] = useState({ typ: "firma" as "firma" | "privat", firmenname: "", vorname: "", nachname: "", email: "", telefon: "", strasse: "", plz: "", ort: "" });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Neuer Kunde</h1>
      <Card>
        <CardHeader><CardTitle>Stammdaten</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Typ</Label>
            <select className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={form.typ} onChange={(e) => setForm({ ...form, typ: e.target.value as "firma" | "privat" })}>
              <option value="firma">Firma</option><option value="privat">Privat</option>
            </select>
          </div>
          {form.typ === "firma" && (<div className="sm:col-span-2"><Label>Firmenname</Label><Input value={form.firmenname} onChange={(e) => setForm({ ...form, firmenname: e.target.value })} /></div>)}
          <div><Label>Vorname</Label><Input value={form.vorname} onChange={(e) => setForm({ ...form, vorname: e.target.value })} /></div>
          <div><Label>Nachname</Label><Input value={form.nachname} onChange={(e) => setForm({ ...form, nachname: e.target.value })} /></div>
          <div><Label>E-Mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Telefon</Label><Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Straße</Label><Input value={form.strasse} onChange={(e) => setForm({ ...form, strasse: e.target.value })} /></div>
          <div><Label>PLZ</Label><Input value={form.plz} onChange={(e) => setForm({ ...form, plz: e.target.value })} /></div>
          <div><Label>Ort</Label><Input value={form.ort} onChange={(e) => setForm({ ...form, ort: e.target.value })} /></div>
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/kunden" })}>Abbrechen</Button>
        <Button disabled={create.isPending} onClick={async () => {
          const k = await create.mutateAsync(form);
          toast.success(`Kunde ${k.nummer} angelegt`);
          navigate({ to: "/kunden/$id", params: { id: k.id } });
        }}>Speichern</Button>
      </div>
    </div>
  );
}
