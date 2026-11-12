# ADR 0007 — Release 1: a browser-only student communicator built on AAC research

- Status: Accepted (TD, Nov 11, 2026)
- Supersedes: the "back to Flutter" direction of Nov 10; reaffirms ADR 0001 (web-first PWA)

## Context

TD asked for the app to be fully web-based: no dependence on a particular tablet or operating
system, usable in any modern browser, and working offline. TD also asked that it be grounded in
current AAC research rather than copying TouchChat, and that it honour and empower students first.

## Decision

The product is a Progressive Web App only. There is no native shell in the plan; the Capacitor
fallback in Technical Specification 2.0 §16 is dropped unless real-device storage tests fail.

Release 1 is the student communicator, built so that it is useful on day one with no setup:

| Feature                                                                                            | Research basis                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Home board of the 36 Universal Core words                                                          | Core vocabulary makes up most of what people say; Universal Core is a free, research-based starting set (UNC CLDS, CC BY 4.0).      |
| Fixed positions; empty cells reserved for growth                                                   | Consistent motor planning: words never move, new words fill empty cells (ADR 0002). Tested in `communicatorVocabulary.test.ts`.     |
| Full keyboard always one tap away                                                                  | Literacy and access to "anything I want to say" for every student, not only those judged ready.                                     |
| "My voice" strip: no, yes, stop that, I don't like that, wait I'm talking, help me, I need a break | Communication Bill of Rights (refusal, protest, being heard, requesting help and breaks).                                           |
| Modeling mode                                                                                      | Aided language modeling: adults point to words while talking; their taps light up and speak but don't change the student's message. |
| Speak each word / speak the whole message                                                          | Immediate auditory feedback, and the student decides when a message is said.                                                        |
| Large-text fallback when speech can't play                                                         | The student is never left without a voice (voice ladder, last step).                                                                |
| Repeat-tap guard, activate on release                                                              | Motor access (D21).                                                                                                                 |
| Symbols optional; abstract words text-only                                                         | Avoid misleading pictures for words like "it", "do", "some"; support literacy.                                                      |
| Adult menu behind a 3-second hold                                                                  | Students can't change their own setup by accident; adults get voice, display, layout and device readiness in one place.             |

The release stores only settings (in `localStorage`) and no student information. Student
profiles, board editing, the SQLite store, clips, sync and AI follow in later releases in the
order of Technical Specification §16.

## Consequences

- Works on any browser with the Web Speech API; voice quality depends on the device's voices until
  pre-rendered clips (ADR 0004) arrive. Voices that need the internet are labelled in the menu.
- The first visit must be online; after that the app opens offline.
- On narrow portrait screens the side rail moves below the board. Board words keep their places,
  but the rail's place differs between orientations; schools should lock orientation for students
  who rely on motor patterns.
- The adult hold is not a security control. A PIN arrives with student profiles in Release 2.
