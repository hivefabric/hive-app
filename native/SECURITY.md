# Security Policy

## Reporting a vulnerability

Please report security issues to **security@hivefabric.io** (placeholder until that mailbox lands; for now use the maintainer's contact in the GitHub profile).

**Do not file a public GitHub issue or post in any public channel.** We acknowledge reports within 24 hours and triage within 3 business days.

## What to include

- Description of the issue and what you observed.
- Minimal reproduction (commands, payloads, test case).
- Affected versions / commit hash / branch.
- Your assessment of severity and impact.
- Whether you have already disclosed elsewhere (CVEs, prior reports).

## Severity rubric and timelines

| Severity | Definition | Time-to-fix | Public disclosure |
|---|---|---|---|
| Critical | Sandbox escape, mass data exposure, key compromise | ≤ 7 days | 30 days post-fix |
| High | One-tenant data exposure, auth bypass, persistent disruption vector | ≤ 30 days | 90 days post-fix |
| Medium | Conditional disclosure, partial auth weakness, rate-limit bypass | ≤ 90 days | 90 days post-fix |
| Low | Defense-in-depth weakening with no demonstrated exploit | ≤ 180 days | On release |

## Safe harbour for researchers

We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, data destruction, and service interruption.
- Stop and notify us as soon as they discover a vulnerability.
- Do not access or modify data beyond what is necessary to demonstrate the vulnerability.
- Do not use the vulnerability for any purpose other than disclosure.

## Out of scope

- Findings from automated tools without a working exploit.
- Self-XSS, missing security headers without demonstrable impact.
- Social engineering of HiveFabric staff or contributors.
- Findings in third-party dependencies (please report upstream; we will track and remediate).

## Bug bounty

A formal bounty program is planned post-Phase-2 deployment. Until then, significant disclosures are eligible for acknowledgement and a thank-you package.

## More information

The full vulnerability disclosure policy and the H-13 incident playbooks live in the private security docs at `.github-private/docs/private/docs/05_security/`. Public-facing summary is here.
