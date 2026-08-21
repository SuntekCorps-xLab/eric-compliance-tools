## Summary

Describe the user problem and the change.

## Security and data impact

- [ ] No secret, token, private key, customer data, production log, or internal-only endpoint is included.
- [ ] Authentication, authorization, tenant isolation, points, prices, and payment remain server-enforced.
- [ ] Any backend contract or Shopify scope change is documented below.

## Validation

- [ ] `npm run check`
- [ ] `npm run test:e2e`
- [ ] `npm audit --audit-level=high`
- [ ] `git diff --check`
- [ ] Generated storefront assets were rebuilt and reviewed when applicable.

## Visual evidence

Add screenshots or recordings for visual changes. Remove customer and store data first.

## Deployment and rollback

Describe Theme Editor changes, backend prerequisites, smoke tests, and the rollback target. Write `Not applicable` when none are required.
