import type { Metadata } from "next";
import Link from "next/link";
import { NewTripForm } from "./new-trip-form";

export const metadata: Metadata = { title: "New trip" };

export default function NewTripPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10 pt-[max(env(safe-area-inset-top),24px)]">
      <Link href="/trips" className="self-start text-caption text-plum">
        ← Your trips
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-display">Start a trip</h1>
        <p className="text-body text-muted">Just the basics for now. Dates help with weather and opening hours, but they can wait.</p>
      </div>
      <div className="rounded-lg bg-raised p-4">
        <NewTripForm />
      </div>
    </main>
  );
}
