# ADR 0008 — Release 2: research-based vocabulary, word endings, student profiles

- Status: Accepted (TD, Nov 12, 2026)
- Builds on: ADR 0002 (fixed positions), ADR 0007 (Release 1)

## Context

Release 1 had one board of 36 core words. TD asked for vocabulary that matches well-studied sets
and serves school, personal life and language development, plus word endings, student profiles,
an editor and saved messages.

What the research says, in short:

- **Core and fringe are both needed.** Core words make up most of what people say, but fringe
  words (names, foods, places, interests) are what make the system the student's own. Current
  practice is a two-part approach: high-frequency core plus personalised fringe (Beukelman &
  Light 2020; Cooper & Soto 2024).
- **Core-only boards fail beginning communicators.** Core lists under-represent the kinds of words
  that dominate early vocabulary, mostly nouns (Laubscher & Light 2020). Core words emerge later
  in typical development than the first nouns, so core-only systems risk gaps (Frick Semmler,
  Bean & Wagner 2024). Autistic preschoolers' own words are often interest-based fringe words
  missing from core lists (Kong et al. 2026).
- **School needs more than frequency.** School-age core lists come from students in class
  (Boenisch & Soto 2015) and from the curriculum (DLM / Universal Core, UNC CLDS). Most
  relational basic concepts (under, behind, before, few) appear on no core list at all (Cooper &
  Soto 2024).
- **Grammar must be reachable.** Students who use AAC often produce telegraphic messages; they
  need grammatical markers and the words to build full sentences (Binger & Light 2008). Aided
  models that contrast forms help them learn endings (Binger, Maguire-Marshall & Kent-Walsh 2011),
  and a 2026 randomised trial of AAC generative-language intervention supports teaching grammar
  early.
- **Safety and health words are often missing.** People with disabilities are more likely to
  experience abuse, and AAC users often lack the words to report it (Bryen, Carey & Frantz 2003;
  Bornman et al. 2011). Body-safety guidance: correct body-part names, consent words (stop, no,
  don't touch), and a clear way to tell. Pain words were socially validated with AAC users by
  Johnson, Bornman & Tönsing (2016).
- **Peers and quick talk.** Teens who use AAC need quick social phrases for fleeting peer
  interactions (Speech, Language and Hearing, 2024).

## Decision

**Vocabulary.** Twelve topic pages, each a fixed 6 × 7 grid like the home board, reached from a
Topics page (fixed 3 × 5 grid) one tap from anywhere:

| Page         | What it covers                                                                  | Main basis                                      |
| ------------ | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| People       | family, school staff, generic people; 3 empty rows for the student's own people | Laubscher & Light 2020                          |
| Feelings     | 27 feeling words, _feel_, _love_, _hate_                                        | Communication Bill of Rights                    |
| My body      | pain, body parts (correct terms), consent and safety words                      | Johnson et al. 2016; Bryen; Bornman et al. 2011 |
| Food & drink | requests and comments at meals; a row for family foods                          | Fringe practice                                 |
| Places       | school and community places; 3 empty rows                                       | Fringe practice                                 |
| School       | supplies, subjects, routines, literacy words                                    | Boenisch & Soto 2015; DLM                       |
| Play         | play, media, animals; a row for interests                                       | Kong et al. 2026                                |
| Actions      | 40 more high-frequency verbs                                                    | Boenisch & Soto 2015; DLM                       |
| Describe     | describers and colours                                                          | DLM                                             |
| Where & when | space, time and quantity concepts                                               | Cooper & Soto 2024 (Boehm)                      |
| Little words | articles, auxiliaries, pronoun forms, conjunctions                              | Binger & Light 2008                             |
| Chat         | greetings, turn-taking, reactions, peer talk                                    | Teen peer vocabulary 2024                       |

**My body** is also on the rail, so _hurt_, _sick_, _bathroom_, _don't touch_ and _not safe_ are
one tap away on every page. Private body-part words are shown as text only, with no picture. Teams
can hide any word for a student, but hiding safety words should be a documented team decision.

The word lists are our own selection, informed by the research above. No commercial AAC
vocabulary or layout is copied. Symbols are OpenMoji (CC BY-SA 4.0), chosen by exact name match
and reviewed by hand (`scripts/symbol-choices.json`); abstract words stay text-only rather than
get a misleading picture.

**Motor planning.** Every released word's place is pinned in `test/vocabulary.lock.json`; CI fails
if one moves or disappears. Adults can only add words in empty places or hide words (the place
stays empty). Every page has the same header, so grids sit in the same screen position.

Some words appear on two pages (for example _eat_ on Actions and Food & drink). This trades a
single location for fewer taps; teams that follow a strict one-location approach can hide the
duplicates.

**Word endings.** An Endings button in the message bar shows the other forms of the last word as
whole words (go → goes, going, went, gone; dog → dogs, dog's; big → bigger, biggest; I → me, my,
mine). Irregular forms come from a table; regular ones follow spelling rules. Nothing changes
unless the student picks a form.

**Student profiles.** Each student has their own name or nickname, settings, voice, added words,
hidden words and saved sentences. Adults switch students in the adult menu.

**Editor.** In the adult menu → Edit words: tap + in an empty place to add a word (label, what it
says, word type, and a symbol from the shipped set or a photo), or tap a built-in word to hide it.
Photos are resized to 320 px and re-encoded, which removes location and other metadata.

**My sentences.** Students can save the current message; saved sentences persist per student.
"Said today" lists spoken messages for this session only (D22: no persisted history).

**Adult PIN.** Optional 4–8 digit PIN after the 3-second hold, stored as a salted PBKDF2-SHA-256
hash (210,000 iterations). After 5 wrong tries the pad locks for 30 s, doubling up to 15 min.
Adult sessions (menu or editing) close after 10 minutes without a touch (D6).

**Storage (interim).** Profiles, photos and the PIN are stored in IndexedDB behind an `AppStore`
interface. ADR 0003's SQLite-in-OPFS store replaces it behind the same interface after the
Phase 0 storage spike passes on real devices. If IndexedDB can't open (some private-browsing
modes), the app runs from memory and the adult menu says so. The built-in boards never depend on
storage.

