# Guest Check

The verified guest review platform for accommodation businesses. Properties look
up an arriving guest's review history from every other verified property before
check-in, and leave their own reviews after checkout.

Live at **guestcheck.site**.

---

## Architecture

| Layer | What it is |
|---|---|
| Client | React 18 + Vite + Tailwind SPA, built to `client/dist` |
| API | Express 4 on Vercel serverless functions (`api/index.ts` exports the app) |
| Data | Supabase Postgres, accessed over **HTTPS via PostgREST** (`server/src/lib/supabase.ts`) |
| Email | **Resend** HTTPS API (`server/src/services/email.service.ts`) |
| Billing | Stripe Checkout + Billing Portal |

### Two deliberate architectural choices

**No TCP to the database.** Supabase's free tier resolves its direct host on
IPv6 only, and Vercel functions are IPv4 only, so a Postgres TCP connection can
never establish. The data layer is a hand-rolled PostgREST client over `fetch`.
Prisma is **not** a runtime dependency — `server/prisma/schema.prisma` is kept
only as schema documentation, and the enums it declares are mirrored in
`server/src/types/enums.ts`, which is what the code imports.

**No SMTP.** Outbound SMTP from serverless functions is unreliable, so email
goes through Resend's HTTPS API, also over plain `fetch`.

---

## Getting started

```bash
npm install --include=dev
cd client && npm install --include=dev && cd ..

cp .env.example .env     # then fill it in — see "Environment" below

npm run dev:server       # API on :4000
npm run dev:client       # SPA on :3000, proxying /api to :4000
```

### Database setup

Run `server/prisma/setup.sql` in the Supabase SQL editor. It is **idempotent** —
safe to re-run — and creates every table, index, constraint and the seed
accounts. Re-run it after pulling changes that touch the schema.

If you are recovering an existing deployment, also run
`server/prisma/repair-locked-accounts.sql`, which unlocks any account stranded
by an approval whose activation write was dropped.

### Seed accounts

Created by `setup.sql`. **Change these before taking real signups** — they are
public in this repository.

| Role | Email | Password |
|---|---|---|
| Super admin | `admin@guestcheck.io` | `Admin@GuestCheck123!` |
| Property admin | `manager@granddemohotel.com` | `Manager@Demo123!` |
| Receptionist | `reception@granddemohotel.com` | `Reception@Demo123!` |

---

## Environment

`.env.example` documents everything. The ones that will silently break things if
missing:

| Variable | Why it matters |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **Required.** Without them every route 500s. |
| `JWT_SECRET` | **Required, ≥32 chars.** The app refuses to start in production without it. |
| `RESEND_API_KEY`, `FROM_EMAIL` | No email of any kind sends without these. The `FROM_EMAIL` domain must be verified in Resend. |
| `CRON_SECRET` | Cron endpoints return 503 in production without it, rather than being publicly callable. |
| `STRIPE_*` | Billing only. The app boots fine without them. |

Check email end to end after deploying: `GET /api/admin/email/status` as a super
admin reports whether the key works *and* whether the sending domain is verified.

---

## Commands

```bash
npm run typecheck    # server + api (the deploy pipeline runs this first)
npm test             # vitest
npm run test:watch
cd client && npm run build
```

`npm run vercel-build` runs typecheck → tests → client build, so a type error or
a failing test blocks the deploy. This matters because `@vercel/node` compiles
the server with esbuild, which strips types **without checking them** — nothing
else would catch it.

---

## Scheduled jobs

Declared in `vercel.json` under `crons`:

| Job | Schedule | What it does |
|---|---|---|
| `/api/cron/review-nudge` | 08:00 UTC daily | Emails properties about yesterday's checkouts with no review yet |

Vercel Cron invokes with **GET** and there is no way to configure the method, so
cron routes must be registered for GET. They authenticate via
`Authorization: Bearer $CRON_SECRET`, which Vercel sends automatically.

---

## Subscription plans

Limits live in `server/src/config/config.ts` and are enforced by
`server/src/middleware/planLimits.ts`.

| | Free trial | Basic | Professional | Enterprise |
|---|---|---|---|---|
| Reviews / month | 10 | 50 | 500 | ∞ |
| Guest lookups / month | 20 | 100 | 1,000 | ∞ |
| Team seats | 1 | 3 | 10 | ∞ |
| API + integrations | — | — | ✓ | ✓ |
| Caller ID | — | — | ✓ | ✓ |

Exceeding a limit returns **402** with a `code` of `PLAN_LIMIT_REACHED` or
`PLAN_UPGRADE_REQUIRED`; the client surfaces the message as a toast.

---

## Conventions worth knowing

- **Every async route handler is wrapped in `asyncHandler`.** Express 4 does not
  forward rejected promises, so an unwrapped handler turns a database error into
  a dead lambda with no response body.
- **Never interpolate user input into a PostgREST filter.** Pass structured
  `OrCondition[]` and let `lib/supabase.ts` escape it. `encodeURIComponent` is
  not sufficient on its own — it leaves `( ) * ! ' .` intact.
- **A failed request is not an empty result.** Render `<QueryError>` rather than
  letting a failure fall through to "no guests found" or "0 alerts" — on a risk
  platform that is the most dangerous possible default.
- **Escape anything user-supplied before putting it in an email.** `esc()` for
  text, `safeUrl()` for hrefs. Registration and waitlist bodies are
  unauthenticated.
- **Never make a write fire-and-forget on the serverless path.** The instance
  freezes once the response flushes and the write is dropped.

---

## Licence

Proprietary. © GuestCheck Ltd.
