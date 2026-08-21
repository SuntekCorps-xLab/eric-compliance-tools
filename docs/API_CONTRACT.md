# Storefront API contract

This document defines the public backend contract expected by the ERiC Shopify storefront. It describes browser-facing routes only; it does not document private ERiC services, detection models, point-ledger implementation, or Shopify credentials.

## Integration surfaces

The Theme App Extension receives four public HTTPS endpoints and one same-origin proxy path from Liquid settings:

| Setting             | Purpose                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| App Proxy path      | Signed Shopify customer and guest session exchange, normally `/apps/eric`    |
| Tenant API base     | Guest lifecycle, credit packs, checkout intents, and purchases               |
| Account endpoint    | Current account, permissions, and authoritative point balance                |
| Compliance API base | Uploads, screening tasks, status, results, history, and private policy terms |
| Logout endpoint     | Remote session revocation                                                    |

All absolute endpoints must use HTTPS and must not contain URL credentials. The App Proxy path must be same-origin. The frontend fails closed when required configuration is missing or unsafe.

## Common response envelope

JSON endpoints should return:

```json
{
  "success": true,
  "code": 200,
  "message": "Customer-safe message",
  "data": {},
  "request_id": "opaque-correlation-id"
}
```

The client treats a non-2xx HTTP status, `success: false`, a non-`200` application code, malformed JSON, or an invalid response shape as a failure. Error responses must not expose stack traces, credentials, internal hostnames, storage paths, SQL, proprietary policy logic, or customer data.

## Identity and authorization

After session exchange, authenticated calls carry:

```http
Authorization: Bearer <short-lived-session>
user_id: <display hint>
user_last_login_tenant: <display hint>
language: en
```

The two identity headers and all IDs in request bodies are untrusted browser input. A backend must derive the user and permitted tenant from the bearer session, confirm that the hints match, and reject cross-user or cross-tenant access.

Session tokens should be short-lived and revocable. Guest resume tokens must be opaque, rotation-capable, hashed at rest, rate-limited, isolated from registered accounts, and invalid after expiry or revocation.

## App Proxy routes

Routes are relative to the configured App Proxy path.

| Method | Route           | Authentication                    | Purpose                                                  |
| ------ | --------------- | --------------------------------- | -------------------------------------------------------- |
| `POST` | `/session`      | Signed Shopify App Proxy customer | Exchange a verified Shopify customer for an ERiC session |
| `POST` | `/demo-session` | Signed Shopify App Proxy request  | Create or resume an isolated guest demo                  |

The backend must verify the Shopify signature, timestamp, shop allowlist, and customer identity before issuing a session. It must never trust a `customer_id`, shop domain, or tenant supplied only by JavaScript.

A guest response additionally identifies the session as a demo and returns an opaque resume token, expiry, server-owned demo point allowance, and remaining refill allowance. Missing or unknown demo state must fail closed.

## Tenant and account routes

| Method | Route                              | Purpose                                                               |
| ------ | ---------------------------------- | --------------------------------------------------------------------- |
| `GET`  | Configured account endpoint        | Current account, permissions, tenant, and authoritative point balance |
| `POST` | Configured logout endpoint         | Revoke the current ERiC session                                       |
| `POST` | `/shopify/demo/revoke`             | Revoke a guest session and resume credential                          |
| `POST` | `/shopify/demo/refill`             | Apply a server-authorized guest refill without Shopify Checkout       |
| `GET`  | `/shopify/points/packs`            | Return the server-owned Shopify credit catalog                        |
| `POST` | `/shopify/points/checkout-intents` | Create an idempotent Shopify Checkout intent for an allowed pack code |
| `GET`  | `/shopify/points/purchases/latest` | Return the latest verified purchase state for the current account     |

The browser may send a pack code but never an authoritative price or point amount. The backend must select the current catalog entry, deny checkout for guests, create the Shopify order, and grant points only after verifying an authenticated paid-order webhook. Webhook processing must be idempotent and handle refunds according to the server ledger policy.

Checkout URLs must be HTTPS Shopify invoice URLs with no URL credentials. The frontend rejects other destinations.

