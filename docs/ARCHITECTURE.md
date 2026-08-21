# Architecture

ERiC Compliance Tools is a frontend delivery package. It renders React inside a Shopify Theme App Extension and communicates only with public HTTPS endpoints configured by the merchant or app operator.

## Runtime components

| Component               | Responsibility                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Shopify storefront      | Theme rendering, customer session, navigation, and App Proxy signing                                                     |
| Theme App Extension     | Homepage, workspace, input handling, task polling, and evidence presentation                                             |
| Tenant API              | Shopify identity mapping, ERiC session issuance, authorization, point catalog, checkout intent, and guest-session policy |
| Compliance API          | Uploads, detection submission, task status, evidence, history, and policy terms                                          |
| Shopify Checkout        | Customer-facing payment experience                                                                                       |
| Backend webhook handler | Signature verification, idempotent settlement, refunds, and point-ledger updates                                         |

## Trust boundaries

The browser is untrusted. Displayed balances, tenant IDs, user IDs, pack codes, prices, task IDs, and result identifiers are hints for the UI, not authorization evidence.

The backend must enforce:

1. Shopify App Proxy signature and timestamp verification.
2. Store and path allowlists.
3. Customer-to-tenant and user-to-tenant ownership.
4. Permission checks for every compliance operation.
5. Server-authoritative prices, points, and expiration rules.
6. Idempotent checkout and webhook settlement.
7. Guest-session isolation, expiry, rate limits, and real-checkout denial.
8. Log redaction for tokens, signatures, customer data, and resume credentials.

## Storefront bootstrap

Liquid provides a minimal public context through `data-*` attributes:

- Shopify login and logout navigation URLs;
- whether a Shopify customer is present;
- the same-origin App Proxy path;
- public HTTPS API endpoints;
- the selected storefront surface and theme-chrome behavior.

`src/storefront/context.ts` validates the App Proxy path as same-origin and rejects API endpoints that are not HTTPS or that contain URL credentials. No secret belongs in a Liquid setting.

## Authentication flows

### Shopify customer

1. The customer authenticates with Shopify Customer Accounts.
2. The browser posts to the same-origin App Proxy session endpoint.
3. Shopify signs the forwarded request.
4. The backend verifies the signature and maps the Shopify customer to an ERiC identity.
5. The frontend receives a short-lived ERiC session and loads the authoritative account.

### Guest demo

1. The browser creates a random device identifier and requests a guest session through the signed App Proxy.
2. The backend creates an isolated guest tenant and returns an opaque resume credential.
3. The browser stores only the resume credential and renews short-lived access sessions as needed.
4. Demo credits, refills, expiry, rate limits, and checkout denial remain server-enforced.

## Compliance task lifecycle

The frontend validates basic input shape, uploads images when required, submits a task, polls its server status, refreshes the authoritative balance, and renders returned evidence. Completed tasks are loaded from server-backed history. Browser storage is used only to resume the active UI state; it is not a source of authorization or accounting truth.

## Generated assets

`scripts/build-storefront.mjs` bundles `src/storefront-entry.tsx`, scopes CSS to `.eric-shopify-root`, embeds approved font subsets, converts supported media for Shopify, and rejects unsupported extension asset types. Generated files live under `extensions/eric-storefront/assets/` so Shopify CLI can version them with the Liquid blocks.

## Extension points

- Add a compliance workflow in `src/services/` and expose it through `src/features/checks/Workspace.tsx`.
- Add pure mapping and grouping logic beside unit tests in `src/domain/` or the relevant feature folder.
- Keep backend contracts explicit and reject malformed responses before updating UI state.
- Rebuild and commit extension assets whenever storefront source or styling changes.
