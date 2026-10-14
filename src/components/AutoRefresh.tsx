"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_MS = 5 * 60 * 1000;

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    // Cached source responses expire well before the next tick, so a plain refresh already brings
    // fresh data without clearing the shared server cache for every open tab.
    const refresh = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
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
