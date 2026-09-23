import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronDown } from "lucide-react";
import { COUNTRIES } from "@/lib/country-codes";

const Flag = ({ iso }: { iso: string }) => (
  <img
    src={`https://flagcdn.com/w40/${iso.toLowerCase()}.png`}
    alt=""
    width={20}
    height={15}
    loading="lazy"
    className="w-5 h-[15px] rounded-[2px] object-cover shrink-0"
  />
);

export default function CountryPicker({ value, onChange, disabled }: { value: string; onChange: (iso: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const cur = COUNTRIES.find((c) => c.iso === value) ?? COUNTRIES[0];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Country code: ${cur.name} +${cur.dial}`}
          disabled={disabled}
          className="h-12 shrink-0 flex items-center gap-1.5 rounded-md bg-neutral-900 border border-neutral-700 text-white text-sm px-2.5 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#1DB954]/40"
        >
          <Flag iso={cur.iso} />
          <span>+{cur.dial}</span>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country or code" />
          <CommandList className="max-h-64">
            <CommandEmpty>No country found.</CommandEmpty>
            {COUNTRIES.map((c) => (
              <CommandItem
                key={c.iso}
                value={`${c.name} +${c.dial} ${c.iso}`}
                onSelect={() => { onChange(c.iso); setOpen(false); }}
                className="gap-2"
              >
                <Flag iso={c.iso} />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-muted-foreground">+{c.dial}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
