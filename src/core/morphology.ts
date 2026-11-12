/**
 * Word endings (Release 2). Given the student's last word, offer its other
 * forms as real words: go → goes, going, went, gone. Showing whole words,
 * not "+ing" tiles, keeps the spelling visible for literacy, and aided
 * modeling with contrasting forms is how students learn them (Binger,
 * Maguire-Marshall & Kent-Walsh 2011).
 *
 * Nothing here changes a message by itself: the student picks a form.
 */

export type FormKind = "verb" | "noun" | "describer" | "pronoun" | "unknown";

export interface WordForm {
  readonly text: string;
  /** Short grammar note for adults (screen readers read the word itself). */
  readonly note: string;
}

const IRREGULAR_VERBS: Readonly<Record<string, readonly [string, string]>> = {
  // base: [past, past participle]
  be: ["was", "been"],
  bring: ["brought", "brought"],
  build: ["built", "built"],
  buy: ["bought", "bought"],
  can: ["could", "could"],
  catch: ["caught", "caught"],
  come: ["came", "come"],
  cut: ["cut", "cut"],
  do: ["did", "done"],
  draw: ["drew", "drawn"],
  drink: ["drank", "drunk"],
  eat: ["ate", "eaten"],
  fall: ["fell", "fallen"],
  feel: ["felt", "felt"],
  find: ["found", "found"],
  get: ["got", "gotten"],
  give: ["gave", "given"],
  go: ["went", "gone"],
  have: ["had", "had"],
  hurt: ["hurt", "hurt"],
  know: ["knew", "known"],
  let: ["let", "let"],
  make: ["made", "made"],
  put: ["put", "put"],
  read: ["read", "read"],
  run: ["ran", "run"],
  say: ["said", "said"],
  see: ["saw", "seen"],
  show: ["showed", "shown"],
  sit: ["sat", "sat"],
  sleep: ["slept", "slept"],
  stand: ["stood", "stood"],
  swim: ["swam", "swum"],
  take: ["took", "taken"],
  tell: ["told", "told"],
  think: ["thought", "thought"],
  throw: ["threw", "thrown"],
  wear: ["wore", "worn"],
  write: ["wrote", "written"],
};

const THIRD_PERSON: Readonly<Record<string, string>> = {
  be: "is",
  can: "can",
  do: "does",
  go: "goes",
  have: "has",
};

const IRREGULAR_PLURALS: Readonly<Record<string, string>> = {
  child: "children",
  fish: "fish",
  foot: "feet",
  man: "men",
  mouse: "mice",
  person: "people",
  sheep: "sheep",
  tooth: "teeth",
  woman: "women",
};

const IRREGULAR_COMPARISON: Readonly<Record<string, readonly [string, string]>> = {
  bad: ["worse", "worst"],
  far: ["farther", "farthest"],
  good: ["better", "best"],
  little: ["littler", "littlest"],
  many: ["more", "most"],
};

/** Adjectives that take -er/-est (the rest use "more"/"most"). */
const COMPARABLE = new Set([
  "big",
  "small",
  "hot",
  "cold",
  "fast",
  "slow",
  "loud",
  "quiet",
  "new",
  "old",
  "clean",
  "dirty",
  "wet",
  "dry",
  "easy",
  "hard",
  "funny",
  "nice",
  "tall",
  "short",
  "full",
  "happy",
  "sad",
  "mad",
  "silly",
  "calm",
  "great",
  "near",
  "few",
  "yummy",
  "yucky",
  "sweet",
  "spicy",
  "itchy",
  "sore",
  "scary",
  "early",
  "late",
  "long",
  "high",
  "low",
  "strong",
  "weak",
]);

const PRONOUN_FORMS: Readonly<Record<string, readonly string[]>> = {
  i: ["me", "my", "mine", "myself"],
  you: ["your", "yours", "yourself"],
  he: ["him", "his", "himself"],
  she: ["her", "hers", "herself"],
  it: ["its", "itself"],
  we: ["us", "our", "ours"],
  they: ["them", "their", "theirs"],
  that: ["this", "those", "these"],
};

const VOWELS = /[aeiou]/;
const vowelGroups = (word: string) => word.match(/[aeiouy]+/g)?.length ?? 0;

