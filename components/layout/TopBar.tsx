"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Ara, LogOut, Kullanıcı, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function TopBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data } = useQuery({ queryKey: ["session"], queryFn: api.session });

  const submitAra = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const logout = async () => {
    // Prevent the login page from immediately auto-reconnecting after an
    // intentional sign-out. A normal manual login clears this flag.
    window.localStorage.setItem("lumen-manual-logout", "1");
    await api.logout();
    router.replace("/login");
    router.refresh();
  };

  const expiry =
    data?.user_info?.exp_date && data.user_info.exp_date !== "null"
      ? new Date(Number(data.user_info.exp_date) * 1000).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "Sınırsız";

  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-white/5 bg-ink-950/70 px-5 py-3.5 backdrop-blur-xl sm:px-8">
      <form onSubmit={submitAra} className="ml-auto hidden sm:block">
        <div className="group flex w-64 items-center gap-2 rounded-full border border-white/8 bg-ink-850/80 px-3.5 py-2 transition-colors focus-within:border-iris-400/60">
          <Ara className="h-4 w-4 text-fog-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Her şeyi ara…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-fog-500 focus:outline-none"
          />
        </div>
      </form>

      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative ml-auto grid h-10 w-10 place-items-center rounded-full border border-white/8 bg-ink-850 text-fog-300 transition-colors hover:text-foreground sm:ml-0",
        )}
        aria-label="Hesap"
      >
        <Kullanıcı className="h-5 w-5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-5 top-16 z-40 w-72 rounded-2xl panel p-4 sm:right-8">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">Hesap</span>
              <button onClick={() => setOpen(false)} className="text-fog-500 hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Kullanıcı" value={data?.username ?? "—"} />
              <Row label="Durum" value={data?.user_info?.status ?? "—"} />
              <Row label="Bitiş" value={expiry} />
              <Row
                label="Bağlantılar"
                value={
                  data?.user_info
                    ? `${data.user_info.active_cons} / ${data.user_info.max_connections}`
                    : "—"
                }
              />
            </dl>
            <button
              onClick={async () => {
                await api.logout();
                window.localStorage.removeItem("lumen-manual-logout");
                router.replace("/login");
                router.refresh();
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-700 py-2.5 text-sm font-medium text-fog-300 transition-colors hover:bg-iris-400/10 hover:text-foreground"
            >
              <Kullanıcı className="h-4 w-4" /> Profil değiştir
            </button>
            <button
              onClick={logout}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-700 py-2.5 text-sm font-medium text-fog-300 transition-colors hover:bg-red-500/15 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" /> Çıkış yap
            </button>
          </div>
        </>
      )}
    </header>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fog-500">{label}</dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}
