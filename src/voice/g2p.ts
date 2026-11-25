/**
 * English words → Kokoro phonemes, without eSpeak (which is GPL-3.0).
 *
 * Follows misaki's US English lexicon rules (Apache 2.0, hexgrad): the gold
 * and silver dictionaries (public/voice-model/lexicon-us.json, ~182,000
 * words), special cases for little words, and the -s, -ed and -ing endings.
 * Words in neither dictionary (often names) get a pronunciation from
 * spelling rules; adults can respell any word in "Spoken as" to fix it.
 */

export type Lexicon = Readonly<Record<string, string>>;

const PRIMARY = "ˈ";
const SECONDARY = "ˌ";
const STRESSES = PRIMARY + SECONDARY;
const VOWELS = new Set("AIOQWYaiuæɑɒɔəɛɜɪʊʌᵻ");
const US_TAUS = new Set("AIOWYiuæɑəɛɪɹʊʌ");
const PUNCTUATION = new Set(';:,.!?—…"“”');

function hasVowel(ps: string): boolean {
  for (const ch of ps) if (VOWELS.has(ch)) return true;
  return false;
}

/** Moves each stress mark to just before the next vowel (misaki's restress). */
function restress(ps: string): string {
  const chars = [...ps];
  const placed: { at: number; ch: string }[] = chars.map((ch, i) => ({ at: i, ch }));
  chars.forEach((ch, i) => {
    if (!STRESSES.includes(ch)) return;
    const j = chars.findIndex((c, k) => k > i && VOWELS.has(c));
    if (j >= 0) placed[i]!.at = j - 0.5;
  });
  return placed
    .sort((a, b) => a.at - b.at)
    .map((p) => p.ch)
    .join("");
}

function applyStress(ps: string, stress: number | null): string {
  if (stress === null) return ps;
  const noStress = ![...STRESSES].some((s) => ps.includes(s));
  if (stress < -1) return ps.replaceAll(PRIMARY, "").replaceAll(SECONDARY, "");
  if (stress === -1 || ((stress === 0 || stress === -0.5) && ps.includes(PRIMARY)))
    return ps.replaceAll(SECONDARY, "").replaceAll(PRIMARY, SECONDARY);
  if ((stress === 0 || stress === 0.5 || stress === 1) && noStress)
    return hasVowel(ps) ? restress(SECONDARY + ps) : ps;
  if (stress >= 1 && !ps.includes(PRIMARY) && ps.includes(SECONDARY))
    return ps.replaceAll(SECONDARY, PRIMARY);
  if (stress > 1 && noStress) return hasVowel(ps) ? restress(PRIMARY + ps) : ps;
  return ps;
}

const capitalise = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

class Dictionary {
  constructor(private readonly words: Lexicon) {}

  /** `end`: the word ends a phrase, where some little words are stressed ("stop that"). */
  get(word: string, end = false): string | undefined {
    if (end) {
      const stressed = this.words[word + "$"] ?? this.words[word.toLowerCase() + "$"];
      if (stressed !== undefined) return stressed;
    }
    // misaki's grow_dictionary: lowercase and Capitalised forms find each other.
    return (
      this.words[word] ??
      (word.length > 1 && word === capitalise(word.toLowerCase())
        ? this.words[word.toLowerCase()]
        : undefined) ??
      (word.length > 1 && word === word.toLowerCase() ? this.words[capitalise(word)] : undefined)
    );
  }

