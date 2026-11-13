/**
 * The public demo's sample student. Everything here is made up, nothing is
 * saved, and it resets on every load.
 */
import { addWordAt, newProfile, saveMessage, type Profile } from "../core/profile";
import { DEFAULT_SETTINGS } from "../core/settings";
import { builtInPlaces } from "../features/communicator/boards";

export function demoProfile(): Profile {
  let p = newProfile("Alex (demo)", DEFAULT_SETTINGS);
  const add = (
    boardId: string,
    row: number,
    col: number,
    label: string,
    kind: Profile["added"][number]["kind"],
    symbol?: string,
  ) => {
    p = addWordAt(
      p,
      { boardId, row, col, label, kind, ...(symbol ? { symbol } : {}) },
      builtInPlaces(boardId),
    );
  };
  // Words a school team might add for one student, in the pages' empty rows.
  add("people", 3, 0, "Ms. Rivera", "noun", "1F9D1-200D-1F3EB");
  add("people", 3, 1, "Sam", "noun", "1F9D1-200D-1F91D-200D-1F9D1");
  add("people", 3, 2, "Grandma Rosa", "noun", "1F475");
  add("food", 5, 0, "pancakes", "noun");
  add("food", 5, 1, "mango", "noun");
  add("play", 5, 0, "trains", "noun");
  add("play", 5, 1, "my dog Biscuit", "noun", "1F415");
  for (const sentence of [
    "Please wait, I'm thinking.",
    "Can I have a turn?",
    "I want to go outside.",
    "My name is Alex.",
  ]) {
    p = saveMessage(p, sentence);
  }
  return p;
}
