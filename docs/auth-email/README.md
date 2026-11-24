# One shared sign-in email for KEEPITIL, Find My Weed and TUITEA (DRAFT, NOT APPLIED)

Draft for Muse/Echo review. **Nothing here was pasted anywhere.** The project's current template, subject and sender could not be read from this session (no dashboard session, no management token; that read goes to Joe), so the KEEPITIL branch below is a proposal, not a copy of what customers get today. Before replacing anything, copy the current Magic Link and Confirm signup templates out of the dashboard as the rollback record.

## Files
- `magic-link.shared.html`: the body, three branches (Find My Weed, TUITEA, default KEEPITIL).
- `subject.tmpl`: the subject, same branching.
- `render_test.go` + `go.mod`: renders both with Go's `html/template` against 10 cases (FMW account/root pages, TUITEA, KEEPITIL pages, empty, short, near-prefix, other-host, unicode, absent key). `cd docs/auth-email && go test ./... -v`. Run here with Go 1.14; all pass.

## What a Find My Weed customer would see
- Subject: **Your Find My Weed sign-in link**
- Sender: the project's one sender (see below). Body: "Find My Weed, BY KEEPITIL" header, one green button "Sign in to Find My Weed", the plain link as a fallback, "Did not ask for this? You can ignore this email", footer "Adults 21+ (or 18+ medical patients where state law allows). Licensed businesses only. Questions: info@keepitil.com". No promotion, no health claims, no tracking pixels, no token or OTP shown.

## How ONE template serves all three
Facts, checked in the public Supabase Auth source (`supabase/auth`, `internal/mailer/templatemailer`):
- Subject and body are both Go `html/template`s, **with no custom functions**: no `contains`, no `hasPrefix`, no sprig. Available data: `.SiteURL`, `.ConfirmationURL`, `.Email`, `.Token`, `.TokenHash`, `.Data` (user_metadata), `.RedirectTo`.
- `.SiteURL` is the same for every app (one project), so it cannot branch.
- `.Data.app` (what `fmw-auth.js` sets at sign-up) is a property of the ACCOUNT, not of this request: a person who has both a KEEPITIL and an FMW account would get the wrong brand whichever way it was set. And `signInWithOtp` data only applies when the user is created.
- `.RedirectTo` is the `redirect_to` of THIS request: FMW sends `cleanUrl()`, always under `https://keepitil.com/app/findmyweed/`; KEEPITIL sends `https://keepitil.com/apply`, `location.href` of its own pages, `/reset-password`; TUITEA lives under `https://keepitil.com/app/tuitea`.

So the branch key is a **prefix of `.RedirectTo`**, built from the only prefix tool the engine has: `slice`, guarded by `len` (a slice past the end panics and the email would fail to send). `$r := print .RedirectTo` makes an absent key harmless. Anything that does not match falls through to the KEEPITIL wording, so existing KEEPITIL sign-ins behave as before. `.RedirectTo` is request-controlled and is never printed.

## Things that must hold (the "without breaking the others" list)
1. **Paste the same branching into the Confirm signup template too.** FMW sign-in calls `/auth/v1/otp` with `create_user: true`: an existing user gets the Magic Link email, a NEW user gets Confirm signup (if email confirmation is on). Same guards, "confirm" wording. Recovery (`/reset-password`), Invite and Email change are separate templates and stay KEEPITIL unless changed.
2. **The redirect must be on the project's allowed redirect list** for the branch to ever trigger; otherwise Supabase replaces `redirect_to` with the SiteURL and everything renders KEEPITIL (safe, but FMW users see the KEEPITIL wording). Check `https://keepitil.com/app/findmyweed/**` is allowed.
3. **Sender name and address are global** (one SMTP config per project). Keep the sender "KEEPITIL"; the FMW identity lives in the subject and body ("Find My Weed, by KEEPITIL"). Do not put FMW in the sender: it would brand KEEPITIL mail as Find My Weed.
4. **No new redirect hosts without updating the guards.** A new app needs a new prefix and a new branch; unknown prefixes silently get KEEPITIL wording.
5. Keep `{{ .ConfirmationURL }}` as the only link and as the fallback text; do not add `{{ .Token }}` unless OTP codes are wanted.

## Not verified
Current template/subject/sender on prod; whether the hosted Auth version matches the repo's current main; deliverability (SPF/DKIM of the sender domain); rendering in real mail clients (uses tables and inline styles, no images). The Go tests prove the branching and that nothing errors, not how Gmail or Outlook draw it.

## Test plan (before prod)
1. In a throwaway Supabase project, paste both templates, send to Joe's own inbox with `redirect_to` = an FMW URL, a KEEPITIL URL and none; check subject, body, link works.
2. Paste into prod Magic Link and Confirm signup, one at a time; send to a real inbox; compare with the saved original.
3. Rollback = paste the saved original back (dashboard, seconds; no deploy).
