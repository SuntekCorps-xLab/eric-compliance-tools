# Deployment and rollback

This guide covers the Shopify frontend only. Backend deployment, database migrations, secrets, and infrastructure are outside this repository.

## Before release

1. Confirm the target Shopify app and store.
2. Confirm that backend API endpoints are public over HTTPS and that CORS permits the storefront origin where cross-origin calls are required.
3. Confirm App Proxy signature verification, store allowlists, timestamp tolerance, and path configuration on the backend.
4. Confirm that webhook secrets and Admin API credentials are stored only in the backend secret manager.
5. Run:

   ```bash
   npm ci
   npm run check
   npx playwright install chromium
   npm run test:e2e
   npm audit --audit-level=high
   shopify app build --no-color
   ```

6. Review the generated extension diff and confirm that it contains no environment-specific endpoint, app ID, token, or customer data.

## Create an app version

```bash
cp shopify.app.example.toml shopify.app.toml
# Edit shopify.app.toml locally.
shopify app deploy \
  --version 1.0.0 \
  --message "ERiC Compliance Tools 1.0.0" \
  --force \
  --no-color
```

The command builds and releases the Theme App Extension. It does not deploy backend services.

## Theme configuration

In the Shopify Theme Editor:

1. Enable `ERiC homepage` on the home page if ERiC should own the complete storefront landing surface.
2. Add `ERiC workspace` to the intended Shopify page template.
3. Configure the same App Proxy path and public HTTPS endpoints on both blocks.
4. Save the theme without placing secrets in any field.

## Smoke test

Verify in a new browser session:

- the homepage and workspace render at desktop and mobile widths;
- anonymous visitors can start or resume a guest demo only when enabled server-side;
- Shopify customers can sign in and sign out;
- account name, tenant, permissions, and point balance are server-backed;
- one text check and one image check complete and show evidence;
- history reloads from the server;
- checkout uses Shopify and does not mutate an existing cart;
- failed, expired, or unauthorized sessions return a safe message without exposing internals.

Monitor frontend console errors, App Proxy status, backend authentication failures, task failure rate, and webhook settlement before increasing exposure.

## Rollback

1. In the Shopify Dev Dashboard, reactivate the last known-good app version.
2. If the issue is limited to presentation, disable the affected App Embed or App Block in the theme editor.
3. Do not roll back a backend or database independently when doing so would violate the active frontend contract.
4. Re-run the smoke test after rollback and record the affected version, time window, and customer impact.

## Release records

Each release should include:

- semantic version and source commit;
- user-visible changes;
- successful CI and dependency-audit links;
- Shopify app version ID;
- configured store and theme owner;
- smoke-test evidence;
- rollback target and decision owner.
