"use client";

import { TopBar } from "@/components/layout/TopBar";
import { LiveBrowser } from "@/components/catalog/LiveBrowser";

export default function CanlıPage() {
  return (
    <>
      <TopBar title="Canlı TV" />
      <LiveBrowser />
    </>
  );
}
