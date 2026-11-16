import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TripScreen } from "@/components/itinerary/trip-screen";
import { requireUser } from "@/lib/auth";
import { loadItinerary } from "@/lib/itinerary/snapshot";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/trips/[tripId]">): Promise<Metadata> {
  const { tripId } = await params;
  if (!UUID.test(tripId)) return { title: "Trip" };
  const supabase = await createClient();
  const { data } = await supabase.from("trips").select("name").eq("id", tripId).maybeSingle();
  return { title: data?.name ?? "Trip" };
}

export default function TripPage({ params }: PageProps<"/trips/[tripId]">) {
  return (
    <Suspense fallback={<div className="h-dvh animate-pulse bg-ground" aria-hidden />}>
      <Trip params={params} />
    </Suspense>
  );
}

async function Trip({ params }: Pick<PageProps<"/trips/[tripId]">, "params">) {
  await requireUser();
  const { tripId } = await params;
  if (!UUID.test(tripId)) notFound();
  const itinerary = await loadItinerary(await createClient(), tripId);
  if (!itinerary) notFound();
  return <TripScreen itinerary={itinerary} />;
}
