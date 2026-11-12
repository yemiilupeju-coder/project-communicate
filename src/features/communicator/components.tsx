import { Fragment, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { messageText, type Message } from "../../core/message";
import type { WordForm } from "../../core/morphology";
import type { SavedMessage } from "../../core/profile";
import type { BoardView, Folder, ShownCell } from "./boards";
import { KEYBOARD_COLS, KEYBOARD_ROWS, symbolUrl, type Key, type StripPhrase } from "./vocabulary";

function Symbol({ hexcode }: { hexcode: string | undefined }) {
  if (!hexcode) return null;
  // Decorative: the word itself is the accessible name of the button.
  return (
    <img className="symbol" src={symbolUrl(hexcode)} alt="" aria-hidden="true" draggable={false} />
  );
}

function Photo({ url }: { url: string | undefined }) {
  if (!url) return null;
  return <img className="symbol photo" src={url} alt="" aria-hidden="true" draggable={false} />;
}

const place = (row: number, col: number, colSpan = 1): CSSProperties => ({
  gridRow: row + 1,
  gridColumn: `${col + 1} / span ${colSpan}`,
});

const gridStyle = (rows: number, cols: number): CSSProperties => ({
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
});

// ── Message bar ──────────────────────────────────────────────────────────────

interface MessageBarProps {
  message: Message;
  canChangeEnding: boolean;
  endingsOpen: boolean;
  onSpeak: () => void;
  onEndings: () => void;
  onDeleteWord: () => void;
  onClear: () => void;
}

export function MessageBar({
  message,
  canChangeEnding,
  endingsOpen,
  onSpeak,
  onEndings,
  onDeleteWord,
  onClear,
}: MessageBarProps) {
  const text = messageText(message);
  const empty = text.length === 0;
  return (
    <section className="message-bar" aria-label="Your message">
      <button
        type="button"
        className="message-text"
        onClick={onSpeak}
        aria-label={empty ? "Message is empty" : `Speak your message: ${text}`}
      >
        <span aria-live="polite">
          {message.tokens.map((token, index) => {
            const punct = /^[.,?!]$/.test(token.text);
            return (
              <Fragment key={index}>
                {index > 0 && !punct && " "}
                <span className={`token token-${token.source}`}>{token.text}</span>
              </Fragment>
            );
          })}
          {message.draft.length > 0 && (
            <>
              {message.tokens.length > 0 && " "}
              <span className="token draft">{message.draft}</span>
            </>
          )}
          {empty && <span className="placeholder">Your words appear here</span>}
        </span>
      </button>
      <div className="message-actions">
        <button type="button" className="action speak" onClick={onSpeak} disabled={empty}>
          <span aria-hidden="true">🔊</span> Speak
        </button>
        <button
          type="button"
          className={`action${endingsOpen ? " pressed" : ""}`}
          onClick={onEndings}
          disabled={!canChangeEnding}
          aria-expanded={endingsOpen}
          aria-label="Word endings: other forms of the last word"
        >
          <span aria-hidden="true">+s</span> Endings
        </button>
        <button type="button" className="action" onClick={onDeleteWord} disabled={empty}>
          <span aria-hidden="true">⌫</span> Delete word
        </button>
        <button type="button" className="action" onClick={onClear} disabled={empty}>
          <span aria-hidden="true">✕</span> Clear
        </button>
      </div>
    </section>
  );
}

/** Other forms of the last word, shown in place of the "My voice" strip. */
export function EndingsBar({
  word,
  forms,
  onPick,
  onClose,
}: {
  word: string;
  forms: readonly WordForm[];
  onPick: (form: WordForm) => void;
  onClose: () => void;
}) {
  return (
    <div className="endings-bar" role="group" aria-label={`Other forms of ${word}`}>
      {forms.length === 0 ? (
        <p className="endings-none">"{word}" has no other endings.</p>
      ) : (
        forms.map((form) => (
          <button
            key={form.text}
            type="button"
            className="cell ending"
            onClick={() => onPick(form)}
          >
            <span className="label">{form.text}</span>
            <span className="ending-note" aria-hidden="true">
              {form.note}
            </span>
          </button>
        ))
      )}
      <button type="button" className="cell ending-close" onClick={onClose}>
        <span className="label">Keep "{word}"</span>
      </button>
    </div>
  );
}

// ── "My voice" strip ─────────────────────────────────────────────────────────

interface VoiceStripProps {
  phrases: readonly StripPhrase[];
  modeledId: string | null;
  showSymbols: boolean;
  onSelect: (phrase: StripPhrase) => void;
}

export function VoiceStrip({ phrases, modeledId, showSymbols, onSelect }: VoiceStripProps) {
  return (
    <nav className="voice-strip" aria-label="My voice">
      {phrases.map((phrase) => (
        <button
          key={phrase.id}
          type="button"
          className={`cell kind-social${modeledId === phrase.id ? " modeled" : ""}`}
          onClick={() => onSelect(phrase)}
        >
          {showSymbols && <Symbol hexcode={phrase.symbol} />}
          <span className="label">{phrase.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ── Word boards (home and topics) ────────────────────────────────────────────

interface BoardGridProps {
  view: BoardView;
  modeledId: string | null;
  showSymbols: boolean;
  editing: boolean;
  photoUrls: ReadonlyMap<string, string>;
  onSelect: (cell: ShownCell) => void;
  onEditCell: (cell: ShownCell) => void;
  onAddAt: (row: number, col: number) => void;
}

export function BoardGrid({
  view,
  modeledId,
  showSymbols,
  editing,
  photoUrls,
  onSelect,
  onEditCell,
  onAddAt,
}: BoardGridProps) {
  const taken = new Set(view.cells.map((c) => `${c.row},${c.col}`));
  const empties: { row: number; col: number }[] = [];
  if (editing) {
    for (let row = 0; row < view.rows; row++)
      for (let col = 0; col < view.cols; col++)
        if (!taken.has(`${row},${col}`)) empties.push({ row, col });
  }
  return (
    <div
      className={`grid board${editing ? " editing" : ""}`}
      role="group"
      aria-label={view.title}
      style={gridStyle(view.rows, view.cols)}
    >
      {view.cells.map((cell) => {
        if (cell.hidden && !editing) return null; // its place stays empty
        const photo = cell.photoId ? photoUrls.get(cell.photoId) : undefined;
        return (
          <button
            key={cell.id}
            type="button"
            className={`cell kind-${cell.kind}${modeledId === cell.id ? " modeled" : ""}${
              cell.hidden ? " is-hidden" : ""
            }${cell.added ? " is-added" : ""}`}
            style={place(cell.row, cell.col)}
            aria-label={
              editing
                ? cell.added
                  ? `Edit ${cell.label}`
                  : cell.hidden
                    ? `${cell.label}, hidden. Tap to show.`
                    : `${cell.label}. Tap to hide.`
                : undefined
            }
            onClick={() => (editing ? onEditCell(cell) : onSelect(cell))}
          >
            {showSymbols && (photo ? <Photo url={photo} /> : <Symbol hexcode={cell.symbol} />)}
            <span className="label">{cell.label}</span>
            {editing && cell.hidden && <span className="badge">hidden</span>}
          </button>
        );
      })}
      {empties.map(({ row, col }) => (
        <button
          key={`empty-${row}-${col}`}
          type="button"
          className="cell empty-slot"
          style={place(row, col)}
          aria-label={`Add a word here: row ${row + 1}, column ${col + 1}`}
          onClick={() => onAddAt(row, col)}
        >
          <span className="label" aria-hidden="true">
            +
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Topics page ──────────────────────────────────────────────────────────────

export function TopicIndex({
  folders,
  rows,
  cols,
  showSymbols,
  onOpen,
}: {
  folders: readonly Folder[];
  rows: number;
  cols: number;
  showSymbols: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid topics" role="group" aria-label="Topics" style={gridStyle(rows, cols)}>
      {folders.map((folder) => (
        <button
          key={folder.id}
          type="button"
          className="cell kind-nav folder"
          style={place(folder.row, folder.col)}
          onClick={() => onOpen(folder.id)}
        >
          {showSymbols && <Symbol hexcode={folder.symbol} />}
          <span className="label">{folder.title}</span>
        </button>
      ))}
    </div>
  );
}

// ── My sentences ─────────────────────────────────────────────────────────────

export function SentencesPage({
  saved,
  recent,
  currentText,
  editing,
  onSay,
  onSave,
  onRemove,
}: {
  saved: readonly SavedMessage[];
  recent: readonly string[];
  currentText: string;
  editing: boolean;
  onSay: (text: string) => void;
  onSave: () => void;
  onRemove: (id: string) => void;
}) {
  const alreadySaved = saved.some((m) => m.text === currentText);
  return (
    <div className="sentences">
      <section aria-labelledby="saved-title">
        <div className="sentences-head">
          <h2 id="saved-title">Saved</h2>
          <button
            type="button"
            className="cell kind-nav save-current"
            onClick={onSave}
            disabled={currentText.length === 0 || alreadySaved}
          >
            <span className="label">{alreadySaved ? "Message is saved" : "Save my message"}</span>
          </button>
        </div>
        {saved.length === 0 ? (
          <p className="sentences-empty">
            Build a message, then tap "Save my message" to keep it here.
          </p>
        ) : (
          <ul className="sentence-list">
            {saved.map((m) => (
              <li key={m.id}>
                <button type="button" className="cell sentence" onClick={() => onSay(m.text)}>
                  <span className="label">{m.text}</span>
                </button>
                {editing && (
                  <button
                    type="button"
                    className="remove"
                    onClick={() => onRemove(m.id)}
                    aria-label={`Remove saved sentence: ${m.text}`}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="recent-title">
        <h2 id="recent-title">Said today</h2>
        {recent.length === 0 ? (
          <p className="sentences-empty">Messages you speak appear here until the app closes.</p>
        ) : (
          <ul className="sentence-list">
            {recent.map((text, index) => (
              <li key={`${index}-${text}`}>
                <button type="button" className="cell sentence recent" onClick={() => onSay(text)}>
                  <span className="label">{text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Keyboard ─────────────────────────────────────────────────────────────────

interface KeyboardGridProps {
  keys: readonly Key[];
  modeledId: string | null;
  onKey: (key: Key) => void;
}

export function KeyboardGrid({ keys, modeledId, onKey }: KeyboardGridProps) {
  return (
    <div
      className="grid keyboard"
      role="group"
      aria-label="Keyboard"
      style={gridStyle(KEYBOARD_ROWS, KEYBOARD_COLS)}
    >
      {keys.map((key) => (
        <button
          key={key.id}
          type="button"
          className={`cell key key-${key.kind}${modeledId === key.id ? " modeled" : ""}`}
          style={place(key.row, key.col, key.colSpan)}
          aria-label={
            key.kind === "backspace" ? "Delete letter" : key.kind === "space" ? "Space" : key.label
          }
          onClick={() => onKey(key)}
        >
          <span className="label">{key.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Side rail: the same places on every page ─────────────────────────────────

export type View = "words" | "topics" | "keyboard" | "sentences" | { topic: string };

export const RAIL_ITEMS = [
  { id: "words", label: "Words", symbol: "1F4AC" },
  { id: "topics", label: "Topics", symbol: "1F5C2" },
  { id: "body", label: "My body", symbol: "1F9CD" },
  { id: "keyboard", label: "Keyboard", symbol: "2328" },
] as const;

export type RailId = (typeof RAIL_ITEMS)[number]["id"];

export function railIdFor(view: View): RailId | null {
  if (view === "words" || view === "topics" || view === "keyboard") return view;
  if (view === "sentences") return "topics";
  return view.topic === "body" ? "body" : "topics";
}

export function Rail({
  current,
  onGo,
  showSymbols,
  children,
}: {
  current: RailId | null;
  onGo: (id: RailId) => void;
  showSymbols: boolean;
  children?: ReactNode;
}) {
  return (
    <nav className="rail" aria-label="Pages">
      {RAIL_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`cell kind-nav${current === item.id ? " current" : ""}`}
          aria-current={current === item.id ? "page" : undefined}
          onClick={() => onGo(item.id)}
        >
          {showSymbols && <Symbol hexcode={item.symbol} />}
          <span className="label">{item.label}</span>
        </button>
      ))}
      <div className="rail-spacer" />
      {children}
    </nav>
  );
}

// ── Banners and fallback ─────────────────────────────────────────────────────

export function ModelingBanner({ onStop }: { onStop: () => void }) {
  return (
    <div className="modeling-banner" role="status">
      <strong>Modeling mode.</strong> Words you tap light up and speak but don't change the
      student's message.
      <button type="button" onClick={onStop}>
        Stop modeling
      </button>
    </div>
  );
}

export function EditBanner({ onDone }: { onDone: () => void }) {
  return (
    <div className="edit-banner" role="status">
      <strong>Editing words.</strong> Tap + to add a word in an empty place. Tap a word to hide or
      show it. Words never move.
      <button type="button" onClick={onDone}>
        Done editing
      </button>
    </div>
  );
}

/** Voice ladder, last step: if speech can't play, show the words large. */
export function SpeechFallback({ text, onClose }: { text: string; onClose: () => void }) {
  const close = (event: MouseEvent) => {
    event.stopPropagation();
    onClose();
  };
  return (
    <div className="speech-fallback" role="status" aria-live="assertive" onClick={close}>
      <p className="fallback-text">{text}</p>
      <p className="fallback-note">Speech isn't available on this device right now.</p>
      <button type="button" onClick={close}>
        Done
      </button>
    </div>
  );
}
