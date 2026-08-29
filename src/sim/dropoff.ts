export type DropoffPhase = "atCurb" | "calling" | "waiting" | "onFoot";

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
  idChecked: boolean;
  actionLabel: string;
  canAct: boolean;
  hint: string;
  idCard: { name: string; dob: string; ageOk: boolean } | null;
}

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
    idChecked: false,
    actionLabel: "",
    canAct: false,
    hint: "",
    idCard: null,
  };
}

export function idCardFor(name: string): { name: string; dob: string; ageOk: boolean } {
  return { name, dob: "14 Mar 1999", ageOk: true };
}
