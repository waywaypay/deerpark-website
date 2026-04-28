import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import type { DispatchEntry } from "@/lib/dispatch";

export const DispatchList = ({ entries }: { entries: DispatchEntry[] }) => (
  <ul className="border-t border-foreground/15 divide-y divide-foreground/10">
    {entries.map((entry) => {
      const inner = (
        <div className="grid grid-cols-12 gap-4 px-1 md:px-3 py-5 items-baseline group hover:bg-foreground/[0.025] transition-colors">
          <div className="col-span-3 md:col-span-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-sans">{entry.date}</div>
            <div className="text-sm font-serif text-foreground mt-1">{entry.dateLong}</div>
          </div>
          <div className="col-span-9 md:col-span-8 flex flex-col gap-1">
            <div className="text-base md:text-lg font-serif leading-snug text-foreground">{entry.title}</div>
            <div className="text-sm text-muted-foreground font-light leading-relaxed line-clamp-2">{entry.dek}</div>
          </div>
          <div className="hidden md:flex col-span-2 items-baseline justify-end gap-3">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground border border-foreground/20 px-2 py-1">
              {entry.tag}
            </span>
            {entry.id !== undefined && (
              <ArrowRight className="w-3.5 h-3.5 text-foreground/40 group-hover:text-foreground transition-colors" />
            )}
          </div>
        </div>
      );
      const key = `${entry.dateLong}-${entry.title}`;
      return (
        <li key={key}>
          {entry.id !== undefined ? (
            <Link href={`/dispatch/${entry.id}`} className="block">{inner}</Link>
          ) : (
            inner
          )}
        </li>
      );
    })}
  </ul>
);
