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

export function driverReadyCopy(bagCount: number): string {
  if (bagCount > 1) {
    return `Tap me to take ${bagCount} packed bags\n— or wait for another delivery.`;
  }
  return "Tap me when you're ready to leave\n— or wait for another delivery.";
}

export const BACK_TO_SHOP_COPY = { label: "BACK TO SHOP", caption: "Return to Kindling" };

export function interactButtonCopy(
  action: string,
): { label: string; caption: string } | null {
  switch (action) {
    case "HANDOFF":
      return { label: "HANDOFF", caption: "Give them the bag" };
    case "ASK ID":
      return { label: "ASK FOR ID", caption: "Tap the customer" };
    case "CHECK ID":
      return { label: "CHECK ID", caption: "Tap the ID card" };
    case "HAND BAG":
      return { label: "HAND BAG", caption: "Tap the bag to hand over" };
    case "PHOTO":
      return { label: "PHOTO", caption: "Tap the bag for a photo" };
    case "PARK":
      return { label: "PARK", caption: "Park in the driveway" };
    default:
      return null;
  }
}
