import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  EMPTY_MESSAGE,
  addWord,
  backspace,
  clearMessage,
  deleteLastWord,
  lastWord,
  messageText,
  replaceLastWord,
  typeCharacter,
  type Message,
  type TokenKind,
} from "../core/message";
import { wordForms, type FormKind, type WordForm } from "../core/morphology";
import {
  addWordAt,
  newId,
  removeAddedWord,
  removeSavedMessage,
  saveMessage,
  toggleHidden,
  updateAddedWord,
  type AddedWord,
} from "../core/profile";
import { RepeatGuard } from "../core/repeatGuard";
import { speak, speechAvailable, stopSpeaking } from "../core/speech";
import {
  BoardGrid,
  EditBanner,
  EndingsBar,
  KeyboardGrid,
  MessageBar,
  ModelingBanner,
  Rail,
  SentencesPage,
  SpeechFallback,
  TopicIndex,
  VoiceStrip,
  railIdFor,
  type RailId,
  type View,
} from "../features/communicator/components";
import {
  FOLDERS,
  HOME_ID,
  SENTENCES_ID,
  TOPIC_INDEX_COLS,
  TOPIC_INDEX_ROWS,
  boardView,
  builtInPlaces,
  type ShownCell,
} from "../features/communicator/boards";
import {
  KEYBOARD_ABC,
  KEYBOARD_QWERTY,
  VOICE_STRIP,
  type Key,
  type StripPhrase,
  type WordKind,
} from "../features/communicator/vocabulary";
import { AdultHoldButton } from "../features/adult/AdultHoldButton";
import { AdultMenu } from "../features/adult/AdultMenu";
import { PinPad } from "../features/adult/PinPad";
import { WordEditor, type WordDraft } from "../features/adult/WordEditor";
import { registerServiceWorker } from "../shared/registerServiceWorker";
import { useStudentData } from "./useStudentData";

const MODEL_HIGHLIGHT_MS = 900;
const ADULT_IDLE_MS = 10 * 60 * 1000;
const RECENT_MAX = 20;

const tokenKind = (kind: WordKind): TokenKind =>
  kind === "verb" || kind === "noun" || kind === "describer" || kind === "pronoun" ? kind : "other";

function formKind(kind: TokenKind | undefined, source: string): FormKind | null {
  if (kind === "other" || source === "strip" || source === "saved") return null;
  return kind ?? "unknown";
}

type PinMode = null | "unlock" | "new" | { confirm: string };

interface EditorState {
  boardId: string;
  row: number;
  col: number;
  word: AddedWord | null;
}

