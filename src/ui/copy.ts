import { MS_PER_GAME_MINUTE } from "../sim/constants";

/** Shared shop copy — title case, en dashes, no slang hours. */
export const MARK = "KINDLING";
export const HOURS = "Open\n9 AM – 11 PM";
export const WELCOME_TITLE = "Welcome to Kindling Cannabis";
export const WELCOME_HINT = "Interact to begin";
export const PAUSE_HINT = "Paused — tap to start";
export const HOWTO_HINT = "Tap, click, or press any key";

/** Under this remaining SLA, bag labels go urgent (danger color). */
export const SLA_URGENT_MS = 10 * MS_PER_GAME_MINUTE;

/** Game-minute countdown. 1 real second = 1 game minute; expired stays LATE. */
export function formatSlaClock(remainingMs: number | null): string {
  if (remainingMs === null) return "";
  if (remainingMs <= 0) return "LATE";
  return `${Math.max(1, Math.ceil(remainingMs / MS_PER_GAME_MINUTE))}m`;
}

export function isSlaUrgent(remainingMs: number | null): boolean {
  return remainingMs !== null && remainingMs <= SLA_URGENT_MS;
}

/** Packed delivery bag: dest, name, and remaining hour. */
export function deliveryBagLabel(destLabel: string, customerName: string, slaRemainingMs: number | null): string {
  const clock = formatSlaClock(slaRemainingMs);
  if (!clock) return `${destLabel}\n${customerName}`;
  return `${destLabel}\n${customerName}  ·  ${clock}`;
}

export function roadButtonCopy(bagCount: number): { label: string; caption: string } {
  if (bagCount > 1) {
    return { label: `HIT THE ROAD  ·  ${bagCount}`, caption: "Take every packed delivery" };
  }
  return { label: "HIT THE ROAD", caption: "Leave with this delivery" };
}

export const BACK_TO_SHOP_COPY = { label: "BACK TO SHOP", caption: "Return to Kindling" };

export function interactButtonCopy(
  action: string,
): { label: string; caption: string } | null {
  switch (action) {
    case "HANDOFF":
      return { label: "HANDOFF", caption: "Give them the bag" };
    case "PHOTO":
      return { label: "PHOTO", caption: "Snap a photo of the bag" };
    case "ASK ID":
      return { label: "ASK FOR ID", caption: "Ask the customer for ID" };
    case "CHECK ID":
      return { label: "CHECK ID", caption: "Confirm they are 19+" };
    case "HAND BAG":
      return { label: "HAND BAG", caption: "Hand over the order" };
    case "PARK":
      return { label: "PARK", caption: "Stop on the GPS pin" };
    default:
      return null;
  }
}
