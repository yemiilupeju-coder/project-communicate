# ADR 0010 — Free app, paid partnerships

- Status: Accepted (TD, Nov 15, 2026)
- Supersedes: ADR 0009 (licence gating). Keeps its demo and signed-file mechanism.

## Decision

Communicate is free for every student, family and school, with every feature: any number of
students per device, the word editor, backups, updates and security fixes. GiftedTech earns its
living from partnerships (named support, setup, training), training programs and sponsored
features, not from access to the app.

## What changed in the code

- `teamToolsAllowed` and `canAddStudent` always return `true`. Nothing in the app is gated.
- A signed licence file is now a **partner code**. It shows the partner's name, tier and support
  contact in the adult menu. Adding, expiring or removing it changes nothing a student or adult
  can do.
- Tiers: `founding`, `school-partner`, `district-partner`. The older names (`pilot`, `classroom`,
  `school`, `district`) are still accepted so any earlier file keeps verifying.
- `seats` in the payload now means the number of schools the partnership covers.

## Why

Anyone can copy an app. The lasting value is the relationship: people who answer, train staff and
keep improving the tool with the schools that use it. A free app also removes every barrier
between a student and their voice.

## Consequences

- Revenue depends on partnerships and training, which take TD's time; partners are capped to
  what can be served well (see the "Free for Every Student, Partnerships for Schools" doc).
- Tests: `test/licence.test.ts` asserts nothing is gated in any state; the browser smoke tests
  add a second student and edit words without any code.
