<!-- source: https://keepitil.com/apps/tuitea/legal/privacy/ -->
<!-- version: 2026-11-03 -->

# TUITEA Privacy Policy

_Version 2026-11-03 · Effective 3 November 2026_

**What changed:** the assistant is now called Echo, and the plans are Free, Plus and Pro (storage plans are no longer sold).

TUITEA is a family app made by KEEPITIL. This policy describes how the app works today.

## Who we are

TUITEA is run by KEEPITIL, 9252 Garden Grove Blvd, Ste 19 PMB 1066, Garden Grove, CA 92844, USA. Contact: [info@keepitil.com](mailto:info@keepitil.com). Help: [keepitil.com/support/?product=tuitea](https://keepitil.com/support/?product=tuitea).

## What TUITEA collects

**Your account.** Your email address and password (Apple and Supabase never show us your password; it is stored hashed). We also keep a user ID and a session on your device.

**Your household and family tree.** The people you add, with their names, relationships, sex, birth and death dates, birthplaces, notes, photos, and who belongs to which household. Invites hold the email address of the person you invite.

**What you record.** Memories, photos, videos, audio stories, documents, family records (medical history, heritage, traditions, legacy), meals, recipes, groceries and lists, plans, schedules, pets, routines, habits, sleep, and health entries you type in.

**Heritage and culture.** Heritage and tradition records can show where your family comes from, the languages you speak and the practices you keep. We treat these as sensitive and use them only to show them to your household and to answer your own questions.

**Health data from Apple Health.** Only if you turn it on. TUITEA reads it and never writes to Apple Health. See "Health and Apple Health" below.

**Conversations with Echo.** What you ask and what Echo answers, so a conversation can continue. When you talk to Echo, iPhone turns your speech into text on the phone itself; your voice recording is not sent to us. Only the text is.

**Purchases.** TUITEA Free costs nothing. TUITEA Plus and TUITEA Pro (which include Echo and more family accounts) are paid subscriptions for your household. If you buy a plan in the iPhone app, Apple handles the payment and we receive Apple's signed record of the purchase (product, dates, status). If you buy a plan on our website, Stripe handles the payment and we receive Stripe's record of the subscription (plan, dates, status, and the email and customer reference Stripe uses for receipts). Either way we use it only to turn the plan on for your household, and we never see your full card number.

**Support reports.** What you write in "Report a problem", with the app version and the screen you were on.

**Service and diagnostic information.** A random ID created by the app on your phone (not Apple's advertising or vendor ID), sign-in attempts and their result with the app version, and for each Echo turn the time it took and which route answered it. We also keep daily counts of how Echo turns went (for example, how many were answered or needed a retry). These counts contain no names, no content and no per-person record.

**What we do not collect.** Your location, your phone contacts, your browsing history, advertising identifiers, or crash reports from third-party crash tools. TUITEA has no advertising and no tracking, and does not use Apple's advertising identifier.

## Why we use it

To run TUITEA for you and your household: to store and show your family's records, sync them between your devices and your family members, answer your questions in Echo, turn on what you paid for, help when you report a problem, and keep the service secure and working. We do not use your data for advertising, do not sell it, and do not build profiles to share with others.

## Who can see it

Members of your household see what is shared with the household. Something you mark private stays private to you; another adult's private memories and their files cannot be opened by other members. Only the author of a family record, or a household admin, can change or delete it. Nobody outside your household sees your data.

## Service providers we use

- **Supabase** — database, sign-in and server functions.
- **Cloudflare R2** — storage for your photos, videos, audio and documents.
- **Cloudflare Workers AI** — the AI model that answers Echo and reads photos you ask about. It is used under terms of zero data retention and no training on your data.
- **NEXUS** — KEEPITIL's own AI service that routes Echo's questions, keeps Echo's conversation history and remembered preferences, and keeps the daily counts above.
- **Apple** — App Store purchases, Apple Health (on your phone) and on-device speech recognition.
- **Stripe** — payments for storage plans bought on our website (card processing, receipts and subscription management).
- **USDA FoodData Central, Spoonacular and TheMealDB** — when you look up a food or a recipe, our server sends them the words you searched. Nothing that identifies you is sent.
- **Recipe import** — when you paste a recipe link, our server fetches that page.
- **Email** — sign-in, password reset and invite emails are sent by Supabase through our email delivery provider, Resend. Household invitations are not emailed by us: TUITEA gives you an invite link that you share yourself from your phone.

## Echo and AI

Many questions are answered from your own records without any AI model. When a model is needed, each question is classed by the most sensitive information in it:

- Questions with no personal information normally go to Cloudflare Workers AI, and may also go to Google (Gemini) or Groq, which KEEPITIL has approved only for questions that contain no personal information.
- Questions that include your or your family's personal information go only to a provider approved for personal data with zero data retention and no training. Today that is Cloudflare Workers AI.
- Questions that include health information are not sent to any AI model. Echo answers them from your records or tells you it cannot.

Photos you share with Echo are read by Cloudflare Workers AI only. If that fails, they are not sent anywhere else.

## Health and Apple Health

TUITEA can read steps, sleep, water, exercise minutes, active energy, walking and running distance, resting heart rate and weight, only after you allow each one. Apple Health readings are shown on your phone. They are not saved on our servers. If you ask Echo a health-related question while Apple Health is on, a short summary (for example, today's steps and last night's sleep) is sent to our server with the question so Echo can answer. It is not given to any AI model or other company and is not stored. Apple Health data is never used for advertising or marketing, and never sold or shared with data brokers. Health entries and sleep records you type in are stored like your other records, private to you unless you share them.

## Children

TUITEA is for families. A parent or guardian can add children to the family tree and keep records about them. Those profiles are managed by the household and are not accounts: a child does not sign in. TUITEA is not meant for children to create their own accounts, and we do not knowingly let a child under 13 sign up. Sign-up does not ask for your age, so please do not create an account for a child. If you think a child has made an account, write to [info@keepitil.com](mailto:info@keepitil.com) and we will delete it.

## Deleting your data

- **One record:** delete it in the app. TUITEA asks first.
- **Apple Health:** turn it off in TUITEA or in iOS Settings. TUITEA then clears the Apple Health values it was holding.
- **Your account:** Your account → Delete account. It happens straight away and cannot be undone. You can also ask us to delete it by writing to [info@keepitil.com](mailto:info@keepitil.com) from your account email address.
- Your login is deleted.
- Your **private** content is deleted: private memories, meal entries, health records and the documents attached to them, sleep entries, private family-tree, event, recipe and task entries, progress photos, Echo's conversation state, and the push-notification tokens for your devices. Your Echo conversations, remembered preferences, support reports and household memberships on TUITEA's server are deleted too.
- What you **shared** with your household stays with your family, with your name and author link removed: shared memories and their photos and videos, family records, shared health and sleep entries, family-tree people, meal logs, pets, recipes, events and tasks.
- Your own profile in the family tree stays with the household and becomes unclaimed (it is no longer linked to any account).
- If you started a household that still has other members, it passes to an admin, or else to the longest-standing member. If you were the only person in the household, the household and everything in it is deleted.
- Records in other KEEPITIL services linked to your login are kept with your identity removed. Payment and terms-acceptance records are kept with your identity removed, where the law requires us to keep them.
- **Photo, video and document files.** When content is deleted, its files in our storage provider (Cloudflare R2) are made unreadable through TUITEA straight away, and are removed from storage by an automatic daily clean-up no sooner than 7 days after deletion (the 7 days let a mistaken deletion be undone). The clean-up removes a limited number of files each day, so removal can take longer. A file still used by another record is kept. Files carried over from TUITEA's earlier storage are not removed by this clean-up; if you delete one, it stays unreadable through TUITEA, and you can ask us to remove it by writing to [info@keepitil.com](mailto:info@keepitil.com).
- **Echo conversations held by NEXUS.** NEXUS, KEEPITIL's AI service, keeps its own copy of your Echo conversations, messages and the facts Echo remembered about you. When you delete your account, these copies are deleted automatically, normally within a few minutes. Spending and audit records are kept with your identity removed, and a one-way fingerprint of your account ID is kept as proof of deletion.
- **Backups.** TUITEA's main database does not currently keep automatic backups. We may take occasional encrypted manual backups to protect against data loss; data you delete may remain in such a backup until it is replaced or deleted, and backups are never used to restore deleted personal data except to recover from a failure. NEXUS is hosted by a database provider that may keep its own backups; data deleted from NEXUS can remain in such a backup until the provider's backup schedule replaces it. Backups are never used to restore deleted personal data except to recover from a failure.
- **Service logs.** Our providers' platform logs may hold request details (such as IDs, not message content) for a short period set by the provider.

## Getting a copy of your data

There is no export feature in the app. Email [info@keepitil.com](mailto:info@keepitil.com) from your account email address and we will send you a copy.

## How long we keep it

Until you delete it or delete your account, apart from what is described in "Deleting your data" (files awaiting clean-up, backups and logs). Daily counts of Echo turns contain nothing personal and are kept for running the service.

## Security

Data is encrypted in transit (HTTPS) and protected in the database by per-household access rules. Media is stored privately and only issued to signed-in household members. No system is perfectly secure. If a breach affects you, we will tell you.

## Where your data is processed

KEEPITIL's providers may process data outside your country, including in the United States. Where the law requires, we rely on our providers' standard data-protection terms. TUITEA's database is hosted by Supabase in the United States (AWS us-west-1, Northern California).

## Your rights

Depending on where you live, you can ask to see, correct, delete or get a copy of your data, or object to how it is used. Write to [info@keepitil.com](mailto:info@keepitil.com).

## Changes

We will tell you in the app before a material change takes effect.

## Contact

[info@keepitil.com](mailto:info@keepitil.com)

---
