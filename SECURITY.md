# Security policy

## Supported versions

| Version | Supported        |
| ------- | ---------------- |
| 0.1.x   | Yes              |
| < 0.1   | No (pre-release) |

Security fixes are released for the latest minor version. While the SDK is below 1.0.0, upgrading to the newest release is the supported way to receive a fix.

## Reporting a vulnerability

Please do **not** open a public issue, pull request or discussion for a security problem.

Report it privately with GitHub's private vulnerability reporting:

1. Open <https://github.com/Vtechcom/hydraone-sdk/security/advisories/new> (the **Security** tab, then **Report a vulnerability**).
2. Describe the issue, the affected version and entry point, and steps or a proof of concept to reproduce it.
3. Tell us whether you plan to publish your own write-up, and when.

Only the maintainers can read the report. If you cannot use GitHub, email <info@vtechcom.org> with the subject "Security report: hydraone-sdk". Keep the first message short and leave out exploit details until a maintainer replies.

## What to expect

These are our targets, not guarantees:

- Acknowledgement within 3 business days.
- An initial assessment (accepted, needs more information, or not a vulnerability) within 7 days.
- A fix or mitigation plan for confirmed issues within 30 days, depending on severity.
- Credit in the release notes and advisory if you want it.

We publish a GitHub security advisory and a patched release when a fix ships, and ask reporters to wait until then before public disclosure.

## Scope

In scope: the code published as `@hydraone-sdk/core` and `@hydraone-sdk/host`, including the message validation in `PostMessageTransport`, the storage adapters and the CLI templates.

Out of scope: vulnerabilities in wallet extensions, in the HydraOne host application itself, in your own backend, or in third-party dependencies that are not reachable through this package. Report those to their owners.

## Notes for integrators

- Always set `appCenterOrigin` to the exact host origin. A wildcard is rejected in production.
- Verify CIP-8 signatures from `signData` on your own server. The SDK does not verify signatures.
