# Security Policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch. Before a second maintained release line exists, older tags should be treated as unsupported.

| Version              | Supported |
| -------------------- | --------- |
| Latest `1.x` release | Yes       |
| Older releases       | No        |

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's **Report a vulnerability** option on the repository Security tab to create a private security advisory. Include:

- the affected commit or release;
- the affected route, component, or workflow;
- reproduction steps or a minimal proof of concept;
- expected impact;
- any known workaround.

If private vulnerability reporting is unavailable, contact the repository maintainers through the SuntekCorps-xLab organization profile and request a private reporting channel. Do not include exploit details in that initial public message.

Maintainers will acknowledge a complete report within five business days, assess severity, coordinate a fix and disclosure date, and credit the reporter when requested and appropriate.

## Security boundary

This repository is an untrusted browser client. It must not contain Shopify client secrets, Admin API tokens, webhook secrets, private keys, passwords, fixed access tokens, customer exports, or production logs.

Backend integrations are responsible for authentication, authorization, Shopify signature verification, tenant isolation, rate limits, point accounting, checkout settlement, webhook idempotency, and sensitive-log redaction. A frontend check is never a substitute for backend enforcement.

## Safe testing

- Test only stores and accounts you are authorized to use.
- Do not create paid orders, consume third-party detection capacity, or access customer data without permission.
- Use local fixtures or a dedicated development store whenever possible.
- Remove tokens, signatures, personal data, and store identifiers from screenshots and reports.
