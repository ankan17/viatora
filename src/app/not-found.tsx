import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-start justify-center gap-3 px-4">
      <h1 className="text-title">We can&apos;t find that</h1>
      <p className="text-body text-muted">It may have been deleted, or it belongs to someone else.</p>
      <ButtonLink href="/trips">Back to your trips</ButtonLink>
    </main>
  );
}
