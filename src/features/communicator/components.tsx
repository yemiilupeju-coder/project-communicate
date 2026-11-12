import { Fragment, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { messageText, type Message } from "../../core/message";
import {
  HOME_COLS,
  HOME_ROWS,
  KEYBOARD_COLS,
  KEYBOARD_ROWS,
  symbolUrl,
  type Cell,
  type Key,
  type StripPhrase,
} from "./vocabulary";

function Symbol({ hexcode }: { hexcode: string | undefined }) {
  if (!hexcode) return null;
  // Decorative: the word itself is the accessible name of the button.
  return (
    <img className="symbol" src={symbolUrl(hexcode)} alt="" aria-hidden="true" draggable={false} />
  );
}

const place = (row: number, col: number, colSpan = 1): CSSProperties => ({
  gridRow: row + 1,
  gridColumn: `${col + 1} / span ${colSpan}`,
});

// ── Message bar ──────────────────────────────────────────────────────────────

interface MessageBarProps {
  message: Message;
  onSpeak: () => void;
  onDeleteWord: () => void;
  onClear: () => void;
}

export function MessageBar({ message, onSpeak, onDeleteWord, onClear }: MessageBarProps) {
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

// ── Word board ───────────────────────────────────────────────────────────────

interface WordGridProps {
  cells: readonly Cell[];
  modeledId: string | null;
  showSymbols: boolean;
  onSelect: (cell: Cell) => void;
}

export function WordGrid({ cells, modeledId, showSymbols, onSelect }: WordGridProps) {
  return (
    <div
      className="grid board"
      role="group"
      aria-label="Core words"
      style={{
        gridTemplateColumns: `repeat(${HOME_COLS}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${HOME_ROWS}, minmax(0, 1fr))`,
      }}
    >
      {cells.map((cell) => (
        <button
          key={cell.id}
          type="button"
          className={`cell kind-${cell.kind}${modeledId === cell.id ? " modeled" : ""}`}
          style={place(cell.row, cell.col)}
          onClick={() => onSelect(cell)}
        >
          {showSymbols && <Symbol hexcode={cell.symbol} />}
          <span className="label">{cell.label}</span>
        </button>
      ))}
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
      style={{
        gridTemplateColumns: `repeat(${KEYBOARD_COLS}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${KEYBOARD_ROWS}, minmax(0, 1fr))`,
      }}
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

// ── Side rail: the same two places on every screen ───────────────────────────

export type View = "words" | "keyboard";

interface RailProps {
  view: View;
  onView: (view: View) => void;
  showSymbols: boolean;
  children?: ReactNode;
}

export function Rail({ view, onView, showSymbols, children }: RailProps) {
  return (
    <nav className="rail" aria-label="Pages">
      <button
        type="button"
        className={`cell kind-nav${view === "words" ? " current" : ""}`}
        aria-pressed={view === "words"}
        onClick={() => onView("words")}
      >
        {showSymbols && <Symbol hexcode="1F4AC" />}
        <span className="label">Words</span>
      </button>
      <button
        type="button"
        className={`cell kind-nav${view === "keyboard" ? " current" : ""}`}
        aria-pressed={view === "keyboard"}
        onClick={() => onView("keyboard")}
      >
        {showSymbols && <Symbol hexcode="2328" />}
        <span className="label">Keyboard</span>
      </button>
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
