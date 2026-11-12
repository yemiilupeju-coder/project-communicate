/**
 * The student's message: what they have built so far. Pure functions only, so
 * every rule here is unit-tested and the UI can't change a message by accident.
 *
 * Rules:
 *  - Word order is exactly the order the student chose (never reordered).
 *  - Letters typed on the keyboard collect in a draft word until a space, a
 *    word tap, or Speak commits them.
 *  - Nothing is ever replaced or "corrected" automatically.
 */

export type TokenSource = "board" | "strip" | "keyboard" | "saved";

/** Word type, when it came from a board; used to offer word endings. */
export type TokenKind = "verb" | "noun" | "describer" | "pronoun" | "other";

export interface Token {
  readonly text: string;
  readonly source: TokenSource;
  readonly kind?: TokenKind;
}

export interface Message {
  readonly tokens: readonly Token[];
  /** Letters typed but not yet committed as a word. */
  readonly draft: string;
}

export const EMPTY_MESSAGE: Message = { tokens: [], draft: "" };

const PUNCTUATION = new Set([".", ",", "?", "!", "'"]);

/** Moves the draft (if any) into the token list. */
export function commitDraft(message: Message): Message {
  const text = message.draft.trim();
  if (text.length === 0) return message.draft === "" ? message : { ...message, draft: "" };
  return { tokens: [...message.tokens, { text, source: "keyboard" }], draft: "" };
}

/** Adds a whole word or phrase from a button. */
export function addWord(
  message: Message,
  text: string,
  source: TokenSource,
  kind?: TokenKind,
): Message {
  const committed = commitDraft(message);
  const clean = text.trim();
  if (clean.length === 0) return committed;
  const token: Token = kind ? { text: clean, source, kind } : { text: clean, source };
  return { ...committed, tokens: [...committed.tokens, token] };
}

/** The word a "word endings" choice would change: the draft, else the last word. */
export function lastWord(message: Message): Token | null {
  const draft = message.draft.trim();
  if (draft.length > 0) return { text: draft, source: "keyboard" };
  const last = message.tokens.at(-1);
  if (!last || PUNCTUATION.has(last.text)) return null;
  return last;
}

/**
 * Swaps the last word for another form of it (go → going), chosen by the
 * student. Keeps where the word came from; the form keeps the word's kind.
 */
export function replaceLastWord(message: Message, text: string): Message {
  const clean = text.trim();
  if (clean.length === 0) return message;
  if (message.draft.trim().length > 0) {
    return { tokens: [...message.tokens, { text: clean, source: "keyboard" }], draft: "" };
  }
  const last = message.tokens.at(-1);
  if (!last || PUNCTUATION.has(last.text)) return message;
  return { ...message, tokens: [...message.tokens.slice(0, -1), { ...last, text: clean }] };
}

/** Adds one typed character. A space commits the draft as a word. */
export function typeCharacter(message: Message, character: string): Message {
  if (character === " ") return commitDraft(message);
  if (character.length !== 1) throw new RangeError("typeCharacter takes exactly one character");
  if (PUNCTUATION.has(character) && character !== "'") {
    // Punctuation ends the current word and stands as its own token.
    return addWord(message, character, "keyboard");
  }
  return { ...message, draft: message.draft + character };
}

/** Keyboard backspace: removes one letter from the draft, else the last word. */
export function backspace(message: Message): Message {
  if (message.draft.length > 0) return { ...message, draft: message.draft.slice(0, -1) };
  return deleteLastWord(message);
}

/** Removes the draft if there is one, otherwise the last whole word. */
export function deleteLastWord(message: Message): Message {
  if (message.draft.length > 0) return { ...message, draft: "" };
  if (message.tokens.length === 0) return message;
  return { ...message, tokens: message.tokens.slice(0, -1) };
}

export function clearMessage(): Message {
  return EMPTY_MESSAGE;
}

export function isEmpty(message: Message): boolean {
  return message.tokens.length === 0 && message.draft.trim().length === 0;
}

/** The words as they should be read and spoken, with natural punctuation spacing. */
export function messageText(message: Message): string {
  const parts = [...message.tokens.map((token) => token.text)];
  if (message.draft.trim().length > 0) parts.push(message.draft.trim());
  let text = "";
  for (const part of parts) {
    if (text.length === 0) text = part;
    else if (PUNCTUATION.has(part) && part !== "'") text += part;
    else text += ` ${part}`;
  }
  return text;
}
