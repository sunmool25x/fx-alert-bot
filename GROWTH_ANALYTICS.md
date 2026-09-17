# FX Alert Bot — Growth measurement contract

Phase 6 uses local SQLite and owner-only Telegram reports. It does not enable execution, mainnet, recruitment, rewards, scoring, public leaderboards or an external analytics service. Analytics observes the existing product; it cannot authorize a trade.

## Persistence and acquisition

Migration **6** adds `analytics_events`, `user_attribution`, `analytics_state`, indexes for period/user/entity lookups and optional entry/parent metadata on the existing input-origin tables. Phase 5's input-origin tables remain unversioned; migration 5 was not invented. UTC milliseconds follow existing conventions. On an existing file, startup creates a consistent SQLite `VACUUM INTO` backup named `.before-phase6-<timestamp>-<random>.sqlite` before upgrade. Failure closes the connection and stops the upgrade. Existing operational records are preserved; repeated startup does not repeat the migration/backup. Preflight accepts the existing migration-4 database and the complete migration-6 schema.

Sources are Telegram acquisition identifiers, separate from Sera execution/trade attribution. Examples:

- https://t.me/world_fx_alert_bot?start=x_sunmool
- https://t.me/world_fx_alert_bot?start=telegram_group_a

Normalize to lowercase ASCII letters/digits/underscore/hyphen, length 1–48. Invalid payloads become `unknown`; `/start` without a payload is `direct`. No payload is evaluated. The **first valid source** is immutable, including `direct`. An initially unknown/non-start user can acquire the first valid source later. Later starts update latest touch only. Existing legacy `users.source` takes precedence when seeding first touch. Canonical reports use `user_attribution.first_source`, falling back to the legacy source/unknown for users not yet attributed. An event retains its source snapshot; it is not rewritten when unknown later becomes known. Existing legacy product source fields are retained for compatibility.

No Sera referral link or reward identifier is added. A future separate nullable `sera_referral_id` field can be added independently; do not repurpose Telegram first touch or financial `origin`.

## Definitions and report periods

- **Total users:** currently stored initialized bot users, excluding configured internal IDs. This includes pre-Phase-6 users; `/forget` removes them.
- **Active users / DAU:** distinct users with foreground `product_activity` during the period/Seoul day. Background triggers and status polling alone do not create activity.
- **New:** active users whose first observed product use (`users.created_at`) is inside the selected period. Existing user creation supplies historical first-use evidence; historical command events are not fabricated.
- **Returning:** active users with that first-use timestamp before the period. New and returning partition active users. `user_returned` is a separate once-per-Seoul-day event after an earlier tracked activity day, not the returning-user denominator.
- **Retention indicator:** distinct active users with activity on at least two different Seoul calendar days inside the selected period.
- **Today / 7 / 30 days:** Asia/Seoul midnight through now; 7/30 includes today and the preceding 6/29 calendar days. Timestamps stay UTC. The dashboard displays tracking start and coverage; there is no historical activity backfill.
- **Counts:** each metric exposes unique users and events. Quote-request attempts can exceed displayed successful quotes. All conversion denominators are unique users; a zero denominator is `—`.

## Event dictionary

`origin` reuses Phase 5 `command | button | natural_language`. Independent `entry` is `none | quote | alpha | alert | direct_swap`, derived from existing quote/trade provenance or an explicitly carried alpha draft. `entity_id` and `parent_id` contain only operational alert/trigger/quote/trade references; there are no wallet/session/challenge references. Metadata is allowlisted to structured NLU `intent` and `parsed` only.

