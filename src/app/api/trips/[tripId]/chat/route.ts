import { z } from "zod";
import type { TurnEvent } from "@/lib/agent/events";
import { MAX_MESSAGE_LENGTH } from "@/lib/agent/model";
import { runTurn } from "@/lib/agent/run";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// A turn that plans several days makes many model calls.
export const maxDuration = 300;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  dayId: z.uuid().nullable().default(null),
});

/** One chat turn. Streams `TurnEvent`s as newline-delimited JSON. */
export async function POST(request: Request, { params }: RouteContext<"/api/trips/[tripId]/chat">) {
  const { tripId } = await params;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(tripId).success || !body.success) return Response.json({ error: "That message isn't valid." }, { status: 400 });

  const user = await getUser();
  if (!user) return Response.json({ error: "You've been signed out. Sign in again to keep chatting." }, { status: 401 });
  const supabase = await createClient();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: TurnEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The reader has gone away; the turn still finishes and is stored.
        }
      };
      try {
        await runTurn({ supabase, userId: user.id, tripId, ...body.data, signal: request.signal, emit });
      } catch (e) {
        console.error("chat turn crashed", e);
        emit({ type: "error", message: "Something went wrong on my side. Try again." });
        emit({ type: "done", message: null });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
