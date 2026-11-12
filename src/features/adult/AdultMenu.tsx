import { useEffect, useRef, useState } from "react";
import type { KeyboardLayout, Settings } from "../../core/settings";
import { listVoices, sortVoices, speak, speechAvailable, type VoiceInfo } from "../../core/speech";
import { isStandalone, readStorageStatus, requestPersistence } from "../../shared/environment";
import { ATTRIBUTIONS } from "../communicator/vocabulary";

interface AdultMenuProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  modeling: boolean;
  onModeling: (on: boolean) => void;
  applyUpdate: (() => void) | null;
  settingsSaved: boolean;
  onClose: () => void;
}

type Persist = "unknown" | "yes" | "no" | "unsupported";

/**
 * The adult menu: modeling, voice and display settings, device readiness.
 * Everything here changes how the app looks or sounds on this device; nothing
 * here moves a word on the student's board.
 */
export function AdultMenu({
  settings,
  onChange,
  modeling,
  onModeling,
  applyUpdate,
  settingsSaved,
  onClose,
}: AdultMenuProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [persist, setPersist] = useState<Persist>("unknown");
  const [voiceTest, setVoiceTest] = useState<string>("");

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    void listVoices().then((found) => setVoices(sortVoices(found)));
    void readStorageStatus().then((status) =>
      setPersist(
        !status.apiAvailable || status.persisted === null
          ? "unsupported"
          : status.persisted
            ? "yes"
            : "no",
      ),
    );
  }, []);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  const askPersist = async () => {
    const granted = await requestPersistence();
    setPersist(granted === null ? "unsupported" : granted ? "yes" : "no");
  };

  const testVoice = async () => {
    setVoiceTest("Speaking…");
    const result = await speak("Hello. This is my voice.", {
      voiceURI: settings.voiceURI,
      rate: settings.rate,
    });
    setVoiceTest(
      result === "started"
        ? "Voice works."
        : result === "unavailable"
          ? "This browser has no speech. Words will be shown large instead."
          : "The voice didn't start. Try another voice, or check the device volume.",
    );
  };

  return (
    <dialog
      ref={dialog}
      className="adult-menu"
      aria-labelledby="adult-menu-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="adult-menu-title">Adult menu</h2>
        <button type="button" className="close" onClick={onClose}>
          Back to talking
        </button>
      </header>

      {applyUpdate && (
        <section className="notice">
          <p>
            <strong>A new version is ready.</strong> Apply it when the student isn't in the middle
            of talking. The board and words stay the same.
          </p>
          <button type="button" onClick={applyUpdate}>
            Update now
          </button>
        </section>
      )}

      <section>
        <h3>Model language</h3>
        <p className="hint">
          Point to words on the student's board while you talk. In modeling mode your taps light up
          and speak, but they don't change the student's message.
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={modeling}
            onChange={(event) => onModeling(event.target.checked)}
          />
          Modeling mode
        </label>
      </section>

      <section>
        <h3>Voice</h3>
        {!speechAvailable() && (
          <p className="warn">This browser can't speak. Words will be shown in large text.</p>
        )}
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.speakOnSelect}
            onChange={(event) => set("speakOnSelect", event.target.checked)}
          />
          Say each word when it's tapped
        </label>
        <label className="field">
          Voice
          <select
            value={settings.voiceURI ?? ""}
            onChange={(event) => set("voiceURI", event.target.value || null)}
          >
            <option value="">Device default</option>
            {voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name} ({voice.lang}){voice.localService ? "" : " · needs internet"}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Speed: {settings.rate.toFixed(1)}×
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.1}
            value={settings.rate}
            onChange={(event) => set("rate", Number(event.target.value))}
          />
        </label>
        <button type="button" onClick={() => void testVoice()}>
          Test voice
        </button>
        <span className="status" role="status">
          {voiceTest}
        </span>
        <p className="hint">
          Choose a voice the student likes and that sounds right for them. Voices marked "needs
          internet" won't work offline.
        </p>
      </section>

      <section>
        <h3>Display and touch</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.showSymbols}
            onChange={(event) => set("showSymbols", event.target.checked)}
          />
          Show symbols with words
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.highContrast}
            onChange={(event) => set("highContrast", event.target.checked)}
          />
          High contrast
        </label>
        <label className="field">
          Keyboard layout
          <select
            value={settings.keyboardLayout}
            onChange={(event) => set("keyboardLayout", event.target.value as KeyboardLayout)}
          >
            <option value="qwerty">QWERTY (like a computer)</option>
            <option value="abc">ABC (alphabetical)</option>
          </select>
        </label>
        <label className="field">
          Ignore a repeat tap of the same button within: {settings.repeatGuardMs} ms
          <input
            type="range"
            min={0}
            max={2000}
            step={50}
            value={settings.repeatGuardMs}
            onChange={(event) => set("repeatGuardMs", Number(event.target.value))}
          />
        </label>
      </section>

      <section>
        <h3>This device</h3>
        <ul className="readiness">
          <li>
            Installed to home screen: <strong>{isStandalone() ? "yes" : "no"}</strong>
            {!isStandalone() && (
              <span className="hint">
                {" "}
                — On iPad: Share → Add to Home Screen. On Chromebook or Android: the install icon in
                the address bar, or menu → Install. Installing keeps the app's data safer.
              </span>
            )}
          </li>
          <li>
            Storage protected from clean-up:{" "}
            <strong>
              {persist === "yes"
                ? "yes"
                : persist === "no"
                  ? "not yet"
                  : persist === "unsupported"
                    ? "not supported here"
                    : "checking…"}
            </strong>{" "}
            {persist === "no" && (
              <button type="button" onClick={() => void askPersist()}>
                Ask the browser
              </button>
            )}
          </li>
          <li>
            Settings saved on this device: <strong>{settingsSaved ? "yes" : "no"}</strong>
            {!settingsSaved && <span className="hint"> — private browsing may block saving.</span>}
          </li>
          <li>
            Works offline:{" "}
            <strong>{navigator.serviceWorker?.controller ? "yes" : "after reload"}</strong>
          </li>
        </ul>
      </section>

      <section>
        <h3>Credits</h3>
        <ul className="credits">
          {ATTRIBUTIONS.map((item) => (
            <li key={item.work}>
              {item.work} — {item.by}.{" "}
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.license}
              </a>
            </li>
          ))}
        </ul>
        <p className="hint">
          Version {__BUILD_ID__}. No student information leaves this device in this release.
        </p>
      </section>
    </dialog>
  );
}
