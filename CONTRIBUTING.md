# Contributing

Thank you for helping improve ERiC Compliance Tools.

## Development setup

```bash
git clone https://github.com/SuntekCorps-xLab/eric-compliance-tools.git
cd eric-compliance-tools
npm ci
cp .env.example .env.local
npm run dev
```

Use Node.js 22 through 24 and npm 11. Do not add real app IDs, store domains, credentials, customer data, or internal-only endpoints to tests, fixtures, documentation, or generated assets.

## Branches and commits

- Branch from `main`.
- Use a focused name such as `feat/history-filter` or `fix/proxy-error-state`.
- Keep commits reviewable and use imperative Conventional Commit-style subjects when practical.
- Do not mix generated storefront assets with unrelated source changes.

## Before opening a pull request

```bash
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
npm audit --audit-level=high
git diff --check
```

If `src/`, fonts, media, or styles change, run `npm run build:storefront` and commit the generated extension assets. The build must leave the working tree clean on a second run.

## Pull requests

Describe the user problem, implementation, security impact, test evidence, and screenshots for visual changes. State whether a backend contract or Shopify app scope changes.

All changes require review from a SuntekCorps xLab ERiC maintainer. Repository administrators are responsible for assigning that reviewer and protecting `main`; contributors must not merge their own unreviewed change.

## Design and accessibility

- Preserve keyboard operation, visible focus, semantic labels, and responsive behavior.
- Keep public copy in English.
- Avoid hiding errors that require user action.
- Test both the homepage App Embed and workspace App Block.

## Security reports

Follow [SECURITY.md](SECURITY.md). Never disclose a suspected vulnerability in a public issue or pull request.

## License

By submitting a contribution, you agree that it is licensed under the Apache License 2.0.
