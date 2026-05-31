import { describe, expect, it } from "vitest";
import {
  parseCheckoutPaymentMethod,
  stripePaymentMethodTypes,
} from "@/lib/checkout-payment-method";

describe("checkout payment methods", () => {
  it("keeps the default checkout card-only", () => {
    expect(parseCheckoutPaymentMethod(undefined)).toBe("card");
    expect(stripePaymentMethodTypes("card")).toEqual(["card"]);
  });

  it("maps the hidden stablecoin choice to Stripe crypto checkout", () => {
    expect(parseCheckoutPaymentMethod("stablecoin")).toBe("stablecoin");
    expect(stripePaymentMethodTypes("stablecoin")).toEqual(["crypto"]);
  });

  it("does not accept arbitrary crypto payment method values", () => {
    expect(parseCheckoutPaymentMethod("usdt")).toBe("card");
    expect(parseCheckoutPaymentMethod("bitcoin")).toBe("card");
  });
});
