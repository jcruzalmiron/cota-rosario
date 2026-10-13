"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { refreshSources } from "@/app/actions";

const REFRESH_MS = 5 * 60 * 1000;

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let refreshing = false;
    const refresh = async () => {
      if (document.visibilityState === "visible") {
        if (refreshing) return;
        refreshing = true;
        try { await refreshSources(); router.refresh(); }
        catch { /* Keep the current view and its original timestamps if the connection fails. */ }
        finally { refreshing = false; }
      }
    };
    const interval = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
}
