CREATE OR REPLACE FUNCTION public.mark_payouts_enabled()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.app_users set payouts_enabled = true where id = auth.uid();
$function$
