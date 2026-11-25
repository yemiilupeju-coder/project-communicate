// Writes scripts/voices/texts.json: every built-in phrase, one per clip key.
// Run with: npm run voices:texts
import { writeFileSync } from "node:fs";
import { clipKey } from "../../src/core/voicePack";
import { speakableTexts } from "../../src/features/communicator/speakable";

const byKey = new Map<string, string>();
for (const text of speakableTexts()) {
  const key = clipKey(text);
  if (key && !byKey.has(key)) byKey.set(key, text);
}
const list = [...byKey]
  .map(([key, text]) => ({ key, text }))
  .sort((a, b) => a.key.localeCompare(b.key));
writeFileSync(new URL("./texts.json", import.meta.url), JSON.stringify(list, null, 1) + "\n");
console.log(`${list.length} phrases`);