  known(word: string): boolean {
    if (this.get(word) !== undefined) return true;
    if (!/^[A-Za-z'-]+$/.test(word)) return false;
    if (word.length === 1) return true;
    if (word === word.toUpperCase() && this.get(word.toLowerCase()) !== undefined) return true;
    // All capitals after the first letter ("TV", "PE"): spelled out.
    return word.slice(1) === word.slice(1).toUpperCase();
  }

  /** Letters said one by one, for initials ("A.B.") and acronyms. */
  letters(word: string): string | null {
    const parts = [...word].filter((c) => /[A-Za-z]/.test(c)).map((c) => this.get(c.toUpperCase()));
    if (parts.some((p) => p === undefined)) return null;
    const ps = applyStress(parts.join(""), 0);
    const i = ps.lastIndexOf(SECONDARY);
    return i >= 0 ? ps.slice(0, i) + PRIMARY + ps.slice(i + 1) : ps;
  }

  lookup(word: string, stress: number | null, end = false): string | null {
    let w = word;
    let acronym = false;
    if (w === w.toUpperCase() && this.get(w) === undefined) {
      w = w.toLowerCase();
      acronym = word.length > 1;
    }
    const ps = acronym ? this.words[w] : this.get(w, end);
    if (ps === undefined || (acronym && !ps.includes(PRIMARY))) {
      const spelled = this.letters(w);
      if (spelled) return spelled;
      if (ps === undefined) return null;
    }
    return applyStress(ps, stress);
  }
}

function plural(stem: string): string {
  const last = stem.at(-1) ?? "";
  if ("ptkfθ".includes(last)) return stem + "s";
  if ("szʃʒʧʤ".includes(last)) return stem + "ᵻz";
  return stem + "z";
}

function past(stem: string): string {
  const last = stem.at(-1) ?? "";
  if ("pkfθʃsʧ".includes(last)) return stem + "t";
  if (last === "d") return stem + "ᵻd";
  if (last !== "t") return stem + "d";
  if (stem.length < 2) return stem + "ɪd";
  if (US_TAUS.has(stem.at(-2)!)) return stem.slice(0, -1) + "ɾᵻd";
  return stem + "ᵻd";
}

function ing(stem: string): string {
  if (stem.length > 1 && stem.at(-1) === "t" && US_TAUS.has(stem.at(-2)!))
    return stem.slice(0, -1) + "ɾɪŋ";
  return stem + "ɪŋ";
}

function fromDictionary(
  d: Dictionary,
  word: string,
  stress: number | null,
  nextVowel: boolean | null,
): string | null {
  // Little words that depend on what follows (misaki's special cases).
  if (word === "a") return "ɐ";
  if (word === "am" || word === "Am") return nextVowel === null ? (d.get("am") ?? "ˈæm") : "ɐm";
  if (word === "an" || word === "An") return "ɐn";
  if (word === "I") return `${SECONDARY}I`;
  if (word === "to" || word === "To")
    return nextVowel === null ? (d.get("to") ?? "tˈu") : nextVowel ? "tʊ" : "tə";
  if (word === "the" || word === "The") return nextVowel ? "ði" : "ðə";
  if (/\./.test(word.replace(/^\.+|\.+$/g, "")) && /^[A-Za-z.]+$/.test(word))
    return d.letters(word);

  if (d.known(word)) return d.lookup(word, stress, nextVowel === null);
  if (word.endsWith("s'") && d.known(word.slice(0, -2) + "'s"))
    return d.lookup(word.slice(0, -2) + "'s", stress);
  if (word.endsWith("'") && d.known(word.slice(0, -1))) return d.lookup(word.slice(0, -1), stress);

  // -s, -'s, -es, -ies. (A one-letter stem is a letter name, not a word: "ed" is not "E-d".)
  const end = nextVowel === null;
  const k = (w: string) => w.length > 1 && d.known(w);
  let stem: string | null = null;
  if (word.length > 2 && word.endsWith("s") && !word.endsWith("ss") && k(word.slice(0, -1)))
    stem = word.slice(0, -1);
  else if (
    (word.endsWith("'s") || (word.length > 4 && word.endsWith("es"))) &&
    k(word.slice(0, -2))
  )
    stem = word.slice(0, -2);
  else if (word.length > 4 && word.endsWith("ies") && k(word.slice(0, -3) + "y"))
    stem = word.slice(0, -3) + "y";
  if (stem) {
    const ps = d.lookup(stem, stress, end);
    return ps ? plural(ps) : null;
  }
  // -d, -ed
  if (word.endsWith("d") && !word.endsWith("dd") && k(word.slice(0, -1))) stem = word.slice(0, -1);
  else if (word.endsWith("ed") && !word.endsWith("eed") && k(word.slice(0, -2)))
    stem = word.slice(0, -2);
  if (stem) {
    const ps = d.lookup(stem, stress, end);
    return ps ? past(ps) : null;
  }
  // -ing
  if (word.endsWith("ing") && k(word.slice(0, -3))) stem = word.slice(0, -3);
  else if (word.endsWith("ing") && k(word.slice(0, -3) + "e")) stem = word.slice(0, -3) + "e";
  else if (/([bcdgklmnprstvxz])\1ing$|cking$/.test(word) && k(word.slice(0, -4)))
    stem = word.slice(0, -4);
  if (stem) {
    const ps = d.lookup(stem, stress ?? 0.5, end);
    return ps ? ing(ps) : null;
  }
  return beyondMisaki(d, word, stress);
}

/**
 * Additions to misaki, for words its dictionaries miss that would otherwise
 * fall to the rougher spelling rules: British spellings ("colour"), -er,
 * -est and -ly endings, and a possessive on a word that is itself built
 * from a stem ("vegetables's").
 */
function beyondMisaki(d: Dictionary, word: string, stress: number | null): string | null {
  const lower = word.toLowerCase();
  const american = lower
    .replace(/our(s|ed|ing|ful|ite|ites)?$/, "or$1")
    .replace(/ourite/, "orite")
    .replace(/is(e|es|ed|ing|ation)$/, "iz$1")
    .replace(/ys(e|es|ed|ing)$/, "yz$1")
    .replace(/tre(s)?$/, "ter$1")
    .replace(/ogue(s)?$/, "og$1");
  if (american !== lower) {
    const ps = fromDictionary(d, american, stress, false);
    if (ps) return ps;
  }
  for (const cut of ["'s", "es", "s"]) {
    if (!lower.endsWith(cut) || lower.length < cut.length + 3 || lower.endsWith("ss")) continue;
    const ps = fromDictionary(d, lower.slice(0, -cut.length), stress, false);
    if (ps) return plural(ps);
  }
  const endings: readonly [string, string][] = [
    ["est", "ɪst"],
    ["er", "əɹ"],
    ["ly", "li"],
  ];
  for (const [suffix, sound] of endings) {
    if (!lower.endsWith(suffix) || lower.length < suffix.length + 3) continue;
    const base = lower.slice(0, -suffix.length);
    const stems = [base, base + "e", base.replace(/i$/, "y"), base.replace(/([bdgmnpt])\1$/, "$1")];
    if (suffix === "ly") stems.push(base + "le");
    for (const stem of stems) {
      if (stem === base + "le" && d.known(stem))
        return d.lookup(stem, stress)!.replace(/ᵊl$|əl$/, "") + "li";
      if (stem.length > 1 && d.known(stem)) {
        const ps = d.lookup(stem, stress);
        if (ps) return (suffix === "ly" ? ps.replace(/i$/, "ə") : ps) + sound;
      }
    }
  }
  return null;
}

// ── Spelling rules for words in no dictionary (often names) ──

// Longest spellings first; "V" marks a vowel letter that follows.
const SPELLING: readonly [RegExp, string][] = [
  [/^tch/, "ʧ"],
  [/^dge/, "ʤ"],
  [/^igh/, "I"],
  [/^ough/, "ɔ"],
  [/^augh/, "ɔ"],
  [/^tion/, "ʃən"],
  [/^sion/, "ʒən"],
  [/^ture/, "ʧəɹ"],
  [/^air/, "ɛɹ"],
  [/^ear/, "ɪɹ"],
  [/^eer/, "ɪɹ"],
  [/^our/, "ɔɹ"],
  [/^ch/, "ʧ"],
  [/^sh/, "ʃ"],
  [/^th/, "θ"],
  [/^ph/, "f"],
  [/^wh/, "w"],
  [/^ck/, "k"],
  [/^ng/, "ŋ"],
  [/^qu/, "kw"],
  [/^gh/, "ɡ"],
  [/^ai/, "A"],
  [/^ay/, "A"],
  [/^ee/, "i"],
  [/^ea/, "i"],
  [/^ie$/, "i"],
  [/^ei/, "A"],
  [/^oa/, "O"],
  [/^oo/, "u"],
  [/^ou/, "W"],
  [/^ow$/, "O"],
  [/^ow/, "W"],
  [/^oi/, "Y"],
  [/^oy/, "Y"],
  [/^au/, "ɔ"],
  [/^aw/, "ɔ"],
  [/^ew/, "ju"],
  [/^ue$/, "u"],
  [/^ar/, "ɑɹ"],
  [/^er$/, "əɹ"],
  [/^ers$/, "əɹz"],
  [/^er/, "ɜɹ"],
  [/^ir/, "ɜɹ"],
  [/^ur/, "ɜɹ"],
  [/^or/, "ɔɹ"],
  [/^c(?=[eiy])/, "s"],
  [/^g(?=[eiy])/, "ʤ"],
  [/^x/, "ks"],
  [/^j/, "ʤ"],
  [/^c/, "k"],
  [/^q/, "k"],
  [/^r/, "ɹ"],
  [/^g/, "ɡ"],
  [/^y(?=[aeiou])/, "j"],
  [/^b/, "b"],
  [/^d/, "d"],
  [/^f/, "f"],
  [/^h/, "h"],
  [/^k/, "k"],
  [/^l/, "l"],
  [/^m/, "m"],
  [/^n/, "n"],
  [/^p/, "p"],
  [/^s/, "s"],
  [/^t/, "t"],
  [/^v/, "v"],
  [/^w/, "w"],
  [/^z/, "z"],
];

/** A rough pronunciation from spelling: good enough for most names. */
export function fromSpelling(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return "";
  w = w
    .replace(/^kn/, "n")
    .replace(/^wr/, "r")
    .replace(/^ps/, "s")
    .replace(/^x/, "z")
    .replace(/([bcdfgklmnprstvz])\1/g, "$1");
  // "Kate", "Mike": a final e after one consonant makes the vowel before it long.
  const silentE = /[aeiou][^aeiouy]e$/.test(w) && w.length > 3;
  if (silentE) w = w.slice(0, -1);
  const pieces: string[] = [];
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);
    const rule = SPELLING.find(([re]) => re.test(rest));
    if (rule) {
      pieces.push(rule[1]);
      i += rest.match(rule[0])![0].length;
      continue;
    }
    const ch = w[i]!;
    const last = i === w.length - 1;
    const long = silentE && i === w.length - 2;
    const after = pieces.some(hasVowel);
    let ps = "";
    if (ch === "a") ps = last && after ? "ə" : long ? "A" : last ? "ɑ" : "æ";
    else if (ch === "e") ps = last ? "i" : long ? "i" : "ɛ";
    else if (ch === "i") ps = last ? "i" : long ? "I" : "ɪ";
    else if (ch === "o") ps = last || long ? "O" : "ɑ";
    else if (ch === "u") ps = last || long ? "u" : "ʌ";
    else if (ch === "y") ps = last ? (after ? "i" : "I") : "ɪ";
    pieces.push(ps);
    i++;
  }
  // Stress the first syllable of short words, and the one before last in
  // longer ones ("Okafor", "Pikachu"), as English speakers tend to.
  const syllables = pieces.flatMap((piece, at) => (hasVowel(piece) ? [at] : []));
  if (syllables.length === 0) return pieces.join("");
  const stressed = syllables[syllables.length >= 3 ? syllables.length - 2 : 0]!;
  pieces[stressed] = PRIMARY + pieces[stressed]!;
  let out = restress(pieces.join(""));
  // A final s after a voiced sound is said z ("eds", "phys").
  if (/[^s]s$/.test(w) && /[bdgvmnlɹŋAIOWYiuæɑɒɔəɛɜɪʊʌ]s$/.test(out)) out = out.slice(0, -1) + "z";
  return out;
}

