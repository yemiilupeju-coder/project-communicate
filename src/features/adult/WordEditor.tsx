import { useEffect, useMemo, useRef, useState } from "react";
import type { WordKindName } from "../../core/profile";
import { MAX_LABEL, MAX_SPOKEN } from "../../core/profile";
import { preparePhoto } from "../../shared/image";
import { SYMBOL_NAMES } from "../communicator/topicSymbols";
import { symbolUrl } from "../communicator/vocabulary";

export interface WordDraft {
  label: string;
  spoken: string;
  kind: WordKindName;
  symbol: string | null;
  /** Existing photo id, or a newly chosen photo. */
  photoId: string | null;
  newPhoto: Blob | null;
}

const KIND_OPTIONS: { value: WordKindName; label: string }[] = [
  { value: "noun", label: "Person, place or thing" },
  { value: "verb", label: "Action" },
  { value: "describer", label: "Describing word" },
  { value: "pronoun", label: "Pronoun (I, you, they…)" },
  { value: "question", label: "Question word" },
  { value: "social", label: "Social phrase" },
  { value: "little", label: "Little word (the, and…)" },
];

interface WordEditorProps {
  heading: string;
  initial: WordDraft;
  photoUrl: string | null;
  onSave: (draft: WordDraft) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

/** Add or change one word the student's team added. */
export function WordEditor({
  heading,
  initial,
  photoUrl,
  onSave,
  onDelete,
  onCancel,
}: WordEditorProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<WordDraft>(initial);
  const [query, setQuery] = useState("");
  const [picture, setPicture] = useState<"none" | "symbol" | "photo">(
    initial.photoId ? "photo" : initial.symbol ? "symbol" : "none",
  );
  const [preview, setPreview] = useState<string | null>(photoUrl);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  useEffect(() => {
    if (!draft.newPhoto) return;
    const url = URL.createObjectURL(draft.newPhoto);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.newPhoto]);

  const matches = useMemo(() => {
    const q = (query || draft.label).trim().toLowerCase();
    const all = Object.entries(SYMBOL_NAMES);
    const found = q ? all.filter(([, name]) => name.toLowerCase().includes(q)) : all;
    return found.slice(0, 48);
  }, [query, draft.label]);

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await preparePhoto(file);
      setDraft((d) => ({ ...d, newPhoto: blob, symbol: null }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "This photo couldn't be used.");
    }
  };

  const save = () => {
    if (draft.label.trim().length === 0) {
      setError("Type the word as it should appear on the button.");
      return;
    }
    onSave({
      ...draft,
      symbol: picture === "symbol" ? draft.symbol : null,
      photoId: picture === "photo" ? draft.photoId : null,
      newPhoto: picture === "photo" ? draft.newPhoto : null,
    });
  };

  return (
    <dialog
      ref={dialog}
      className="word-editor adult-menu"
      aria-labelledby="word-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <header>
        <h2 id="word-editor-title">{heading}</h2>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </header>
      <section>
        <label className="field">
          Word on the button
          <input
            type="text"
            value={draft.label}
            maxLength={MAX_LABEL}
            autoFocus
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </label>
        <label className="field">
          What it says (leave empty to say the word)
          <input
            type="text"
            value={draft.spoken}
            maxLength={MAX_SPOKEN}
            onChange={(e) => setDraft({ ...draft, spoken: e.target.value })}
          />
        </label>
        <label className="field">
          Type of word (sets the colour and word endings)
          <select
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as WordKindName })}
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section>
        <h3>Picture</h3>
        <div className="segmented" role="radiogroup" aria-label="Picture">
          {(["none", "symbol", "photo"] as const).map((p) => (
            <label key={p}>
              <input
                type="radio"
                name="picture"
                checked={picture === p}
                onChange={() => setPicture(p)}
              />
              {p === "none" ? "Word only" : p === "symbol" ? "Symbol" : "Photo"}
            </label>
          ))}
        </div>
        {picture === "symbol" && (
          <>
            <label className="field">
              Find a symbol
              <input
                type="search"
                value={query}
                placeholder={draft.label || "e.g. dog"}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="symbol-picker">
              {matches.map(([hex, name]) => (
                <button
                  key={hex}
                  type="button"
                  className={draft.symbol === hex ? "chosen" : ""}
                  aria-pressed={draft.symbol === hex}
                  aria-label={name}
                  title={name}
                  onClick={() => setDraft({ ...draft, symbol: hex })}
                >
                  <img src={symbolUrl(hex)} alt="" />
                </button>
              ))}
              {matches.length === 0 && <p className="hint">No symbol matches. Try another word.</p>}
            </div>
          </>
        )}
        {picture === "photo" && (
          <>
            {preview && <img className="photo-preview" src={preview} alt="Chosen photo" />}
            <label className="field">
              Choose or take a photo
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void choosePhoto(e.target.files?.[0])}
              />
            </label>
            <p className="hint">
              Photos are made smaller and their location data is removed. They stay on this device.
              Only use photos of people with the family's and school's permission.
            </p>
          </>
        )}
      </section>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <footer className="editor-actions">
        {onDelete && (
          <button type="button" className="danger" onClick={onDelete}>
            Remove word
          </button>
        )}
        <button type="button" className="primary" onClick={save}>
          Save word
        </button>
      </footer>
    </dialog>
  );
}
