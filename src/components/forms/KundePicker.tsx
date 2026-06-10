// Suchbares Kunden-Dropdown.
// Verhalten: Klick öffnet das Popover, Cursor steht sofort im Suchfeld.
// Filter (clientseitig) über Firmenname, Vor-/Nachname, Kürzel und Kundennummer.
// Umlaute (ä/ö/ü/ß) sind beim Suchen toleriert.
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Kunde } from "@/lib/api/types";

interface Props {
  kunden: Kunde[];
  value: string | undefined;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function kundeLabel(k: Kunde): string {
  if (k.firmenname && k.firmenname.trim()) return k.firmenname;
  const name = [k.vorname, k.nachname].filter(Boolean).join(" ").trim();
  return name || k.nummer;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss");
}

export function KundePicker({
  kunden,
  value,
  onChange,
  placeholder = "Kunde wählen…",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () =>
      kunden.map((k) => {
        const label = kundeLabel(k);
        const haystack = normalize(
          [label, k.firmenname, k.vorname, k.nachname, k.kuerzel, k.nummer]
            .filter(Boolean)
            .join(" "),
        );
        return { k, label, haystack };
      }),
    [kunden],
  );

  const aktiv = value ? items.find((i) => i.k.id === value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between px-3 font-normal",
            !aktiv && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {aktiv ? `${aktiv.label}${aktiv.k.kuerzel ? ` · ${aktiv.k.kuerzel}` : ` · ${aktiv.k.nummer}`}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command
          filter={(value, search) => {
            if (!search) return 1;
            return value.includes(normalize(search)) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Suchen…" autoFocus />
          <CommandList>
            <CommandEmpty>Keine Kunden gefunden.</CommandEmpty>
            <CommandGroup>
              {items.map(({ k, label, haystack }) => (
                <CommandItem
                  key={k.id}
                  value={`${haystack} ${k.id}`}
                  onSelect={() => {
                    onChange(k.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === k.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">
                    {label}
                    {k.kuerzel ? ` · ${k.kuerzel}` : ` · ${k.nummer}`}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}