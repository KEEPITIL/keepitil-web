// PROPOSED, NOT DEPLOYED. TEST MODE ONLY guard for the Stripe Connect payout drafts.
// Every function here reads STRIPE_TEST_SECRET_KEY (never the live STRIPE_SECRET_KEY) and passes it through
// requireTestKey before building a Stripe client, and every Stripe object it acts on through requireTestObject.
// Errors never echo the key.

export class StripeModeError extends Error {
  constructor(message: string) { super(message); this.name = "StripeModeError"; }
}

// Only a secret TEST key: "sk_test_" + at least 8 key characters. Refuses sk_live_, rk_live_, rk_test_ (restricted),
// pk_ (publishable), whitespace, empty and missing values.
export function requireTestKey(key: unknown): string {
  if (typeof key !== "string" || !/^sk_test_[A-Za-z0-9]{8,}$/.test(key)) {
    throw new StripeModeError("refusing to run: the Stripe key is not a secret TEST key (sk_test_...)");
  }
  return key;
}

// Only an object Stripe marks as test mode. livemode must be exactly false; true, missing or any other value is refused.
export function requireTestObject<T>(obj: T, what = "object"): T {
  if (!obj || typeof obj !== "object" || (obj as { livemode?: unknown }).livemode !== false) {
    throw new StripeModeError(`refusing: the Stripe ${what} is not a test-mode object (livemode must be false)`);
  }
  return obj;
}
