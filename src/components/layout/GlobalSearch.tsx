import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useSearch } from "@/hooks/useApi";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowLeft, Building2, FileText, FolderClosed, Receipt, Search, StickyNote, Users, X } from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  kunde: Users,
  objekt: Building2,
  angebot: FileText,
  rechnung: Receipt,
  dokument: FolderClosed,
  notiz: StickyNote,
};

const GROUP_LABEL: Record<string, string> = {
  kunde: "Kunden",
  objekt: "Objekte",
  angebot: "Angebote",
  rechnung: "Rechnungen",
  dokument: "Dokumente",
  notiz: "Notizen",
};

export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const { data = [] } = useSearch(q);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onOpenChange]);

  // AutoFocus auf Mobil + Body-Scroll-Lock, wenn Sheet offen
  useEffect(() => {
    if (open && isMobile) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        clearTimeout(t);
        document.body.style.overflow = prev;
      };
    }
  }, [open, isMobile]);

  const grouped = data.reduce<Record<string, typeof data>>((acc, t) => {
    (acc[t.typ] ??= []).push(t);
    return acc;
  }, {});

  const handleSelect = (t: (typeof data)[number]) => {
    onOpenChange(false);
    setQ("");
    const route = t.link.route as
      | "/kunden/$id"
      | "/objekte/$id"
      | "/angebote/$id"
      | "/rechnungen/$id"
      | "/dokumente";
    navigate({ to: route, params: t.link.params as never });
  };

  const resultsList = (
    <>
      <CommandEmpty>{q ? "Nichts gefunden." : "Tippe zum Suchen …"}</CommandEmpty>
      {Object.entries(grouped).map(([typ, items]) => {
        const Icon = ICONS[typ] ?? FileText;
        return (
          <CommandGroup key={typ} heading={GROUP_LABEL[typ] ?? typ}>
            {items.map((t) => (
              <CommandItem
                key={`${t.typ}-${t.id}`}
                value={`${t.typ}-${t.id}-${t.titel}`}
                onSelect={() => handleSelect(t)}
              >
                <Icon className="mr-2 h-4 w-4" />
                <div className="flex flex-col">
                  <span>{t.titel}</span>
                  {t.untertitel && (
                    <span className="text-xs text-muted-foreground">{t.untertitel}</span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        );
      })}
    </>
  );

  // Mobil: Inline Top-Sheet (kein zentraler Dialog)
  if (isMobile) {
    if (!open) return null;
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Suche"
        className="fixed inset-0 z-50 flex flex-col bg-background motion-safe:animate-in motion-safe:slide-in-from-top-4 motion-safe:duration-200"
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-3 py-2.5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Zurück"
            className="grid h-9 w-9 shrink-0 place-content-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="relative flex min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suche überall …"
              className="h-10 w-full rounded-full border border-border bg-card pl-9 pr-9 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  inputRef.current?.focus();
                }}
                aria-label="Eingabe löschen"
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-content-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Command shouldFilter={false} className="bg-background">
            <CommandList className="max-h-none">{resultsList}</CommandList>
          </Command>
        </div>
      </div>
    );
  }

  // Desktop: zentraler Command-Dialog wie bisher
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Suche überall …" value={q} onValueChange={setQ} />
      <CommandList>{resultsList}</CommandList>
    </CommandDialog>
  );
}
