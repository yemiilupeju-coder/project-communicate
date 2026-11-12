# ADR 0006 — AI runs in Azure (Canada) for the MVP

- Status: Accepted (W7, D14–D16, Nov 9, 2026)

## Decision

AI vocabulary and phrase suggestions use an ASP.NET Core endpoint backed by Azure OpenAI with a
Regional Standard deployment in Canada Central or Canada East. Access uses per-school pilot keys
and per-device rate limits. Phrase suggestions send starter-library words only, plus words an
adult explicitly selects; free-text context is screened on the device for known names. AI is off
by default and every suggestion needs adult approval.

On-device AI in the Board Builder (WebGPU) is a post-pilot experiment.

## Consequences

AI requires a network and a pilot key; nothing else in the app does.
