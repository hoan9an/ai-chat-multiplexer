# Privacy-first beta measurement

The first 20 beta participants are measured manually with
`beta-measurement-template.csv`. The application has no product telemetry SDK,
analytics endpoint, account tracking, or measurement dependency.

## Activation and metrics

Activation means that within five minutes a participant opens at least two AI
services in at least two panes, performs one real task, and confirms that the
layout remains after closing and reopening the app.

- Install: participant reports a successful supported Windows install.
- Activated: the activation definition above is met.
- D1 and D7 retained: participant reports returning to use the app on or after
  the relevant check-in day.
- Paid: payment is confirmed through the approved payment record, not inferred
  from app behavior.
- Refund: refund disposition only; do not copy payment credentials or full
  transaction data into the sheet.

## Allowed data

- Participant alias such as `BETA-001`; keep the alias-to-contact mapping in the
  founder's approved contact system, not this repository.
- Consent status, dates, app version, activation result/time/template, D1/D7,
  paid/refund status, blocker category, owner, and next action.
- Short redacted notes needed to understand a blocker.

Do not store account identifiers, cookies, session files, profile directories,
backups, prompts, chat content, tokens, credentials, private keys, full URLs,
full paths, raw support bundles, provider conversation IDs, or copied payment
details in the measurement sheet.

## Consent, access, retention, and deletion

- Ask for consent before adding a participant row beyond the invitation alias.
- Limit access to the founder and a named beta-support owner.
- Review the sheet every 30 days. Delete non-converted participant rows 90 days
  after the beta ends unless a shorter deletion request applies.
- On a participant deletion request, remove the measurement row and the separate
  alias/contact mapping. Support evidence has its own incident/bug retention and
  must not be copied into this sheet.
- Export aggregate counts without participant aliases for product decisions.

## Telemetry decision gate

Only consider opt-in telemetry if manual check-ins cannot answer a documented
decision. Before implementation, define event allowlist, explicit consent,
retention, access, deletion path, offline behavior, vendor/data destination, and
a way to use the app fully when telemetry is declined. This requires a separate
product/privacy review; this execution plan does not authorize telemetry.
