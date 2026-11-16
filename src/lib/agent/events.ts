import type { ChatMessage } from "./messages";

/** What the chat route streams back, one JSON object per line. */
export type TurnEvent =
  /** The traveller's message, stored. */
  | { type: "user"; message: ChatMessage }
  | { type: "text"; delta: string }
  /** An edit was applied. `itemId` is the item or day it touched, when there is one. */
  | { type: "edit"; summary: string; itemId?: string }
  /** The reply as stored, or null when there was nothing to store. Always sent, and always last. */
  | { type: "done"; message: ChatMessage | null }
  | { type: "error"; message: string };
