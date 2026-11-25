# One shared sign-in email for KEEPITIL, Find My Weed and TUITEA (DRAFT, NOT APPLIED)

Draft for Muse/Echo review. **Nothing here was pasted anywhere.** The project's current template, subject and sender could not be read from this session (no dashboard session, no management token; that read goes to Joe), so the KEEPITIL branch below is a proposal, not a copy of what customers get today. Before replacing anything, copy the current Magic Link and Confirm signup templates out of the dashboard as the rollback record.

## Files
- `magic-link.shared.html`: the body, three branches (Find My Weed, TUITEA, default KEEPITIL).
- `subject.tmpl`: the subject, same branching.
- `recovery.shared.html` + `recovery-subject.tmpl`: the **Reset Password** email, same three branches and the same prefix rules (TUITEA password recovery lands on `https://keepitil.com/app/tuitea/password/`). Paste into Supabase Auth > Email Templates > Reset Password.
- `render_test.go` + `go.mod`: renders both with Go's `html/template` against 10 cases (FMW account/root pages, TUITEA, KEEPITIL pages, empty, short, near-prefix, other-host, unicode, absent key). `cd docs/auth-email && go test ./... -v`. Run here with Go 1.14; all pass.

## What a Find My Weed customer would see
- Subject: **Your Find My Weed sign-in link**
- Sender: the project's one sender (see below). Body: "Find My Weed" header (just the name, per the Nov 16 name rule; the sender stays KEEPITIL), one green button "Sign in to Find My Weed", the plain link as a fallback, "Did not ask for this? You can ignore this email", footer "Adults 21+ (or 18+ medical patients where state law allows). Licensed businesses only. Questions: info@keepitil.com". No promotion, no health claims, no tracking pixels, no token or OTP shown.

## How ONE template serves all three
Facts, checked in the public Supabase Auth source (`supabase/auth`, `internal/mailer/templatemailer`):
- Subject and body are both Go `html/template`s, **with no custom functions**: no `contains`, no `hasPrefix`, no sprig. Available data: `.SiteURL`, `.ConfirmationURL`, `.Email`, `.Token`, `.TokenHash`, `.Data` (user_metadata), `.RedirectTo`.
- `.SiteURL` is the same for every app (one project), so it cannot branch.
- `.Data.app` (what `fmw-auth.js` sets at sign-up) is a property of the ACCOUNT, not of this request: a person who has both a KEEPITIL and an FMW account would get the wrong brand whichever way it was set. And `signInWithOtp` data only applies when the user is created.
- `.RedirectTo` is the `redirect_to` of THIS request: FMW sends `cleanUrl()`, always under `https://keepitil.com/app/findmyweed/`; KEEPITIL sends `https://keepitil.com/apply`, `location.href` of its own pages, `/reset-password`; TUITEA lives under `https://keepitil.com/app/tuitea`.

So the branch key is a **prefix of `.RedirectTo`**, built from the only prefix tool the engine has: `slice`, guarded by `len` (a slice past the end panics and the email would fail to send). `$r := print .RedirectTo` makes an absent key harmless. Anything that does not match falls through to the KEEPITIL wording, so existing KEEPITIL sign-ins behave as before. `.RedirectTo` is request-controlled and is never printed.

## Which redirect_to is which app (2026-11-24 update)
- **Find My Weed:** `https://keepitil.com/app/findmyweed/...`
- **TUITEA:** `https://keepitil.com/app/tuitea/...` (web app, password and confirm pages) **or** `https://keepitil.com/join/...`. The native iOS app asks for `https://keepitil.com/join/auth` (`AuthLinks.nativeRedirect` in thrive-app); before this update that fell through to the KEEPITIL branch, so an iPhone sign-in email said "KEEPITIL". `/join/` is TUITEA-only today (invite links and the join page); a future app must not use it.
- **KEEPITIL:** everything else (the default).
- The trailing slash is part of each prefix: `/app/tuiteax/`, `/app/tuitea` (no slash), `/join` and `/joinery/` stay KEEPITIL, as do other hosts and plain `http://`. (The old TUITEA prefix had no trailing slash; Supabase redirects always carry a path, so nothing real changes.) Each case has a render test with a negative control (`go test ./...`).
- **TUITEA look:** the green T icon (`https://keepitil.com/app/tuitea/icon-192.png`, public, absolute URL) and the TUITEA palette from the join page (teal `#33777D` button, cream `#FBF7EF` page, `#FFFDF8` card), replacing the old purple. `TestTuiteaLook` fails if another app's colour or the icon leaks across branches.

## Open notes for Grok / Joe (NOT changed here)
- **Help address:** the TUITEA footer says `info@keepitil.com`. It is a KEEPITIL address inside a TUITEA email; a TUITEA address would need to exist first.
- **Sender:** name and address are global for the whole Supabase project (one SMTP config), so every email is sent as KEEPITIL. A TUITEA sender needs a TUITEA sender domain (SPF/DKIM) and a separate project or a mail relay.
- **Confirm signup:** paste the magic-link body there too (point 1 below), but its wording says "sign-in link"; Muse may want a "confirm your email" variant. Not written yet.
- Nothing here is applied to Supabase. Rollback = paste the saved originals back.

## Things that must hold (the "without breaking the others" list)
1. **Paste the same branching into the Confirm signup template too.** FMW sign-in calls `/auth/v1/otp` with `create_user: true`: an existing user gets the Magic Link email, a NEW user gets Confirm signup (if email confirmation is on). Same guards, "confirm" wording. Recovery (`/reset-password`), Invite and Email change are separate templates and stay KEEPITIL unless changed.
2. **The redirect must be on the project's allowed redirect list** for the branch to ever trigger; otherwise Supabase replaces `redirect_to` with the SiteURL and everything renders KEEPITIL (safe, but FMW users see the KEEPITIL wording). Check `https://keepitil.com/app/findmyweed/**` is allowed.
3. **Sender name and address are global** (one SMTP config per project). Keep the sender "KEEPITIL"; the FMW identity lives in the subject and body ("Find My Weed", with no "by KEEPITIL" line). Do not put FMW in the sender: it would brand KEEPITIL mail as Find My Weed.
4. **No new redirect hosts without updating the guards.** A new app needs a new prefix and a new branch; unknown prefixes silently get KEEPITIL wording.
5. Keep `{{ .ConfirmationURL }}` as the only link and as the fallback text; do not add `{{ .Token }}` unless OTP codes are wanted.

## Not verified
Current template/subject/sender on prod; whether the hosted Auth version matches the repo's current main; deliverability (SPF/DKIM of the sender domain); rendering in real mail clients (uses tables and inline styles, no images). The Go tests prove the branching and that nothing errors, not how Gmail or Outlook draw it.

## Test plan (before prod)
1. In a throwaway Supabase project, paste both templates, send to Joe's own inbox with `redirect_to` = an FMW URL, a KEEPITIL URL and none; check subject, body, link works.
2. Paste into prod Magic Link and Confirm signup, one at a time; send to a real inbox; compare with the saved original.
3. Rollback = paste the saved original back (dashboard, seconds; no deploy).