| Event | Actual capture point | Deduplication |
| --- | --- | --- |
| `product_activity` | Accepted foreground Telegram action; authenticated wallet-start/proof/quote action | Telegram update ID / server action key |
| `bot_started` | Start screen delivered | Telegram update ID |
| `user_returned` | Activity after an earlier tracked Seoul day | User + Seoul day |
| `markets_viewed` | Market page delivered | Telegram update ID |
| `rate_requested` | Validated pair sent to reference-rate lookup | Telegram update ID |
| `quote_requested` | Validated read-only quote lookup attempt, including wallet preview | Telegram update ID / random server request key |
| `alpha_viewed` | Conditions feed delivered, including honest empty feed | Telegram update ID |
| `natural_language_used` | Deterministic parser resolved a request/follow-up outside an active command wizard | Telegram update ID |
| `alert_setup_started` | Command/prefill wizard or valid NLU confirmation draft prepared | Telegram update ID |
| `alert_created` | Alert successfully persisted, after explicit save | Alert ID |
| `alert_deleted` | User-owned alert deleted | Alert ID |
| `alert_triggered` | Existing monitor persists a condition trigger | Trigger ID |
| `alert_delivered` | Existing delivery outbox acknowledges Telegram acceptance | Trigger ID |
| `fresh_quote_clicked` | User-owned refresh/alpha/alert callback validated | Telegram update ID |
| `fresh_quote_viewed` | Successful fresh quote card delivered / authenticated preview response served | Telegram update ID / server request key |
| `wallet_connect_started` | Wallet selected and connection creation begins; authenticated diagnostic | Random connection-attempt UUID; hashed session-derived fallback for older clients |
| `wallet_verified` | Backend ownership proof succeeds and wallet is linked | Hash of consumed challenge ID, hashed again for dedup; no challenge copied |
| `trade_flow_started` | User presses continuation for an owned live quote, receives Mini App launch action | Quote-intent ID |
| `trade_review_viewed` | Existing gated `/prepare` serves final `REVIEW` terms | Trade ID |
| `trade_authorization_started` | Existing backend persists explicit confirmation / releases signature requests | Trade ID |
| `trade_submitted` | Existing durable submission attempt committed | Trade ID |
| `trade_pending` | Existing trade state reaches `PENDING` | Trade ID |
| `testnet_trade_completed` | Existing verified settlement monitor persists `CONFIRMED`, Sepolia, evidence present | Trade ID, forced regardless of supplied dedup key |

Submission means a durable **attempt**, not proof that the network received it; an ambiguous result stays UNKNOWN. Review/quote “viewed” means the UI response was delivered, not proof it was read. Client wallet-start diagnostics are advisory gesture telemetry; `WALLET_CONNECTED`/visibility cannot produce verification or completion. Wallet verification requires the existing authenticated proof path. No HTTP endpoint exposes stats or accepts arbitrary analytics events.

Only the established verified settlement state supplies completion. Clicks, confirmations, signatures, a hash, an accepted submission and PENDING are insufficient. Reports additionally check current confirmed state: a later `UNKNOWN_REORG` removes that row's completion credit until reconfirmed. Reconciliation never submits or signs.

## Funnels and sources

The main funnel is an ordered **within-period active-user cohort**:

`Active Bot User → Alert Created → Alert Triggered → Fresh Quote Viewed → Trade Flow Started → Verified Testnet Trade Completed`

All steps must exist inside the selected period for that user. Trigger references its alert; the notification quote references its exact trigger; continuation references that new quote intent; the completed trade references the same intent. Later stages require alert entry. An ordinary alert-list quote cannot be assigned to a notification trigger. Direct quotes/trades do not inflate this funnel. Alerts created before the period can still contribute to event totals/delivered-user metrics, but cannot enter this within-period creation cohort. Triggered and delivered are reported separately: an alert may trigger without Telegram delivery success.

The discovery funnel is:

`Active Bot User → Alpha Feed → Alpha Fresh Quote → Alpha Alert Creation`

An alpha quote and subsequently created alert must carry the **same card reference**, with matching user and quote-before-creation ordering. Refresh preserves card lineage. Creating an alpha alert without first viewing a quote remains a real alert-created event but does not satisfy that final sequential funnel stage. Empty-feed “create alert” is tagged alpha but has no card/quote conversion. No unrelated actions are joined from timing alone.

Each funnel reports users, percentage of the previous stage, and percentage of the initial cohort. Event totals remain separate. Source reporting groups **period-active users by immutable first touch**, with alert creators, fresh-quote users and currently verified completers plus each conversion percentage. It shows up to eight sources by descriptive user count, grouping the rest as `other`. No statistical significance/quality ranking is claimed.

