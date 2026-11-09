# P2P Social Admin — live Bicycle diagnostics

## Files

- `supabase/functions/bicycle-api/index.ts` is a reference copy of the active Supabase `bicycle-api` Edge Function, version 74, captured on 2026-11-09. Leading whitespace was normalized to remove accidental indentation expansion; function logic was not intentionally changed. The deployed Supabase function remains the runtime source of truth.
- `supabase/functions/admin-bicycle-status/index.ts` is the separate, read-only admin diagnostics endpoint deployed as `admin-bicycle-status`.

## Live admin panel

`admin-investigation.html` calls:

`GET /functions/v1/admin-bicycle-status`

The endpoint requires a valid Supabase user JWT and independently verifies the admin profile (`username=p2p_social_admin`, `is_admin=true`, or `role=admin`). It returns:

- Diagnostics function responding/authenticated status
- Bicycle API reachability and HTTP status
- Node synchronization payload from `GET /v1/system/sync`
- Exact row counts for selected Bicycle wallet, withdrawal, balance snapshot and transfer tables
- Operational recommendations

It does not return wallet addresses, API tokens, service-role keys, private keys, or transaction signing material. It does not sign, broadcast, withdraw, sweep, or transfer funds.

## Required Edge Function secrets

The deployed function reads these server-side environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BICYCLE_API_URL`
- `BICYCLE_API_TOKEN`

Keep all privileged values in Supabase Edge Function secrets. Never copy them into frontend code.

## Safety

The diagnostics endpoint is read-only. A reachable API or synced node does not prove that any particular user's funds are available or that a withdrawal is safe. Use the Bicycle backend's authoritative balance and reservation checks for financial actions.
