import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_MESSAGE,
  addWord,
  backspace,
  clearMessage,
  deleteLastWord,
  messageText,
  typeCharacter,
  type Message,
} from "../core/message";
import { RepeatGuard } from "../core/repeatGuard";
import { loadSettings, saveSettings, type Settings } from "../core/settings";
import { speak, speechAvailable, stopSpeaking } from "../core/speech";
import {
  KeyboardGrid,
  MessageBar,
  ModelingBanner,
  Rail,
  SpeechFallback,
  VoiceStrip,
  WordGrid,
  type View,
} from "../features/communicator/components";
import {
  HOME_BOARD,
  KEYBOARD_ABC,
  KEYBOARD_QWERTY,
  VOICE_STRIP,
  type Cell,
  type Key,
  type StripPhrase,
} from "../features/communicator/vocabulary";
import { AdultHoldButton } from "../features/adult/AdultHoldButton";
import { AdultMenu } from "../features/adult/AdultMenu";
import { registerServiceWorker } from "../shared/registerServiceWorker";

const MODEL_HIGHLIGHT_MS = 900;

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings(safeStorage()));
  const [settingsSaved, setSettingsSaved] = useState(true);
  const [message, setMessage] = useState<Message>(EMPTY_MESSAGE);
  const [view, setView] = useState<View>("words");
  const [modeling, setModeling] = useState(false);
  const [modeledId, setModeledId] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);

  const guard = useRef(new RepeatGuard(settings.repeatGuardMs));
  const highlightTimer = useRef<number | null>(null);

  useEffect(() => {
    guard.current.setWindow(settings.repeatGuardMs);
    setSettingsSaved(saveSettings(safeStorage(), settings));
    document.documentElement.classList.toggle("high-contrast", settings.highContrast);
  }, [settings]);

  useEffect(() => {
    // Updates wait for an adult to apply them from the menu (never mid-sentence).
    registerServiceWorker((apply) => setApplyUpdate(() => apply));
  }, []);

  /** Speak; if the device can't, show the words large instead (voice ladder, last step). */
  const say = useCallback(
    async (text: string, showIfSilent: boolean) => {
      const result = await speak(text, { voiceURI: settings.voiceURI, rate: settings.rate });
      if (result !== "started" && showIfSilent) setFallbackText(text);
    },
    [settings.voiceURI, settings.rate],
  );

  const highlight = (id: string) => {
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    setModeledId(id);
    highlightTimer.current = window.setTimeout(() => setModeledId(null), MODEL_HIGHLIGHT_MS);
  };

  const allowed = (id: string) => guard.current.allow(id, performance.now());

  const onCell = (cell: Cell) => {
    if (!allowed(cell.id)) return;
    const text = cell.spoken ?? cell.label;
    if (modeling) {
      highlight(cell.id);
      void say(text, false);
      return;
    }
    setMessage((current) => addWord(current, text, "board"));
    if (settings.speakOnSelect) void say(text, false);
  };

  const onPhrase = (phrase: StripPhrase) => {
    if (!allowed(phrase.id)) return;
    // "My voice" phrases speak at once and don't disturb a sentence in progress.
    if (modeling) highlight(phrase.id);
    void say(phrase.label, !modeling);
  };

  const onKey = (key: Key) => {
    if (!allowed(key.id)) return;
    if (modeling) {
      highlight(key.id);
      return;
    }
    if (key.kind === "backspace") {
      setMessage(backspace);
      return;
    }
    const character = key.kind === "space" ? " " : (key.value ?? "");
    if (key.kind === "space" && settings.speakOnSelect && message.draft.length > 0) {
      void say(message.draft, false);
    }
    setMessage((current) => typeCharacter(current, character));
  };

  const speakMessage = () => {
    if (!allowed("speak-message")) return;
    const text = messageText(message);
    if (text.length === 0) return;
    void say(text, true);
  };

  const closeMenu = () => setMenuOpen(false);

  const keys = settings.keyboardLayout === "abc" ? KEYBOARD_ABC : KEYBOARD_QWERTY;

  return (
    <div className={`app${modeling ? " is-modeling" : ""}`}>
      {modeling && <ModelingBanner onStop={() => setModeling(false)} />}
      {!speechAvailable() && (
        <p className="no-speech" role="status">
          This browser can't speak. Tap Speak to show your message in large text.
        </p>
      )}
      <MessageBar
        message={message}
        onSpeak={speakMessage}
        onDeleteWord={() => setMessage(deleteLastWord)}
        onClear={() => {
          stopSpeaking();
          setMessage(clearMessage());
        }}
      />
      <VoiceStrip
        phrases={VOICE_STRIP}
        modeledId={modeledId}
        showSymbols={settings.showSymbols}
        onSelect={onPhrase}
      />
      <main className="workspace">
        <div className="page" aria-live="off">
          {view === "words" ? (
            <WordGrid
              cells={HOME_BOARD}
              modeledId={modeledId}
              showSymbols={settings.showSymbols}
              onSelect={onCell}
            />
          ) : (
            <KeyboardGrid keys={keys} modeledId={modeledId} onKey={onKey} />
          )}
        </div>
        <Rail view={view} onView={setView} showSymbols={settings.showSymbols}>
          <AdultHoldButton onOpen={() => setMenuOpen(true)} />
        </Rail>
      </main>
      {fallbackText !== null && (
        <SpeechFallback text={fallbackText} onClose={() => setFallbackText(null)} />
      )}
      {menuOpen && (
        <AdultMenu
          settings={settings}
          onChange={setSettings}
          modeling={modeling}
          onModeling={setModeling}
          applyUpdate={applyUpdate}
          settingsSaved={settingsSaved}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
