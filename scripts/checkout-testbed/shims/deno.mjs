/* deno.mjs - the two Deno APIs the deployed functions use: Deno.env.get and Deno.serve. Nothing else is provided (anything else the function touched would throw, which is the point). */
export function installDeno() {
  const served = {};
  globalThis.Deno = {
    env: { get: (k) => process.env[k] },
    serve: (handler) => { served.last = handler; return { finished: Promise.resolve() }; },
  };
  return served;
}
