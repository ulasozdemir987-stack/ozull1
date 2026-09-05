"use client";

import { TopBar } from "@/components/layout/TopBar";
import { CatalogBrowser } from "@/components/catalog/CatalogBrowser";
import { useDizilerKategoriler, useDizilerList } from "@/lib/hooks";
import type { Diziler } from "@/lib/xtream/types";
import { yearFrom } from "@/lib/utils";

export default function DizilerPage() {
  const { data: cats = [] } = useDizilerKategoriler();

  return (
    <>
      <TopBar title="Diziler" />
      <CatalogBrowser<Diziler>
        sectionKey="series"
        categories={cats}
        useItems={useDizilerList}
        toPoster={(s) => ({
          id: s.series_id,
          name: s.name,
          poster: s.cover,
          rating: s.rating,
          year: yearFrom(s.releaseDate, s.release_date, s.name),
        })}
        hrefFor={(s) => `/series/${s.series_id}`}
        emptyLabel="Bu kategoride dizi yok."
      />
    </>
  );
}
