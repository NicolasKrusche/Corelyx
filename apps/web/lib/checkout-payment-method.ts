export type CheckoutPaymentMethod = "card" | "stablecoin";

export function parseCheckoutPaymentMethod(value: unknown): CheckoutPaymentMethod {
  return value === "stablecoin" ? "stablecoin" : "card";
}

export function stripePaymentMethodTypes(
  paymentMethod: CheckoutPaymentMethod
): Array<"card" | "crypto"> {
  return paymentMethod === "stablecoin" ? ["crypto"] : ["card"];
}