const ONES =
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(
    " ",
  );
const TENS = "  twenty thirty forty fifty sixty seventy eighty ninety".split(" ");

/** Whole numbers in words, for numbers typed on the keyboard. */
export function numberWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 20) return ONES[n]!;
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000)
    return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + numberWords(n % 100) : "");
  for (const [size, name] of [
    [1e9, "billion"],
    [1e6, "million"],
    [1e3, "thousand"],
  ] as const) {
    if (n >= size)
      return (
        numberWords(Math.floor(n / size)) +
        " " +
        name +
        (n % size ? " " + numberWords(n % size) : "")
      );
  }
  return "";
}

const ORDINALS: Readonly<Record<string, string>> = {
  one: "first",
  two: "second",
  three: "third",
  five: "fifth",
  eight: "eighth",
  nine: "ninth",
  twelve: "twelfth",
};

/** 1st, 2nd, 23rd → first, second, twenty third. */
export function ordinalWords(n: number): string {
  const words = numberWords(n).split(" ");
  const last = words.pop()!;
  const ordinal = ORDINALS[last] ?? (last.endsWith("y") ? last.slice(0, -1) + "ieth" : last + "th");
  return [...words, ordinal].join(" ");
}

/**
 * Phonemes for normalised text: each word from the dictionaries (or the
 * spelling rules), punctuation kept, words separated by spaces.
 */
