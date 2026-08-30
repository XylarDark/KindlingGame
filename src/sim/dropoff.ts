export type DropoffPhase = "atCurb" | "calling" | "atDoor";

export interface IdCard {
  name: string;
  dob: string;
  ageOk: boolean;
  age: number;
}

export interface DropoffView {
  phase: DropoffPhase | "none";
  orderId: string | null;
  houseId: string | null;
  customerName: string | null;
  skuName: string | null;
  atCurb: boolean;
  driverOnFoot: boolean;
  driver: { x: number; y: number } | null;
  customer: { x: number; y: number; arrived: boolean } | null;
  photoTaken: boolean;
  idAsked: boolean;
  idChecked: boolean;
  bagHanded: boolean;
  actionLabel: string;
  canAct: boolean;
  hint: string;
  idCard: IdCard | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Legal age for a completed drop — 19 and older. */
export const DROPOFF_MIN_AGE = 19;

export function emptyDropoff(): DropoffView {
  return {
    phase: "none",
    orderId: null,
    houseId: null,
    customerName: null,
    skuName: null,
    atCurb: false,
    driverOnFoot: false,
    driver: null,
    customer: null,
    photoTaken: false,
    idAsked: false,
    idChecked: false,
    bagHanded: false,
    actionLabel: "",
    canAct: false,
    hint: "",
    idCard: null,
  };
}

/** Stable 32-bit hash so the same order always gets the same ID. */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** About 1 in 4 customers are under 19. Same seed always yields the same age. */
export function ageForSeed(seed: string): number {
  const h = hashSeed(seed);
  if (h % 4 === 0) return 16 + (h % 3);
  return DROPOFF_MIN_AGE + (h % 28);
}

export function idCardFor(name: string, ageOrSeed: number | string): IdCard {
  const age = typeof ageOrSeed === "number" ? ageOrSeed : ageForSeed(`${ageOrSeed}:${name}`);
  const h = hashSeed(`${name}:${age}`);
  const year = 2026 - age;
  const day = 1 + (h % 28);
  const month = MONTHS[(h >>> 8) % 12]!;
  return {
    name,
    dob: `${day} ${month} ${year}`,
    ageOk: age >= DROPOFF_MIN_AGE,
    age,
  };
}
