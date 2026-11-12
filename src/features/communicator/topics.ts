/**
 * Topic boards (Release 2). See docs/adr/0008-research-based-vocabulary.md.
 *
 * Every board is a fixed 6 × 7 grid, like the home board. A word's place is
 * permanent once released (checked against test/vocabulary.lock.json), so
 * students can build motor patterns. Empty places are for words the school
 * team adds for one student (names, family foods, favourite things).
 *
 * Entry format: "label", "label~kind", or "label~kind=spoken text".
 * "" leaves a place empty.
 */

import type { WordKind } from "./vocabulary";

export const TOPIC_ROWS = 6;
export const TOPIC_COLS = 7;

export interface TopicCell {
  readonly id: string;
  readonly label: string;
  readonly spoken?: string;
  readonly kind: WordKind;
  readonly row: number;
  readonly col: number;
  readonly symbol?: string;
}

export interface TopicBoard {
  readonly id: string;
  readonly title: string;
  /** Folder symbol shown on the Topics page and rail. */
  readonly symbol: string;
  /** Short note for adults: what the research behind this page is. */
  readonly basis: string;
  readonly cells: readonly TopicCell[];
}

type Grid = readonly (readonly string[])[];

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function board(
  id: string,
  title: string,
  symbol: string,
  basis: string,
  defaultKind: WordKind,
  grid: Grid,
): TopicBoard {
  if (grid.length > TOPIC_ROWS) throw new RangeError(`${id}: too many rows`);
  const cells: TopicCell[] = [];
  grid.forEach((row, r) => {
    if (row.length > TOPIC_COLS) throw new RangeError(`${id}: row ${r} too long`);
    row.forEach((entry, c) => {
      if (entry === "") return;
      const [head = "", spoken] = entry.split("=");
      const [label = "", kind] = head.split("~");
      cells.push({
        id: `${id}-${slug(label)}`,
        label,
        kind: (kind as WordKind | undefined) ?? defaultKind,
        row: r,
        col: c,
        ...(spoken ? { spoken } : {}),
      });
    });
  });
  return { id, title, symbol, basis, cells };
}

const E = "";

