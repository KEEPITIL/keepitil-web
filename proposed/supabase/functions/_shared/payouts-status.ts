// PROPOSED, NOT DEPLOYED. The ONE rule for "can this organizer be paid", computed on the server from a Stripe
// account object that the server itself read (accounts.retrieve, or an account.updated webhook it verified).
// Nothing a browser says can set it.
import { requireTestObject } from "./stripe-test-guard.ts";

export type PayoutStatus = {
  account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  currently_due: string[];
  disabled_reason: string | null;
  verified: boolean;          // what app_users.payouts_enabled is set to
};

export function statusFromAccount(account: any): PayoutStatus {
  requireTestObject(account, "account");
  if (account.object !== "account" || typeof account.id !== "string" || !/^acct_[A-Za-z0-9]+$/.test(account.id)) {
    throw new Error("not a Stripe account object");
  }
  const req = account.requirements || {};
  const due: string[] = Array.isArray(req.currently_due) ? req.currently_due.filter((x: unknown) => typeof x === "string") : [];
  const disabled = typeof req.disabled_reason === "string" && req.disabled_reason ? req.disabled_reason : null;
  const charges = account.charges_enabled === true, payouts = account.payouts_enabled === true;
  return {
    account_id: account.id,
    charges_enabled: charges,
    payouts_enabled: payouts,
    details_submitted: account.details_submitted === true,
    currently_due: due,
    disabled_reason: disabled,
    verified: charges && payouts && disabled === null,
  };
}

// Arguments for the service-role-only public.set_payouts_from_stripe(text, boolean, boolean, text) that STEP 1 creates
// (keepitil-web #182, proposed/supabase/sql/payouts_flag_lock.PROPOSED.sql). #181's draft also sent p_due, which that
// 4-argument function does not accept: the call would fail in prod. currently_due is returned to the page instead.
export function statusRpcArgs(s: PayoutStatus) {
  return { p_account: s.account_id, p_charges: s.charges_enabled, p_payouts: s.payouts_enabled, p_disabled_reason: s.disabled_reason };
}
