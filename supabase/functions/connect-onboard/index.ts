// Scaffold only. See connect.mjs for the required live secrets. Merging this file does not deploy it.
import { handleOnboard } from './connect.mjs';

Deno.serve((req: Request) => handleOnboard(req, {
  STRIPE_SECRET_KEY: Deno.env.get('STRIPE_SECRET_KEY') || '',
  SUPABASE_URL: Deno.env.get('SUPABASE_URL') || '',
  SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') || '',
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  SITE_URL: Deno.env.get('SITE_URL') || 'https://keepitil.com',
}, fetch));
