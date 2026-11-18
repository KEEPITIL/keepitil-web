# 19a music video inquiries (PROPOSAL ONLY)

Status: draft proposal. Not applied anywhere. Not proofed on real Postgres (none was run while drafting; the SQL has not even been parsed). It does not follow the full 11b/r1-fix rehearsal frame (#136-#138) and would need that treatment before any apply.

- Table `music_video_inquiries`: RLS on and forced, no policies, all table privileges revoked from anon/authenticated. Only an admin/service role can read it.
- Insert only through `submit_music_video_inquiry(...)`: SECURITY DEFINER, `search_path ''`, executable by anon. Validates lengths, email shape, https link, consent, attestation, tier enum; honeypot returns true without storing; rate limit 3 per hashed email per 24 h (sha256 of lowercased email; no IP); returns only true/false, never submitted data.
- Retention proposal: delete rows older than 180 days (manual or scheduled job, not wired). Email is stored in plain text because it is needed to reply.
- Front end: `assets/js/music-video-service.js` has an `rpc` path behind `window.KIL_MV_SUBMIT_MODE = 'rpc'` plus `KIL_MV_SUPABASE_URL` / `KIL_MV_SUPABASE_ANON_KEY` (unset; no keys in the repo). Default stays `mailto`.
- Gate before enabling: Sentinel review of spam and privacy, a prod SQL apply with Joe's yes, and a backup. None is requested by this PR.