/** stop → stopp-, run → runn- (one syllable, consonant-vowel-consonant). */
function doubles(word: string): boolean {
  if (word.length < 3 || vowelGroups(word) !== 1) return false;
  const [a, b, c] = [word.at(-3) ?? "", word.at(-2) ?? "", word.at(-1) ?? ""];
  return !VOWELS.test(a) && VOWELS.test(b) && !VOWELS.test(c) && !/[wxy]/.test(c);
}

function stem(word: string, suffix: "ing" | "ed" | "er" | "est"): string {
  if (word.endsWith("ie") && suffix === "ing") return `${word.slice(0, -2)}ying`;
  if (word.endsWith("e") && !word.endsWith("ee") && !(suffix === "ing" && word === "be"))
    return `${word.slice(0, -1)}${suffix}`;
  if (/[^aeiou]y$/.test(word) && suffix !== "ing") return `${word.slice(0, -1)}i${suffix}`;
  if (doubles(word)) return `${word}${word.at(-1) ?? ""}${suffix}`;
  return `${word}${suffix}`;
}

export function pluralOf(noun: string): string {
  const lower = noun.toLowerCase();
  const irregular = IRREGULAR_PLURALS[lower];
  if (irregular) return matchCase(noun, irregular);
  if (/(s|x|z|ch|sh)$/.test(lower)) return `${noun}es`;
  if (/[^aeiou]y$/.test(lower)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}

export function thirdPersonOf(verb: string): string {
  const lower = verb.toLowerCase();
  return THIRD_PERSON[lower] ?? pluralOf(verb);
}

function matchCase(original: string, form: string): string {
  return original[0] === original[0]?.toUpperCase() && original !== "I"
    ? form[0]?.toUpperCase() + form.slice(1)
    : form;
}

function verbForms(verb: string): WordForm[] {
  const lower = verb.toLowerCase();
  if (lower === "is" || lower === "am" || lower === "are" || lower === "be") {
    return ["is", "am", "are", "was", "were", "be", "been", "being"]
      .filter((w) => w !== lower)
      .map((text) => ({ text, note: "form of be" }));
  }
  const irregular = IRREGULAR_VERBS[lower];
  const past = irregular?.[0] ?? stem(lower, "ed");
  const participle = irregular?.[1] ?? past;
  const forms: WordForm[] = [
    { text: thirdPersonOf(lower), note: "he/she/it ___" },
    { text: lower === "can" ? "can" : stem(lower, "ing"), note: "-ing" },
    { text: past, note: "past" },
  ];
  if (participle !== past) forms.push({ text: participle, note: "has ___" });
  if (lower === "can")
    return [
      { text: "could", note: "past" },
      { text: "can't", note: "not" },
    ];
  return dedupe(forms, lower);
}

function nounForms(noun: string): WordForm[] {
  return dedupe(
    [
      { text: pluralOf(noun), note: "more than one" },
      { text: `${noun}'s`, note: "belongs to" },
    ],
    noun,
  );
}

function describerForms(word: string): WordForm[] {
  const lower = word.toLowerCase();
  const irregular = IRREGULAR_COMPARISON[lower];
  if (irregular) {
    return [
      { text: irregular[0], note: "comparing two" },
      { text: irregular[1], note: "the most" },
    ];
  }
  if (!COMPARABLE.has(lower)) return [];
  return [
    { text: stem(lower, "er"), note: "comparing two" },
    { text: stem(lower, "est"), note: "the most" },
  ];
}

function dedupe(forms: WordForm[], base: string): WordForm[] {
  const seen = new Set([base]);
  return forms.filter((f) => (seen.has(f.text) ? false : (seen.add(f.text), true)));
}

/**
 * Other forms of a word. With a known kind, only forms that make sense for
 * it; for typed words (unknown kind), every common ending, so the student
 * can still choose.
 */
export function wordForms(word: string, kind: FormKind): WordForm[] {
  const clean = word.trim();
  if (clean.length === 0) return [];
  if (clean.includes(" ")) {
    // Names like "Ms. Patel" or "Grandma Ada" can still belong to someone.
    return kind === "noun" ? [{ text: `${clean}'s`, note: "belongs to" }] : [];
  }
  const lower = clean.toLowerCase();
  if (kind === "pronoun") {
    return (PRONOUN_FORMS[lower] ?? []).map((text) => ({ text, note: "pronoun" }));
  }
  if (kind === "verb") return verbForms(clean);
  if (kind === "noun") return nounForms(clean);
  if (kind === "describer") return describerForms(clean);
  const all = [...verbForms(lower), ...nounForms(clean), ...describerForms(lower)];
  return dedupe(all, lower);
}