export function App() {
  const data = useStudentData();
  const { profile, settings } = data;

  const [message, setMessage] = useState<Message>(EMPTY_MESSAGE);
  const [view, setView] = useState<View>("words");
  const [modeling, setModeling] = useState(false);
  const [modeledId, setModeledId] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinMode, setPinMode] = useState<PinMode>(null);
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [endingsOpen, setEndingsOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());

  const guard = useRef(new RepeatGuard(settings.repeatGuardMs));
  const highlightTimer = useRef<number | null>(null);
  const lastAdultActivity = useRef(Date.now());

  useEffect(() => {
    guard.current.setWindow(settings.repeatGuardMs);
    document.documentElement.classList.toggle("high-contrast", settings.highContrast);
  }, [settings]);

  useEffect(() => {
    // Updates wait for an adult to apply them from the menu (never mid-sentence).
    registerServiceWorker((apply) => setApplyUpdate(() => apply));
  }, []);

  // Each student starts fresh: their own message and "said today" list.
  const profileId = profile?.id ?? null;
  useEffect(() => {
    setMessage(EMPTY_MESSAGE);
    setRecent([]);
    setView("words");
    setEndingsOpen(false);
  }, [profileId]);

  // Load this student's photos as object URLs.
  const photoIds = useMemo(
    () => (profile?.added ?? []).map((w) => w.photoId).filter((id): id is string => !!id),
    [profile?.added],
  );
  useEffect(() => {
    const store = data.store;
    if (!store) return;
    let alive = true;
    const urls = new Map<string, string>();
    void Promise.all(
      photoIds.map(async (id) => {
        const blob = await store.getMedia(id).catch(() => null);
        if (blob) urls.set(id, URL.createObjectURL(blob));
      }),
    ).then(() => {
      if (alive) setPhotoUrls(urls);
      else urls.forEach((u) => URL.revokeObjectURL(u));
    });
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [data.store, photoIds]);

  // Adult sessions close after 10 minutes without a touch (D6).
  useEffect(() => {
    if (!menuOpen && !editing) return;
    const touch = () => {
      lastAdultActivity.current = Date.now();
    };
    touch();
    window.addEventListener("pointerdown", touch, true);
    window.addEventListener("keydown", touch, true);
    const timer = window.setInterval(() => {
      if (Date.now() - lastAdultActivity.current > ADULT_IDLE_MS) {
        setMenuOpen(false);
        setEditing(false);
        setEditor(null);
      }
    }, 15_000);
    return () => {
      window.removeEventListener("pointerdown", touch, true);
      window.removeEventListener("keydown", touch, true);
      window.clearInterval(timer);
    };
  }, [menuOpen, editing]);

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

  // ── Student actions ──

  const onCell = (cell: ShownCell) => {
    if (!allowed(cell.id)) return;
    if (modeling) {
      highlight(cell.id);
      void say(cell.spoken, false);
      return;
    }
    setEndingsOpen(false);
    setMessage((current) => addWord(current, cell.spoken, "board", tokenKind(cell.kind)));
    if (settings.speakOnSelect) void say(cell.spoken, false);
    if (settings.returnToWords && typeof view === "object") setView("words");
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
    setEndingsOpen(false);
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

  const remember = (text: string) =>
    setRecent((list) => (list[0] === text ? list : [text, ...list].slice(0, RECENT_MAX)));

  const speakMessage = () => {
    if (!allowed("speak-message")) return;
    const text = messageText(message);
    if (text.length === 0) return;
    remember(text);
    void say(text, true);
  };

  const last = lastWord(message);
  const lastKind = last ? formKind(last.kind, last.source) : null;
  const forms: WordForm[] = last && lastKind ? wordForms(last.text, lastKind) : [];

  const pickForm = (form: WordForm) => {
    if (!allowed(`form-${form.text}`)) return;
    setMessage((current) => replaceLastWord(current, form.text));
    setEndingsOpen(false);
    if (settings.speakOnSelect) void say(form.text, false);
  };

  const go = (id: RailId) => {
    setEndingsOpen(false);
    if (id === "body") setView({ topic: "body" });
    else setView(id);
  };

  // ── Adult actions ──

  const openAdult = () => {
    if (data.pinSet) setPinMode("unlock");
    else setMenuOpen(true);
  };

  const editCell = (cell: ShownCell) => {
    if (!profile) return;
    if (cell.added) {
      const word = profile.added.find((w) => w.id === cell.id) ?? null;
      if (word) setEditor({ boardId: word.boardId, row: word.row, col: word.col, word });
      return;
    }
    data.updateProfile((p) => toggleHidden(p, cell.id));
  };

  const boardIdFor = (v: View): string | null =>
    v === "words" ? HOME_ID : typeof v === "object" ? v.topic : null;

  const saveWord = async (state: EditorState, draft: WordDraft) => {
    const store = data.store;
    if (!profile || !store) return;
    let photoId = draft.photoId;
    if (draft.newPhoto) {
      photoId = newId("ph");
      await store.putMedia(photoId, profile.id, draft.newPhoto);
    }
    const oldPhoto = state.word?.photoId;
    if (oldPhoto && oldPhoto !== photoId) void store.deleteMedia(oldPhoto).catch(() => undefined);
    const fields = {
      label: draft.label,
      kind: draft.kind,
      ...(draft.spoken.trim() ? { spoken: draft.spoken } : {}),
      ...(draft.symbol ? { symbol: draft.symbol } : {}),
      ...(photoId ? { photoId } : {}),
    };
    if (state.word) {
      const id = state.word.id;
      data.updateProfile((p) => updateAddedWord(p, id, fields));
    } else {
      data.updateProfile((p) =>
        addWordAt(
          p,
          { boardId: state.boardId, row: state.row, col: state.col, ...fields },
          builtInPlaces(state.boardId),
        ),
      );
    }
    setEditor(null);
  };

  const deleteWord = (word: AddedWord) => {
    if (word.photoId) void data.store?.deleteMedia(word.photoId).catch(() => undefined);
    data.updateProfile((p) => removeAddedWord(p, word.id));
    setEditor(null);
  };

  // ── Render ──

  const keys = settings.keyboardLayout === "abc" ? KEYBOARD_ABC : KEYBOARD_QWERTY;
  const currentBoardId = boardIdFor(view);
  const board = currentBoardId ? boardView(currentBoardId, profile) : null;
  const text = messageText(message);

  let page: ReactNode;
  if (view === "keyboard") {
    page = <KeyboardGrid keys={keys} modeledId={modeledId} onKey={onKey} />;
  } else if (view === "topics") {
    page = (
      <TopicIndex
        folders={FOLDERS}
        rows={TOPIC_INDEX_ROWS}
        cols={TOPIC_INDEX_COLS}
        showSymbols={settings.showSymbols}
        onOpen={(id) => setView(id === SENTENCES_ID ? "sentences" : { topic: id })}
      />
    );
  } else if (view === "sentences") {
    page = (
      <SentencesPage
        saved={profile?.saved ?? []}
        recent={recent}
        currentText={text}
        editing={editing}
        onSay={(t) => {
          if (!allowed(`say-${t}`)) return;
          remember(t);
          void say(t, true);
        }}
        onSave={() => data.updateProfile((p) => saveMessage(p, text))}
        onRemove={(id) => data.updateProfile((p) => removeSavedMessage(p, id))}
      />
    );
  } else if (board) {
    page = (
      <BoardGrid
        view={board}
        modeledId={modeledId}
        showSymbols={settings.showSymbols}
        editing={editing}
        photoUrls={photoUrls}
        onSelect={onCell}
        onEditCell={editCell}
        onAddAt={(row, col) => setEditor({ boardId: board.id, row, col, word: null })}
      />
    );
  }

  const pageTitle =
    view === "keyboard"
      ? "Keyboard"
      : view === "topics"
        ? "Topics"
        : view === "sentences"
          ? "My sentences"
          : (board?.title ?? "");

  return (
    <div className={`app${modeling ? " is-modeling" : ""}${editing ? " is-editing" : ""}`}>
      {modeling && <ModelingBanner onStop={() => setModeling(false)} />}
      {editing && <EditBanner onDone={() => setEditing(false)} />}
      {!speechAvailable() && (
        <p className="no-speech" role="status">
          This browser can't speak. Tap Speak to show your message in large text.
        </p>
      )}
      <MessageBar
        message={message}
        canChangeEnding={!modeling && forms.length > 0}
        endingsOpen={endingsOpen}
        onSpeak={speakMessage}
        onEndings={() => setEndingsOpen((open) => !open)}
        onDeleteWord={() => {
          setEndingsOpen(false);
          setMessage(deleteLastWord);
        }}
        onClear={() => {
          stopSpeaking();
          setEndingsOpen(false);
          setMessage(clearMessage());
        }}
      />
      {endingsOpen && last ? (
        <EndingsBar
          word={last.text}
          forms={forms}
          onPick={pickForm}
          onClose={() => setEndingsOpen(false)}
        />
      ) : (
        <VoiceStrip
          phrases={VOICE_STRIP}
          modeledId={modeledId}
          showSymbols={settings.showSymbols}
          onSelect={onPhrase}
        />
      )}
      <main className="workspace">
        <div className="page" aria-live="off">
          {/* Every page has the same header, so grids sit in the same place on every page. */}
          <h1 className="page-title" aria-live="polite">
            {pageTitle}
          </h1>
          <div className="page-body">{page}</div>
        </div>
        <Rail current={railIdFor(view)} onGo={go} showSymbols={settings.showSymbols}>
          <AdultHoldButton onOpen={openAdult} />
        </Rail>
      </main>
      {fallbackText !== null && (
        <SpeechFallback text={fallbackText} onClose={() => setFallbackText(null)} />
      )}
      {pinMode === "unlock" && (
        <PinPad
          title="Adult menu"
          prompt="Enter the adult PIN."
          lockedUntil={data.lockedUntil}
          onCancel={() => setPinMode(null)}
          onSubmit={async (pin) => {
            const error = await data.tryPin(pin);
            if (!error) {
              setPinMode(null);
              setMenuOpen(true);
            }
            return error;
          }}
        />
      )}
      {pinMode === "new" && (
        <PinPad
          title="Set adult PIN"
          prompt="Choose a PIN of 4 to 8 digits."
          onCancel={() => {
            setPinMode(null);
            setMenuOpen(true);
          }}
          onSubmit={async (pin) => {
            setPinMode({ confirm: pin });
            return null;
          }}
        />
      )}
      {typeof pinMode === "object" && pinMode !== null && (
        <PinPad
          key="confirm"
          title="Set adult PIN"
          prompt="Enter the same PIN again."
          onCancel={() => {
            setPinMode(null);
            setMenuOpen(true);
          }}
          onSubmit={async (pin) => {
            if (pin !== pinMode.confirm) return "The PINs didn't match. Try again.";
            await data.savePin(pin);
            setPinMode(null);
            setMenuOpen(true);
            return null;
          }}
        />
      )}
      {menuOpen && profile && (
        <AdultMenu
          settings={settings}
          onChange={data.setSettings}
          modeling={modeling}
          onModeling={setModeling}
          applyUpdate={applyUpdate}
          settingsSaved={data.saved}
          profile={profile}
          profiles={data.profiles}
          pinSet={data.pinSet}
          storageDurable={data.durable}
          actions={{
            switchTo: data.switchTo,
            add: data.addProfile,
            rename: (name) => data.updateProfile((p) => ({ ...p, name: name.trim() || p.name })),
            remove: () => void data.removeProfile(),
            editWords: () => {
              setMenuOpen(false);
              setModeling(false);
              setEditing(true);
              if (view === "keyboard") setView("words");
            },
            setPin: () => {
              setMenuOpen(false);
              setPinMode("new");
            },
            removePin: () => void data.clearPin(),
            downloadBackup: data.downloadBackup,
            restoreBackup: data.restore,
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {editor && profile && (
        <WordEditor
          heading={editor.word ? `Edit "${editor.word.label}"` : "Add a word"}
          initial={{
            label: editor.word?.label ?? "",
            spoken: editor.word?.spoken ?? "",
            kind: editor.word?.kind ?? "noun",
            symbol: editor.word?.symbol ?? null,
            photoId: editor.word?.photoId ?? null,
            newPhoto: null,
          }}
          photoUrl={editor.word?.photoId ? (photoUrls.get(editor.word.photoId) ?? null) : null}
          onCancel={() => setEditor(null)}
          onSave={(draft) => void saveWord(editor, draft)}
          {...(editor.word ? { onDelete: () => deleteWord(editor.word as AddedWord) } : {})}
        />
      )}
    </div>
  );
}
