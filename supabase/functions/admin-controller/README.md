# P2P Social Admin Controller

This function is deployed with JWT verification enabled.

## Access
- Valid Supabase access token required.
- Admin profile must have username `p2p_social_admin`, `is_admin = true`, or role `admin`.
- GET is read-only.
- POST mutations require MFA assurance level `aal2`.

## GET
Returns the 50-feature registry, limited profile verification data, recent successful-login security events, and recent admin audit entries.

## POST actions
- `set_monitoring`: enable or pause dashboard monitoring visibility for one registered feature. This does not enforce application policies.
- `set_verification`: set a profile's verification status to `verified` or `unverified`.

Every successful controller mutation is appended to `admin_audit_logs`. The database rejects UPDATE and DELETE on that audit table.

## Security telemetry
`admin-security-events` records successful logins after the login page's MFA flow. It stores the verified Auth user ID, session ID, parsed device/browser/OS categories, and a coarse IP prefix. It does not store passwords, tokens, full IP addresses, or full user-agent strings.

Failed-login monitoring, active-session inventory/revocation, mandatory MFA for all accounts, rate limiting, fraud decisions, backup/restore, blacklist/whitelist enforcement, and global maintenance enforcement are not implemented by this controller yet.
