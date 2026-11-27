import { readFileSync, writeFileSync } from "node:fs";
import { phonemes, tokenize } from "../project-communicate/src/voice/kokoro";
import { LEXICON } from "../project-communicate/src/voice/voiceModel";
const lex = JSON.parse(
  readFileSync("/home/claude/project-communicate/public/" + LEXICON.path, "utf8"),
);
const groups: Record<string, string[]> = {
  fricative: [
    "fish",
    "seven",
    "shoes",
    "fresh",
    "something",
    "thank you",
    "five",
    "zoo",
    "house",
    "sister",
  ],
  plosive: ["Peter", "paper", "cup", "better", "doctor", "big", "top", "kite", "dog", "help"],
  cluster: ["street", "strength", "splash", "crisp", "breakfast", "spring", "plants", "clothes"],
  vowel: [
    "ship",
    "sheep",
    "full",
    "fool",
    "bed",
    "bad",
    "cot",
    "caught",
    "hat",
    "hot",
    "boot",
    "book",
  ],
  nasal: ["mom", "nine", "sing", "no", "lunch"],
  core: ["yes", "more", "stop", "go", "want", "water", "hungry", "bathroom", "all done", "hello"],
};
const sentences = [
  "Can you please come and help me?",
  "I want something to eat.",
  "The fish swims fast in the street.",
  "My sister has seven shoes.",
  "I need a drink of water, please.",
  "Peter put the paper cup on the table.",
  "Stop, I don't like that.",
  "Can we go outside and play?",
];
const out: Record<string, { group: string; text: string; ph: string; tokens: number[] }> = {};
for (const [g, ws] of Object.entries(groups))
  for (const w of ws) {
    const ph = phonemes(lex, w);
    out[`w-${w.replace(/ /g, "_")}`] = { group: g, text: w, ph, tokens: tokenize(ph) };
  }
sentences.forEach((s, i) => {
  const ph = phonemes(lex, s);
  out[`s-${i + 1}`] = { group: "sentence", text: s, ph, tokens: tokenize(ph) };
});
writeFileSync("corpus.json", JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, "items");
for (const [k, v] of Object.entries(out))
  if (k.startsWith("w-")) process.stdout.write(`${v.text}:${v.ph}  `);
