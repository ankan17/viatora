"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { step: "email" | "code"; email: string; error?: string };

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

/** One action for the whole flow; the form's `intent` picks the step. */
export async function signIn(prev: SignInState, form: FormData): Promise<SignInState> {
  const intent = form.get("intent");

  if (intent === "restart") return { step: "email", email: prev.email };

  if (intent === "verify") {
    const token = String(form.get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(token)) return { ...prev, error: "Enter the 6-digit code from the email." };
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ email: prev.email, token, type: "email" });
    if (error) return { ...prev, error: "That code didn't work. Check it, or send a new one." };
    redirect(safeNext(String(form.get("next") ?? "")));
  }

  const raw = String(form.get("email") ?? "");
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { step: "email", email: raw, error: "That doesn't look like an email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data, options: { shouldCreateUser: true } });
  if (error) {
    const message =
      error.status === 429 ? "Too many tries. Wait a minute, then try again." : "We couldn't send the email. Try again in a moment.";
    return { step: "email", email: parsed.data, error: message };
  }
  return { step: "code", email: parsed.data };
}
