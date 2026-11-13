import type { Metadata } from "next";
import { ClaimsBoard } from "@/components/residents/claims/ClaimsBoard";
import { argentinaDay } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reclamos · Cota" };

export default function ClaimsPage() {
  return <ClaimsBoard today={argentinaDay()} />;
}