## Owner reporting and exclusions

`/stats` defaults to seven days and Korean (uses saved English preference when selected). Buttons: Today, 7 days, 30 days, Summary, Sources, Funnel. Summary includes total/active/new/returning/day counts, retention, discovery, alerts, quote origin/entry combinations, wallet/trade stages and NLU aggregates. Commands are not advertised to normal users.

`ANALYTICS_ADMIN_USER_IDS` and `ANALYTICS_EXCLUDED_USER_IDS` accept comma-separated numeric IDs (no spaces). If omitted, each separately falls back to the existing local `EXECUTION_USER_IDS` owner allowlist. Explicitly empty disables that list. This secures `/stats` and excludes the existing owner by default without editing `.env` or changing execution authorization. For beta, set dedicated analytics lists to your `/wallet` numeric ID and any internal testers, restart through the existing launcher, and keep execution OFF. Excluded users retain all product functionality/data; exclusions apply to **every** report/count/cohort/source row and are reversible. Events are still retained locally.

Only grammY's authenticated `ctx.from.id` supplies admin identity, with replay keys from `ctx.update.update_id`. Command arguments, callback fields and browser IDs cannot grant access. Unauthorized calls return a generic unavailable message. There is no individual-history, address or username report. Do not expose the database publicly.

## NLU and privacy

NLU metadata contains only `rate_query | quote_query | rate_alert | movement_alert | alpha | show_alerts | swap_prepare | unknown` and a boolean indicating structural recognition. Recognized incomplete requests awaiting a follow-up are parsed requests, not successful trade/alert events; validation and explicit buttons still control those outcomes. Numeric replies to an existing command wizard are not NLU usage. No parser rules or financial authorization change in this phase.

No analytics message bodies, balances, full wallet addresses, names, usernames, phone numbers, initData, cookies, session credentials, authentication messages, signatures, authorization payloads or API credentials. The event user FK references the existing operational user instead of duplicating Telegram profile data. These local pseudonymous operational references are not anonymous data; owner reports are aggregate. Source labels are content/community identifiers, never personal data. Protect SQLite files/backups with the same access controls as operational data.

There is no new automatic analytics retention policy in the MVP. `/forget` removes user-linked analytics and attribution via cascade under the existing unresolved-trade guard; it does **not** erase old backups or Telegram history. Owners must protect/rotate/delete backups separately under their retention policy.

## Failure handling and limits

Writes are best effort; warnings contain a fixed safe code only, throttled once per minute. Product writes happen first. The projector reconstructs post-cutover alert creations, triggers, acknowledged deliveries and trade authorization/submission/current pending/verified completion from durable state, using stable keys. It runs in bot cleanup, monitor delivery/cycle and stats reads. Wallet trade observers run after successful writes and outside open financial transactions; submission observation runs after commit. No state values/payloads/predicates/gates are changed. Repeated projection does not duplicate a settlement. It copies none of the financial evidence/payload into analytics.

Transient discovery/quote/wallet gesture/proof events cannot all be reconstructed after a failed write. A process gap can miss an intermediate PENDING transition or an acknowledged-delivery row pruned before recovery. First-seen settlement event time is the observed verified transition, or reconciliation time after a gap; the existing financial schema has no settlement timestamp. Deleted alerts before reconstruction cannot be recovered. Errors may undercount usage; they must never invent conversion. Telegram sendMessage is at least once: outbox recovery can physically redeliver while the trigger-based delivery metric counts one acknowledged trigger.

Reports are bounded to 1/7/30 days and indexed, but a single SQLite process is still an MVP limit. There is no PostgreSQL adapter, external dashboard, cross-device eye-tracking, historical backfill or transactional outbox for ephemeral analytics. Machine-readable rows/scalar UTC times/FKs suit a later PostgreSQL migration. No live transaction acceptance is claimed.

Language/source identifies product use and community acquisition, not verified nationality or location. These reports alone cannot establish that every participant is Korean.
