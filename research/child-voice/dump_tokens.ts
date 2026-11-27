import { readFileSync, writeFileSync } from "node:fs";
import { phonemes, tokenize } from "../../src/voice/kokoro";
import { LEXICON } from "../../src/voice/voiceModel";
const P = new URL("../../", import.meta.url).pathname;
const lex = JSON.parse(readFileSync(P + "public/" + LEXICON.path, "utf8"));
const s = JSON.parse(readFileSync(P + "scripts/voice-benchmark/script.json", "utf8"));
const items: Record<string, { text: string; ph: string; tokens: number[] }> = {};
const add = (id: string, text: string) => {
  const ph = phonemes(lex, text);
  items[id] = { text, ph, tokens: tokenize(ph) };
};
s.short.forEach((t: string, i: number) => add(`1-short-${i + 1}`, t));
s.conversational.forEach((t: string, i: number) => add(`2-conv-${i + 1}`, t));
s.expressive.forEach((t: string, i: number) => add(`3-expr-${i + 1}`, t));
(s.narration.match(/[^.!?]+[.!?]/g) as string[]).forEach((t, i) =>
  add(`4-narr-${String(i + 1).padStart(2, "0")}`, t.trim()),
);
s.assembled.forEach((ws: string[], i: number) => {
  ws.forEach((w, j) => add(`5-asm-${i + 1}-w${j + 1}`, w));
  const sent = ws.join(" ");
  add(`5-asm-${i + 1}-whole`, sent[0].toUpperCase() + sent.slice(1) + (i === 1 ? "?" : "."));
});
writeFileSync("tokens.json", JSON.stringify(items, null, 1));
console.log(Object.keys(items).length, "items");
