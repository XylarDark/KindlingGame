import { describe, expect, it } from "vitest";
import {
  backAtShopToast,
  brand,
  driveToShopFirstToast,
  headBackToShopHint,
  installCoachBodies,
  IS_PORTFOLIO,
} from "./brand";

describe("brand (default Kindling build)", () => {
  it("keeps Kindling identity when VITE_PORTFOLIO is unset", () => {
    expect(IS_PORTFOLIO).toBe(false);
    expect(brand.mark).toBe("KINDLING");
    expect(brand.title).toBe("Kindling");
    expect(brand.welcomeTitle).toBe("Welcome to Kindling Cannabis");
    expect(brand.deliveryHeader).toBe("KINDLING DELIVERY");
    expect(brand.idProvince).toBe("PROVINCE OF KINDLING");
  });

  it("names the shop hub in driver toasts", () => {
    expect(driveToShopFirstToast()).toBe("Drive up to Kindling first.");
    expect(backAtShopToast(2)).toContain("Kindling");
    expect(headBackToShopHint()).toBe("Head back to Kindling");
  });

  it("threads the product name through install-coach copy", () => {
    const bodies = installCoachBodies();
    expect(bodies).toHaveLength(4);
    for (const body of bodies) expect(body).toContain("Kindling");
  });
});