export function toPhonemes(lexicon: Lexicon, text: string): string {
  const d = new Dictionary(lexicon);
  const expanded = text
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, n: string) => ordinalWords(Number(n)))
    .replace(/\d+/g, (n) => " " + numberWords(Number(n)) + " ");
  const tokens = expanded.match(/[A-Za-z][A-Za-z'.-]*[A-Za-z']|[A-Za-z]|[;:,.!?—…"“”]/g) ?? [];
  const out: string[] = new Array<string>(tokens.length);
  let nextVowel: boolean | null = null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]!;
    if (PUNCTUATION.has(token)) {
      out[i] = token;
      nextVowel = null;
      continue;
    }
    const parts = token.split("-").filter(Boolean);
    const said = parts
      .map((part) => {
        const stress = part === part.toLowerCase() ? null : part === part.toUpperCase() ? 2 : 0.5;
        return fromDictionary(d, part, stress, nextVowel) ?? fromSpelling(part);
      })
      .join(" ");
    out[i] = said;
    const first = [...said].find((c) => !STRESSES.includes(c));
    nextVowel = first ? VOWELS.has(first) : null;
  }
  // Punctuation attaches to the word before it; words are separated by spaces.
  let result = "";
  for (const piece of out) {
    if (piece === undefined) continue;
    if (PUNCTUATION.has(piece)) result += piece;
    else result += (result ? " " : "") + piece;
  }
  return result.trim();
}
