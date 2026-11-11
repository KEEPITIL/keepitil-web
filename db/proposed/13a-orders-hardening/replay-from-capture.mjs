/* replay-from-capture.mjs - builds, from the rows of CAPTURE-READONLY.sql ALONE (name/value pairs saved before the first write), the SQL that restores the captured ORIGINAL state of
   everything the 12A / 13A packs touch: function definitions (pg_get_functiondef text), function ACLs, event_orders table ACL and policies, and removal of objects the capture says were absent.
   This is the proof that the definition capture is a sufficient backup for rollback-to-original (RUNBOOK section 2). It REOPENS the holes: it is the explicit-override path, never a default.
   Proposal only: used by the proof (_job30/prove.mjs, test J21); nothing here connects to any database. */
const PRIV = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE", D: "TRUNCATE", x: "REFERENCES", t: "TRIGGER", m: "MAINTAIN", X: "EXECUTE", U: "USAGE", C: "CREATE" };
const parseAcl = (raw) => (raw === "(default)" || !raw ? [] : raw.replace(/^\{|\}$/g, "").split(",").filter(Boolean).map((e) => { const [g, rest] = e.split("="); const [privs] = rest.split("/"); return { grantee: g, privs: [...privs.replace(/\*/g, "")].map((c) => PRIV[c]) }; }));
const q = (s) => '"' + s.replace(/"/g, '""') + '"';
export function replaySql(rows) {
  const get = (n) => rows.find((r) => r.name === n)?.value;
  const out = ["BEGIN;", "SET LOCAL lock_timeout = '5s';"];
  const sigs = rows.filter((r) => r.name.startsWith("fn.def:")).map((r) => r.name.slice(7));
  const absent = rows.filter((r) => r.name.startsWith("fn.absent:")).map((r) => r.name.slice(10));
  for (const sig of absent) out.push(`DROP FUNCTION IF EXISTS ${sig};`);              // objects the capture says did not exist (core, helper)
  for (const sig of sigs) {
    const def = get("fn.def:" + sig).trimEnd();
    if (sig.startsWith("public.get_ticket(") && absent.includes("public.get_ticket__orig_13a(text)")) { /* wrapper may exist: drop it so the captured definition is a plain re-create */ }
    out.push(def + ";");
    out.push(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated, service_role;`);
    for (const a of parseAcl(get("fn.acl_raw:" + sig))) if (a.grantee !== "postgres" && a.grantee !== "") out.push(`GRANT EXECUTE ON FUNCTION ${sig} TO ${q(a.grantee)};`);
    const attrs = get("fn.attrs:" + sig) || ""; const own = /owner=(\S+)/.exec(attrs)?.[1]; if (own && own !== "postgres") out.push(`ALTER FUNCTION ${sig} OWNER TO ${q(own)};`);
  }
  // orders policies: drop every live one, re-create exactly the captured ones
  out.push(`DO $r$ DECLARE p text; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='event_orders' LOOP EXECUTE format('DROP POLICY %I ON public.event_orders', p); END LOOP; END $r$;`);
  for (const r of rows.filter((x) => x.name.startsWith("orders.policy:"))) {
    const name = r.name.slice(14), v = r.value; const m = /^cmd=(\w+) roles=(.*?) (PERMISSIVE|RESTRICTIVE) USING (.*)$/s.exec(v); if (!m) throw new Error("unparseable policy capture: " + name);
    const i = m[4].lastIndexOf(" WITH CHECK "); const using = m[4].slice(0, i), check = m[4].slice(i + 12);
    out.push(`CREATE POLICY ${q(name)} ON public.event_orders AS ${m[3]} FOR ${m[1]} TO ${m[2].split(",").map(q).join(", ")}${using !== "(null)" ? ` USING (${using})` : ""}${check !== "(null)" ? ` WITH CHECK (${check})` : ""};`);
  }
  out.push("REVOKE ALL ON TABLE public.event_orders FROM PUBLIC, anon, authenticated, service_role;");
  for (const a of parseAcl(get("orders.acl_raw"))) if (a.grantee !== "postgres" && a.grantee !== "") out.push(`GRANT ${a.privs.join(", ")} ON TABLE public.event_orders TO ${q(a.grantee)};`);
  out.push("COMMIT;");
  return out.join("\n") + "\n";
}
