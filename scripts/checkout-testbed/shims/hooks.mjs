/* hooks.mjs - module-resolution hook (runs in Node's loader thread). Maps the deployed functions' remote/npm imports to the local shims.
   The deployed sources are NOT edited: create-checkout imports "https://esm.sh/stripe@14?target=deno&no-check" and "https://esm.sh/@supabase/supabase-js@2";
   stripe-webhook imports "npm:stripe@16" and "npm:@supabase/supabase-js@2". Any other remote/npm import is refused. */
const HERE = new URL("./", import.meta.url);
const MAP = [
  [/^https:\/\/esm\.sh\/stripe@14(\?|$)/, "stripe.mjs"],
  [/^npm:stripe@16$/, "stripe.mjs"],
  [/^https:\/\/esm\.sh\/@supabase\/supabase-js@2$/, "supabase.mjs"],
  [/^npm:@supabase\/supabase-js@2$/, "supabase.mjs"],
];
export async function resolve(specifier, context, next) {
  for (const [re, file] of MAP) if (re.test(specifier)) return { url: new URL(file, HERE).href, shortCircuit: true };
  if (/^(https?:|npm:|jsr:)/.test(specifier)) throw new Error("testbed: unmapped import refused: " + specifier);
  return next(specifier, context);
}
