"use server";

import { clearLiveSources } from "@/lib/liveSources";

export async function refreshSources(): Promise<void> {
  clearLiveSources();
}