// prettier-ignore
const RAW: readonly TopicBoard[] = [
  board("people", "People", "1F46A",
    "Early words are mostly the names of people and things (Laubscher & Light 2020). Empty rows are for this student's own people.",
    "noun", [
    ["mom", "dad", "brother", "sister", "grandma", "grandpa", "baby"],
    ["family", "friend", "teacher", "helper", "principal", "bus driver", "nurse"],
    ["doctor", "boy", "girl", "man", "woman", "kids", "everyone"],
    [E, E, E, E, E, E, E],
    [E, E, E, E, E, E, E],
    [E, E, E, E, E, E, E],
  ]),
  board("feelings", "Feelings", "1F60A",
    "Naming feelings is part of the right to express feelings (Communication Bill of Rights).",
    "describer", [
    ["feel~verb", "happy", "sad", "mad", "scared", "excited", "okay"],
    ["tired", "bored", "frustrated", "worried", "calm", "proud", "silly"],
    ["sick", "hurt", "upset", "lonely", "confused", "surprised", "embarrassed"],
    ["love~verb", "hate~verb", "fun", "great", "bad", "better", "annoyed"],
    [E, E, E, E, E, E, E],
    [E, E, E, E, E, E, E],
  ]),
  board("body", "My body", "1F9CD",
    "Pain words socially validated with AAC users (Johnson, Bornman & Tönsing 2016); correct body-part and consent words for body safety and abuse disclosure (Bryen; Bornman et al. 2011).",
    "noun", [
    ["hurt~verb", "sick~describer", "bathroom", "pain", "sore~describer", "itchy~describer", "dizzy~describer"],
    ["head", "eye", "ear", "nose", "mouth", "teeth", "throat"],
    ["arm", "hand", "chest", "tummy", "back", "leg", "foot"],
    ["bottom", "penis", "vulva", "private~describer", "skin", "hair", "blood"],
    ["touch~verb", "don't touch~social", "safe~describer", "not safe~describer", "tell~verb", "hug", "throw up~verb"],
    ["a little~describer", "a lot~describer", "better~describer", "worse~describer", "medicine", "hot~describer", "cold~describer"],
  ]),
  board("food", "Food & drink", "1F37D",
    "Mealtimes are a daily chance to request and comment. The bottom row is for this student's family foods.",
    "noun", [
    ["eat~verb", "drink~verb", "hungry~describer", "thirsty~describer", "snack", "lunch", "breakfast"],
    ["water", "milk", "juice", "apple", "banana", "orange", "grapes"],
    ["pizza", "sandwich", "cheese", "crackers", "cookie", "chips", "yogurt"],
    ["chicken", "rice", "pasta", "soup", "egg", "bread", "vegetables"],
    ["yummy~describer", "yucky~describer", "dinner", "fruit", "spicy~describer", "sweet~describer", "candy"],
    [E, E, E, E, E, E, E],
  ]),
  board("places", "Places", "1F3EB",
    "Places in the school day and community. Empty rows are for this student's own places.",
    "noun", [
    ["home", "school", "classroom", "bathroom", "gym", "library", "office"],
    ["outside", "inside", "playground", "lunchroom", "hallway", "bus", "car"],
    ["store", "park", "pool", "doctor's office", "hospital", "restaurant", "friend's house"],
    [E, E, E, E, E, E, E],
    [E, E, E, E, E, E, E],
    [E, E, E, E, E, E, E],
  ]),
  board("school", "School", "1F4DA",
    "Classroom and curriculum words so students can take part in lessons, not only make requests (Boenisch & Soto 2015; DLM core vocabulary).",
    "noun", [
    ["book", "pencil", "paper", "crayon", "marker", "scissors", "glue"],
    ["computer", "tablet", "desk", "chair", "backpack", "coat", "lunch box"],
    ["reading", "writing", "math", "science", "art", "music", "phys ed"],
    ["work", "break", "recess", "circle", "line up~verb", "homework", "test"],
    ["question", "answer", "idea", "story", "letter", "number", "word"],
    ["name", "page", "picture", E, E, E, E],
  ]),
  board("play", "Play", "1F3B2",
    "Play and interests drive interaction; a child's own interest words are often missing from core lists (Kong et al. 2026).",
    "noun", [
    ["play~verb", "game", "toy", "ball", "blocks", "puzzle", "cards"],
    ["swing", "slide", "bike", "run~verb", "jump~verb", "swim~verb", "dance~verb"],
    ["music", "song", "video", "movie", "TV", "show", "phone"],
    ["draw~verb", "paint~verb", "colour~verb", "bubbles", "sand", "snow", "tag"],
    ["dog", "cat", "fish", "bird", "horse", "bug", "dinosaur"],
    [E, E, E, E, E, E, E],
  ]),
  board("actions", "Actions", "1F3C3",
    "More of the high-frequency verbs school-age children use (Boenisch & Soto 2015; DLM core vocabulary).",
    "verb", [
    ["eat", "drink", "play", "read", "write", "see", "say"],
    ["tell", "talk", "think", "know", "need", "feel", "come"],
    ["give", "take", "have", "find", "show", "try", "wait"],
    ["sit", "stand", "walk", "run", "sleep", "wash", "wear"],
    ["love", "listen", "watch", "work", "use", "bring", "let"],
    ["push", "pull", "cut", "build", "fix", E, E],
  ]),
  board("describe", "Describe", "1F308",
    "Describing words and colours for commenting and curriculum talk.",
    "describer", [
    ["big", "little", "hot", "cold", "fast", "slow", "loud"],
    ["quiet", "new", "old", "clean", "dirty", "wet", "dry"],
    ["easy", "hard", "funny", "nice", "bad", "broken", "fun"],
    ["red", "blue", "green", "yellow", "orange", "purple", "pink"],
    ["black", "white", "brown", "full", "empty", "tall", "short"],
    [E, E, E, E, E, E, E],
  ]),
  board("where-when", "Where & when", "1F9ED",
    "Relational basic concepts of space, time and quantity, which most core lists leave out (Cooper & Soto 2024; Boehm).",
    "describer", [
    ["under", "over", "behind", "in front", "next to", "between", "around"],
    ["out", "off", "down", "away", "near", "far", "back"],
    ["first", "next", "last", "before", "after", "then", "again"],
    ["now", "later", "soon", "today", "tomorrow", "yesterday", "always"],
    ["morning", "afternoon", "night", "week", "day", "time", "never"],
    ["many", "few", "less", "each", "both", "every", "only"],
  ]),
  board("little-words", "Little words", "1F517",
    "Grammar words for full sentences; students who use AAC are often left with telegraphic messages without them (Binger & Light 2008).",
    "little", [
    ["is", "am", "are", "was", "will", "have", "has"],
    ["the", "a", "an", "to", "and", "or", "but"],
    ["my~pronoun", "me~pronoun", "your~pronoun", "we~pronoun", "they~pronoun", "us~pronoun", "them~pronoun"],
    ["his~pronoun", "her~pronoun", "our~pronoun", "their~pronoun", "this~pronoun", "these~pronoun", "those~pronoun"],
    ["did", "does", "don't", "can't", "won't", "of", "for"],
    ["with", "at", "because", "if", "so", "very", "too"],
  ]),
  board("chat", "Chat", "1F5E8",
    "Quick social phrases for fleeting peer interactions, identified in research on teen peer vocabulary (Speech, Language and Hearing, 2024).",
    "social", [
    ["hi", "bye", "please", "thank you", "sorry", "excuse me", "you're welcome"],
    ["my turn", "your turn", "me too", "I don't know", "maybe", "okay", "what's up?"],
    ["cool", "awesome", "wow", "yay", "oh no", "uh oh", "ha ha"],
    ["that's funny", "good job", "no way", "really?", "gross", "I love it", "all done"],
    ["see you later", "how are you?", "leave me alone", "listen to me", "come here", "look at this", "my name is"],
    [E, E, E, E, E, E, E],
  ]),
];

export const TOPICS: readonly TopicBoard[] = RAW;

export function topicById(id: string): TopicBoard | undefined {
  return TOPICS.find((t) => t.id === id);
}

/** Attach symbols (resolved from OpenMoji annotations; see topicSymbols.ts). */
export function withSymbols(
  boards: readonly TopicBoard[],
  symbols: Readonly<Record<string, string>>,
): TopicBoard[] {
  return boards.map((b) => ({
    ...b,
    cells: b.cells.map((c) => {
      const hex = symbols[c.id];
      return hex ? { ...c, symbol: hex } : c;
    }),
  }));
}
