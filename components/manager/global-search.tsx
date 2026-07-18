"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Package, Search, User } from "lucide-react";

import { globalSearch, type SearchResult } from "@/lib/actions/search";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(() => {
      globalSearch(query)
        .then(setResults)
        .finally(() => setIsSearching(false));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    router.push(result.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/20 px-3.5 py-2.5 text-sm text-muted-foreground transition-colors hover:border-secondary hover:text-foreground"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search everything…</span>
        <kbd className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg gap-0 p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">Global Search</DialogTitle>
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order #, customer, phone, employee, product, notes…"
              className="border-0 px-0 shadow-none focus-visible:ring-0"
            />
            {isSearching && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
          </div>

          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {query.trim().length >= 2 && !isSearching && results.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No matches for &quot;{query}&quot;.</p>
            )}
            {query.trim().length < 2 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Type at least 2 characters to search.</p>
            )}
            {results.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                type="button"
                onClick={() => handleSelect(result)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
                  {result.type === "order" ? <Package className="size-4" /> : <User className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{result.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
