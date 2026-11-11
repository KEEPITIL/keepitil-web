/* testbed-db.mjs - builds the isolated LOCAL database(s) and the PostgREST-style request helper. Postgres: local socket only (pg-local, port 54329); one database per run, dropped at the end.
   S0 template  = replica of the captured prod state (13A replica + testbed additions + VERBATIM fulfill/refund/get_my_tickets/get_ticket + the ORIGINAL door functions).
   HARD template = S0 + the committed 12A packs 01+02 + 13A pack 01 applied by running the pack files themselves (their drift guards must accept S0, which is itself a fidelity check). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as PG from "./pgdb.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const IN = (f) => readFileSync(join(HERE, "..", "db-inputs", f), "utf8");
const INP = (f) => readFileSync(join(HERE, "..", "proposed", f), "utf8");
export { PG };

export async function runPack(c, sql) {
  try { const r = await c.query(sql); const arr = Array.isArray(r) ? r : [r]; const rows = [...arr].reverse().find((x) => x.rows && x.rows.length && x.fields && x.fields.some((f) => f.name === "ok")); return { ok: true, rows: rows ? rows.rows : [] }; }
  catch (e) { try { await c.query("ROLLBACK"); } catch {} return { ok: false, err: String(e.message) }; }
}

export async function buildTemplates({ money = false } = {}) {
  await PG.ensureRoles();
  const base = await PG.createDb(null); const c = base.client;
  await c.query(IN("replica-13a.sql").replace("-- @@REFUND_VERBATIM@@", IN("refund_ticket_order.VERBATIM.sql") + ";").replace("-- @@LIVE_READERS_VERBATIM@@", IN("live-readers.VERBATIM.sql")));
  await c.query(IN("testbed-additions.sql"));
  await c.query(IN("fulfill_ticket_order.verbatim.sql"));
  await c.query("REVOKE ALL ON FUNCTION public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text) TO service_role;");
  await c.query(IN("orig-door-functions.sql").replace(/\$function\$\s*\nCREATE/, () => "$function$;\nCREATE"));   // the two captured bodies are stored back to back without a terminator
  await c.query("REVOKE ALL ON FUNCTION public.check_in_ticket(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.check_in_ticket(text) TO anon, authenticated, service_role;");
  await c.query("REVOKE ALL ON FUNCTION public.event_checkin_scan(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.event_checkin_scan(text) TO authenticated, service_role;");
  const s0 = (await PG.snapshotDb(base)).pgTemplate;
  const packLog = [];
  for (const f of ["12a_01_event_checkin_scan_APPLY_PROPOSED.sql", "12a_02_check_in_ticket_APPLY_PROPOSED.sql", "13a_01_event_orders_APPLY_PROPOSED.sql"]) {
    const r = await runPack(base.client, IN(f)); packLog.push({ pack: f, ok: r.ok && (!r.rows?.length || r.rows.every((x) => x.ok === true)), checks: r.rows?.length, err: r.err });
    if (!packLog.at(-1).ok) throw new Error("pack " + f + " did not apply on the replica: " + (r.err || JSON.stringify((r.rows || []).filter((x) => x.ok !== true))));
  }
  if (money) {   // 14A-01 money hardening on top of the 12A/13A-hardened state, by running the pack file itself
    const f = "14a_01_checkout_money_hardening_APPLY_PROPOSED.sql"; const r = await runPack(base.client, INP(f)); packLog.push({ pack: f, ok: r.ok && !!r.rows?.length && r.rows.every((x) => x.ok === true), checks: r.rows?.length, err: r.err });
    if (!packLog.at(-1).ok) throw new Error("pack " + f + " did not apply on the replica: " + (r.err || JSON.stringify((r.rows || []).filter((x) => x.ok !== true))));
  }
  const hard = (await PG.snapshotDb(base)).pgTemplate;
  await base.close();
  return { s0, hard, packLog };
}

/* PostgREST-shaped request: BEGIN; SET LOCAL ROLE; claims; stmt; COMMIT. Returns {rows,rowCount,command} or {err,code}. */
export function makeReq(client) {
  return async (who, sql, params) => {
    try {
      await client.query("BEGIN"); await client.query(`SET LOCAL ROLE ${who.role}`);
      await client.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.email',$2,true)", [who.sub || "", who.email || ""]);
      const r = await client.query(sql, params); await client.query("COMMIT");
      return { rows: JSON.parse(JSON.stringify(r.rows)), rowCount: r.rowCount, command: r.command };
    } catch (e) { try { await client.query("ROLLBACK"); } catch {} return { err: e.message, code: e.code }; }
  };
}

export async function insertFixture(pc, ids) {
  const sql = `
insert into auth.users (id, email) values ('${ids.org}','organizer@example.test'),('${ids.buyer}','buyer@example.test'),('${ids.other}','other@example.test'),('${ids.nohandle}','nohandle@example.test'),('${ids.org2}','org2@example.test');
insert into public.app_users (id, handle, email, display_name, stripe_account_id, payouts_enabled) values
 ('${ids.org}','orghandle','organizer@example.test','Organizer One','acct_local_FAKE_org',true),
 ('${ids.buyer}','buyerhandle','buyer@example.test','Buyer','',false),
 ('${ids.other}','otherhandle','other@example.test','Other Organizer','acct_local_FAKE_other',true),
 ('${ids.org2}','nopayouts','org2@example.test','No Payouts Org',null,false);
insert into public.events (id, slug, title, owner_handle, status, starts_at) overriding system value values
 (1,'testbed-night','Testbed Night','orghandle','published', now() + interval '30 days'),
 (2,'no-payout-night','No Payout Night','nopayouts','published', now() + interval '30 days'),
 (3,'ownerless-night','Ownerless Night',null,'published', now() + interval '30 days');
insert into public.ticket_tiers (id, event_id, name, price_cents, qty_total, qty_sold, currency, sales_start, sales_end) overriding system value values
 (1,1,'Dollar GA',100,100,0,'usd',null,null),
 (2,1,'Twenty-five GA',2500,100,0,'usd',null,null),
 (3,1,'Sold out',500,1,1,'usd',null,null),
 (4,1,'Not yet',500,10,0,'usd', now() + interval '5 days', null),
 (5,1,'Ended',500,10,0,'usd', null, now() - interval '5 days'),
 (6,1,'Almost gone',500,3,1,'usd',null,null),
 (7,1,'Control tier',500,50,0,'usd',null,null),
 (8,2,'Orphan GA',1000,10,0,'usd',null,null),
 (9,3,'Ownerless GA',1000,10,0,'usd',null,null);
select setval(pg_get_serial_sequence('public.events','id'), 100), setval(pg_get_serial_sequence('public.ticket_tiers','id'), 100);`;
  await pc.query(sql);
}
