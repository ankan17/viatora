import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { tripSpan } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export const metadata: Metadata = { title: "Your trips" };

export default function TripsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-10 pt-[max(env(safe-area-inset-top),24px)]">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-display">Your trips</h1>
        <form action={signOut}>
          <button className="min-h-11 rounded-sm px-3 text-caption text-muted hover:bg-blush">Sign out</button>
        </form>
      </header>
      <Suspense fallback={<TripListSkeleton />}>
        <TripList />
      </Suspense>
    </main>
  );
}

async function TripList() {
  await requireUser();
  const supabase = await createClient();
  const { data: trips, error } = await supabase
    .from("trips")
    .select("id, name, destination, start_date, days(count)")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  if (trips.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-lg bg-raised p-6">
        <h2 className="text-title">Where to first?</h2>
        <p className="text-body text-muted">
          Start a trip and we&apos;ll plan it together, day by day. You can add dates and people later.
        </p>
        <ButtonLink href="/trips/new">Start a trip</ButtonLink>
      </section>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {trips.map((t) => (
          <li key={t.id}>
            <Link
              href={`/trips/${t.id}`}
              className="flex min-h-11 flex-col gap-1 rounded-md bg-raised p-3 shadow-[0_0_0_1px_var(--hairline)] hover:shadow-[0_0_0_1px_var(--outline)]"
            >
              <span className="font-display text-heading">{t.name}</span>
              <span className="text-caption text-muted">
                {[t.destination, tripSpan(t.start_date, t.days[0]?.count ?? 0)].filter(Boolean).join(" · ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <ButtonLink href="/trips/new" variant="secondary" className="self-start">
        Start another trip
      </ButtonLink>
    </>
  );
}

function TripListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      {[0, 1].map((i) => (
        <div key={i} className="h-[68px] animate-pulse rounded-md bg-raised" />
      ))}
    </div>
  );
}
