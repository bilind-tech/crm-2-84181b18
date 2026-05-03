import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useObjekte } from "@/hooks/useApi";
import { PageHeader, KpiCard } from "@/components/layout/PageHeader";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { FilterBar } from "@/routes/angebote";
import { SlideOver } from "@/components/ui/slide-over";
import { MobileListCard } from "@/components/ui/mobile-list-card";
import { ObjektForm } from "@/components/forms/ObjektForm";

export const Route = createFileRoute("/objekte")({ component: Layout });

function Layout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  if (path !== "/objekte") return <Outlet />;
  return <Page />;
}

function Page() {
  const { data: alle = [] } = useObjekte();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("alle");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const counts = useMemo(
    () => ({
      gesamt: alle.length,
      aktiv: alle.filter((o) => o.status === "aktiv").length,
      pausiert: alle.filter((o) => o.status === "pausiert").length,
    }),
    [alle],
  );

  const filtered = useMemo(() => {
    let list = alle;
    if (filter !== "alle") list = list.filter((o) => o.status === filter);
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter(
        (o) =>
          o.name.toLowerCase().includes(t) ||
          o.nummer.toLowerCase().includes(t) ||
          (o.ort ?? "").toLowerCase().includes(t),
      );
    }
    return list;
  }, [alle, filter, q]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Objekte"
        subtitle="Reinigungsobjekte deiner Kunden mit Adresse."
        actions={<PrimaryAction onClick={() => setOpen(true)} label="Neues Objekt" />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Gesamt" value={counts.gesamt} tone="primary" />
        <KpiCard label="Aktiv" value={counts.aktiv} tone="success" />
        <KpiCard label="Pausiert" value={counts.pausiert} />
      </div>

      <FilterBar
        filter={filter}
        setFilter={setFilter}
        q={q}
        setQ={setQ}
        tabs={[
          { value: "alle", label: "Alle" },
          { value: "aktiv", label: "Aktiv" },
          { value: "pausiert", label: "Pausiert" },
          { value: "beendet", label: "Beendet" },
        ]}
        placeholder="Suche nach Name, Nummer, Ort…"
      />

      {/* Mobil: Card-View */}
      <div className="space-y-2 md:hidden">
        {filtered.map((o) => (
          <MobileListCard
            key={o.id}
            onClick={() => navigate({ to: "/objekte/$id", params: { id: o.id } })}
            title={o.name}
            meta={
              <>
                <span className="font-mono">{o.nummer}</span>
                {o.strasse && <span>· {o.strasse}</span>}
                {o.ort && <span>· {[o.plz, o.ort].filter(Boolean).join(" ")}</span>}
              </>
            }
            badge={
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium capitalize">
                {o.status}
              </span>
            }
          />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Keine Objekte gefunden.
          </div>
        )}
      </div>

      {/* Desktop: Tabelle */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nummer</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Adresse</th>
                <th className="px-4 py-3 font-medium">Ort</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate({ to: "/objekte/$id", params: { id: o.id } })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate({ to: "/objekte/$id", params: { id: o.id } });
                    }
                  }}
                  className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{o.nummer}</td>
                  <td className="px-4 py-3 font-medium">{o.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.strasse ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[o.plz, o.ort].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Keine Objekte gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SlideOver open={open} onOpenChange={setOpen} title="Neues Objekt">
        <ObjektForm onClose={() => setOpen(false)} />
      </SlideOver>
    </div>
  );
}
