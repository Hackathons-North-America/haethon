---
name: verify
description: How to run and drive this app for runtime verification (dev server, Clerk auth, browser automation gotchas)
---

# Verifying haethon changes at runtime

## Launch

- The user usually already has `next dev` running on **localhost:3000** from this
  directory — check before starting your own (`npm run dev` will refuse and exit if
  one is running; a second instance on :3001 is useless since it fights over `.next`).
  Hot reload picks up your edits in the existing server.
- Deleted an API route? Stale `.next/types` breaks `npm run typecheck` — `rm -rf .next/types`.

## Auth (Clerk, dev instance)

- Signed-out API calls return 401 and client controls redirect to `/sign-in`.
- The sign-up form is gated by Cloudflare Turnstile which never solves under
  automation, and headless `Clerk.client.signUp.create(...)` hangs on the captcha.
- Working path: mint a **sign-in token** with the backend API, then use the
  ticket strategy in the browser (no captcha):
  1. `SK=$(grep '^CLERK_SECRET_KEY=' .env.local | cut -d= -f2-)`
  2. `curl -X POST https://api.clerk.com/v1/users -H "Authorization: Bearer $SK" -H "Content-Type: application/json" -d '{"email_address":["x+clerk_test@example.com"],"skip_password_requirement":true}'`
  3. `curl -X POST https://api.clerk.com/v1/sign_in_tokens ... -d '{"user_id":"<id>","expires_in_seconds":600}'`
  4. In the page: `Clerk.client.signIn.create({strategy:'ticket', ticket})` then `Clerk.setActive({session: si.createdSessionId})`.
- The app auto-provisions its `users` row on the first authenticated request.
- Clean up after: DELETE the Clerk user via API and delete the `users` row
  (`@neondatabase/serverless` one-liner with DATABASE_URL from .env.local).

## Browser automation gotchas (t3-code preview tools)

- `preview_snapshot` fails persistently in this setup — verify via
  `preview_evaluate` DOM inspection instead.
- `preview_type`/`preview_click` often return a "malformed result" schema error
  even when the action succeeded — confirm with an evaluate afterwards.
- `preview_evaluate` must return an **object** (bare arrays fail schema) and
  times out at 15s — for long async flows, kick off the work storing the result
  on `window.__x` and poll it in a second call. A click that triggers
  `window.location` navigation kills the pending evaluate: expect an
  ExecutionError, then re-check `location.href` in a fresh call.

## Flows worth driving

- `/hackathons` listing grid: card status picker (Interested/Applied/Accepted)
  → `PATCH`/`DELETE /api/hackathons/[id]/track`; state persists via
  `applyUserCardState` on reload.
- `/my` pipeline board reflects tracked stages (filter:
  `isSaved OR applicationStatus != 'interested'`).
