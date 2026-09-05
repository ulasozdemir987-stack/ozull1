"use client";

import { useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Ara as AraIcon } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PosterCard } from "@/components/catalog/PosterCard";
import { PosterGridSkeleton } from "@/components/ui/Skeleton";
import { useVodStreams, useDizilerList, useCanlıStreams } from "@/lib/hooks";
import { useUI } from "@/store/ui";
import { cleanName, yearFrom } from "@/lib/utils";

function AraInner() {
  const params = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  // Ara term is persisted, but a ?q= deep link (e.g. from the top bar) wins.
  const q = useUI((s) => s.searchQuery);
  const setAraQuery = useUI((s) => s.setAraQuery);
  const setQ = setAraQuery;
  useEffect(() => {
    if (urlQuery && urlQuery !== q) setAraQuery(urlQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);

  const movies = useVodStreams();
  const series = useDizilerList();
  const live = useCanlıStreams();

  const term = q.trim().toLowerCase();
  const match = (name: string) => term.length > 0 && cleanName(name).toLowerCase().includes(term);

  const mr = useMemo(() => (movies.data ?? []).filter((m) => match(m.name)).slice(0, 28), [movies.data, term]);
  const sr = useMemo(() => (series.data ?? []).filter((s) => match(s.name)).slice(0, 28), [series.data, term]);
  const lr = useMemo(() => (live.data ?? []).filter((c) => match(c.name)).slice(0, 28), [live.data, term]);

  const loading = movies.isLoading || series.isLoading || live.isLoading;
  const total = mr.length + sr.length + lr.length;

  return (
    <>
      <TopBar title="Ara" />
      <div className="px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-ink-850 px-4 py-3">
          <AraIcon className="h-5 w-5 text-fog-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ara movies, series and live channels…"
            className="w-full bg-transparent text-base placeholder:text-fog-500 focus:outline-none"
          />
        </div>
      </div>

      {term.length === 0 ? (
        <p className="px-8 py-24 text-center text-sm text-fog-500">Her şeyi aramak için yazmaya başlayın.</p>
      ) : loading ? (
        <div className="py-5"><PosterGridSkeleton /></div>
      ) : total === 0 ? (
        <p className="px-8 py-24 text-center text-sm text-fog-500">No results for “{q}”.</p>
      ) : (
        <div className="space-y-10 pb-12">
          <ResultGrid title="Filmler" count={mr.length}>
            {mr.map((m) => (
              <PosterCard key={m.stream_id} href={`/movies/${m.stream_id}`} item={{ id: m.stream_id, name: m.name, poster: m.stream_icon, rating: m.rating, year: yearFrom(m.name) }} />
            ))}
          </ResultGrid>
          <ResultGrid title="Diziler" count={sr.length}>
            {sr.map((s) => (
              <PosterCard key={s.series_id} href={`/series/${s.series_id}`} item={{ id: s.series_id, name: s.name, poster: s.cover, rating: s.rating, year: yearFrom(s.releaseDate, s.name) }} />
            ))}
          </ResultGrid>
          <ResultGrid title="Canlı Kanallar" count={lr.length}>
            {lr.map((c) => (
              <PosterCard key={c.stream_id} href={`/watch?type=live&id=${c.stream_id}&ext=ts&title=${encodeURIComponent(cleanName(c.name))}`} item={{ id: c.stream_id, name: c.name, poster: c.stream_icon, subtitle: "Canlı" }} />
            ))}
          </ResultGrid>
        </div>
      )}
    </>
  );
}

function ResultGrid({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section>
      <h2 className="mb-3 px-5 text-lg font-semibold sm:px-8">
        {title} <span className="text-sm font-normal text-fog-500">({count})</span>
      </h2>
      <div className="grid grid-cols-2 gap-4 px-5 sm:grid-cols-3 sm:px-8 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {children}
      </div>
    </section>
  );
}

export default function AraPage() {
  return (
    <Suspense fallback={<TopBar title="Ara" />}>
      <AraInner />
    </Suspense>
  );
}
