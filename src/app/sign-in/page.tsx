import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-display">Plan your trip together</h1>
        <p className="text-body text-muted">Chat through the plan, and keep one itinerary everyone can trust.</p>
      </div>
      <div className="rounded-lg bg-raised p-4 shadow-[0_1px_0_var(--hairline)]">
        <Suspense>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const { next, error } = await searchParams;
  return <SignInForm next={typeof next === "string" ? next : undefined} linkFailed={error === "link"} />;
}
