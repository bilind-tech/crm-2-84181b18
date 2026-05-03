import { useState } from "react";
import { Bell, Plus, Search } from "lucide-react";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { useNavigate } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useBenachrichtigungen,
  useMarkAlleBenachrichtigungenGelesen,
  useMarkBenachrichtigungGelesen,
} from "@/hooks/useApi";
import { formatDateTime } from "@/lib/format";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { QuickCreate } from "@/components/layout/QuickCreate";

export function AppHeader() {
  const navigate = useNavigate();
  const { data: benachrichtigungen = [] } = useBenachrichtigungen();
  const ungelesen = benachrichtigungen.filter((b) => !b.gelesen).length;
  const markRead = useMarkBenachrichtigungGelesen();
  const markAllRead = useMarkAlleBenachrichtigungenGelesen();
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border/60 bg-background px-3 sm:gap-3 sm:px-4">
      <SidebarTrigger className="h-9 w-9 shrink-0" />

      {/* Suche: Mobil als Icon-Button, ab sm als breites Feld */}
      <button
        onClick={() => setSearchOpen(true)}
        aria-label="Suchen"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary/30 sm:hidden"
      >
        <Search className="h-4 w-4" />
      </button>
      <button
        onClick={() => setSearchOpen(true)}
        className="hidden h-10 max-w-2xl flex-1 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm text-muted-foreground transition hover:border-primary/30 sm:flex"
      >
        <Search className="h-4 w-4" />
        <span>Suchen…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {/* Mobil: Icon-only Plus-Button */}
        <button
          onClick={() => setCreateOpen(true)}
          aria-label="Neu erstellen"
          className="grid h-10 w-10 shrink-0 place-content-center rounded-lg bg-[linear-gradient(180deg,#3B82F6_0%,#2563EB_55%,#1D4ED8_100%)] text-white shadow-[0_8px_22px_-8px_rgba(37,99,235,0.55)] ring-1 ring-inset ring-white/15 transition active:brightness-95 sm:hidden"
        >
          <Plus className="h-5 w-5" />
        </button>
        <div className="hidden sm:block">
          <PrimaryAction onClick={() => setCreateOpen(true)} label="Neu" />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-full">
              <Bell className="h-4 w-4" />
              {ungelesen > 0 && (
                <Badge className="absolute right-1 top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
                  {ungelesen}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[calc(100vw-1.5rem)] max-w-80 p-0 sm:w-80">
            <div className="flex items-center justify-between border-b p-3">
              <p className="text-sm font-semibold">Benachrichtigungen</p>
              {ungelesen > 0 && (
                <Button variant="ghost" size="sm" onClick={() => markAllRead.mutate()}>
                  Alle gelesen
                </Button>
              )}
            </div>
            <ScrollArea className="max-h-80">
              {benachrichtigungen.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">Keine Benachrichtigungen</p>
              )}
              {benachrichtigungen.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    if (!b.gelesen) markRead.mutate(b.id);
                    if (b.link) {
                      const route = b.link.route as
                        | "/rechnungen/$id"
                        | "/angebote/$id"
                        | "/kunden/$id"
                        | "/objekte/$id";
                      navigate({ to: route, params: b.link.params as never });
                    }
                  }}
                  className={`block w-full border-b p-3 text-left text-sm last:border-b-0 hover:bg-accent ${
                    b.gelesen ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                        b.typ === "warnung"
                          ? "bg-warning"
                          : b.typ === "fehler"
                          ? "bg-destructive"
                          : b.typ === "erfolg"
                          ? "bg-success"
                          : "bg-primary"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="font-medium">{b.titel}</p>
                      <p className="text-muted-foreground">{b.text}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(b.zeitpunkt)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <QuickCreate open={createOpen} onOpenChange={setCreateOpen} />
    </header>
  );
}
