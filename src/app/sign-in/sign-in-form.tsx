"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { signIn, type SignInState } from "./actions";

export function SignInForm({ next, linkFailed }: { next?: string; linkFailed: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { step: "email", email: "" });

  if (state.step === "code") {
    return (
      <form action={action} className="flex flex-col gap-4">
        <p className="text-body">
          We sent a sign-in link and a code to <strong>{state.email}</strong>. Tap the link, or enter the code here.
        </p>
        <input type="hidden" name="next" value={next ?? ""} />
        <Field
          id="code"
          name="code"
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
          autoFocus
          error={state.error}
        />
        <Button type="submit" name="intent" value="verify" disabled={pending}>
          {pending ? "Checking…" : "Sign in"}
        </Button>
        <Button type="submit" name="intent" value="restart" variant="ghost" formNoValidate disabled={pending}>
          Use a different email
        </Button>
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {linkFailed && !state.error && (
        <p role="alert" className="rounded-md bg-blush px-3 py-2 text-caption text-plum">
          That link has expired or was already used. Send a new one below.
        </p>
      )}
      <Field
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        autoFocus
        defaultValue={state.email}
        error={state.error}
        hint="We'll email you a link and a code. No password needed."
      />
      <Button type="submit" name="intent" value="send" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