## Compliance routes

All routes below are relative to the configured compliance API base.

| Method | Route                                                  | Purpose                                                                                         |
| ------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `POST` | `/upload`                                              | Upload one JPG or PNG screening image                                                           |
| `POST` | `/v5/save-check`                                       | Validate input, price the operation, deduct points atomically, and create a screening workspace |
| `GET`  | `/v5/get-check-status`                                 | Return the current state of one owned workspace                                                 |
| `POST` | `/v3/design/regular/list`                              | Return D001 design-patent evidence                                                              |
| `POST` | `/v5/invention/list`                                   | Return I001 utility-patent evidence                                                             |
| `POST` | `/v3/graphic-trademark/list`                           | Return L001 graphic-trademark evidence                                                          |
| `POST` | `/v4/trademark/detail`                                 | Return T001 text-trademark evidence                                                             |
| `POST` | `/v4/trademark/safe-words`                             | Return T002 safer-wording suggestions                                                           |
| `POST` | `/v3/copyright/list`                                   | Return C001 copyright evidence                                                                  |
| `POST` | `/v3/policy-compliance/search/gun-parts`               | Run the P001 restricted-product image search                                                    |
| `POST` | `/v3/policy-compliance/bi-gun-part/get-by-cropped-uid` | Return evidence for owned P001 matches                                                          |
| `POST` | `/v3/policy-compliance/detail`                         | Return P002 marketplace-policy evidence                                                         |
| `POST` | `/v3/work-space/list`                                  | Return paginated screening history owned by the current tenant                                  |
| `POST` | `/v3/policy-compliance/sites`                          | Return supported marketplace sites                                                              |
| `POST` | `/v5/policy-compliance/feature-word-list`              | Return private policy terms owned by the tenant                                                 |
| `POST` | `/v5/policy-compliance/feature-word-suggestion`        | Suggest private policy terms                                                                    |
| `POST` | `/v5/policy-compliance/feature-word-save`              | Save a private policy term                                                                      |
| `POST` | `/v5/policy-compliance/feature-word-delete`            | Delete an owned private policy term                                                             |

The TypeScript request builders and response normalizers under `src/services/` are the executable client-side contract. New backend versions should remain compatible with those types or be released together with a matching frontend version.

## Required invariants

Before creating or returning any task, evidence, history entry, policy term, checkout, or point mutation, the backend must confirm:

1. The session is valid, unexpired, and intended for the calling storefront.
2. The authenticated user owns or may access the resolved tenant.
3. The requested workspace, task, purchase, and private term belong to that tenant.
4. The account or guest policy permits the requested operation.
5. Inputs, markets, file references, and feature-term IDs are valid and allowed.
6. The server-calculated cost is available and deducted atomically with task creation.
7. An idempotency strategy prevents duplicate deductions, tasks, purchases, and webhook grants.

Unknown permissions, tenant state, prices, task modes, payment states, or policy outcomes must fail closed.

## Upload handling

The browser accepts JPG and PNG files up to 4 MB for usability. The server must independently enforce size, validate magic bytes rather than filename extensions, decode the image safely, scan content where appropriate, randomize stored names, keep uploads private, verify ownership on every read, and apply retention and deletion policies.

Never return a private object-store credential or an unrestricted internal storage path to the storefront.

## CORS, caching, and errors

- Allow only intended storefront origins when requests are cross-origin.
- Do not use wildcard credentialed CORS.
- Mark authenticated account, points, history, evidence, and policy responses as private and non-shared-cacheable.
- Apply rate limits to public, authenticated, and guest routes.
- Return stable machine-readable error codes and a safe English message.
- Include an opaque request ID so maintainers can correlate server logs without exposing internals.

## Compatibility and testing

Breaking route or response changes require a documented migration, a coordinated storefront release, and a rollback-compatible deployment order. Test the contract against a development store and non-production backend before promoting a Shopify App version.

At minimum, verify expired sessions, forged tenant IDs, cross-tenant resource IDs, insufficient points, duplicate submissions, task failure, malformed responses, unsafe checkout URLs, guest checkout denial, webhook replay, and refund handling.