**Backup.** Until encrypted sync (Phase 4), adults can download one student's profile, words and
photos as a JSON file and restore it on any device. Restoring always creates a new student; it
never overwrites one. Files are validated (format, size, photo types) before anything is saved.

## Consequences

- The app now stores personal information on the device (a name or nickname and photos). Real
  student data still requires the school's privacy approval (SECURITY.md).
- Backup files contain that information unencrypted. The adult menu says to keep them somewhere
  safe and private. Encrypted backups arrive with Phase 4 sync.
- The PIN prevents accidental changes; it does not protect data from someone with the device.
- Symbols cover about half the topic words. Families and teams can add photos, which research and
  practice favour for personal vocabulary.
- Word endings for typed words use spelling rules and can be wrong for unusual words; the
  student always chooses and can keep the original.

## Sources

Beukelman & Light (2020), _AAC_, 5th ed. ·
Boenisch & Soto (2015), AAC 31:77–84 · Laubscher & Light (2020), AAC 36:43–53 · Frick Semmler,
Bean & Wagner (2024), Int J Speech-Lang Pathol 26:28–37 · Cooper & Soto (2024), AAC 40:281–291 ·
Binger & Light (2008), AAC 24:123–138 · Binger, Maguire-Marshall & Kent-Walsh (2011), JSLHR
54:160–176 · AAC Generative Language Intervention RCT (2026), JSLHR 69:2654–2678 · Johnson,
Bornman & Tönsing (2016), AAC 32:249–260 · Bornman, Bryen et al. (2011) and Bornman & Bryen
(2013), AAC 29:174–181 · Kong et al. (2026), Autism Research · "Teenage vocabulary in peer
interactions" (2024), Speech, Language and Hearing · Universal Core and DLM core vocabulary,
Center for Literacy and Disability Studies, UNC Chapel Hill.
