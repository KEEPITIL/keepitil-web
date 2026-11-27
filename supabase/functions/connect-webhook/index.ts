// Scaffold only. See webhook.mjs. verify_jwt must be off: Stripe does not send a Supabase JWT.
import { handleWebhook } from './webhook.mjs';

Deno.serve((req: Request) => handleWebhook(req, {
  STRIPE_WEBHOOK_SECRET: Deno.env.get('STRIPE_WEBHOOK_SECRET') || '',
  SUPABASE_URL: Deno.env.get('SUPABASE_URL') || '',
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
}, fetch));
