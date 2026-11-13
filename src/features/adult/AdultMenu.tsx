import { useEffect, useRef, useState } from "react";
import { describeStatus, type LicenceStatus } from "../../core/licence";
import { MAX_NAME, type Profile } from "../../core/profile";
import type { KeyboardLayout, Settings } from "../../core/settings";
import { listVoices, sortVoices, speak, speechAvailable, type VoiceInfo } from "../../core/speech";
import { isStandalone, readStorageStatus, requestPersistence } from "../../shared/environment";
import { ATTRIBUTIONS } from "../communicator/vocabulary";

export interface StudentActions {
  switchTo: (id: string) => void;
  add: (name: string) => string | null;
  rename: (name: string) => void;
  remove: () => void;
  editWords: () => void;
  setPin: () => void;
  removePin: () => void;
  downloadBackup: () => Promise<string>;
  restoreBackup: (file: File) => Promise<string>;
  activateLicence: (code: string) => Promise<string>;
  importLicence: (file: File) => Promise<string>;
  removeLicence: () => void;
}

export interface LicenceView {
  status: LicenceStatus;
  /** Team tools (edit words, backups) for the current student. */
  teamTools: boolean;
  canAddStudent: boolean;
  keyReady: boolean;
  demo: boolean;
}

interface AdultMenuProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  modeling: boolean;
  onModeling: (on: boolean) => void;
  applyUpdate: (() => void) | null;
  settingsSaved: boolean;
  profile: Profile;
  profiles: readonly Profile[];
  pinSet: boolean;
  storageDurable: boolean;
  licence: LicenceView;
  actions: StudentActions;
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
  profile,
  profiles,
  pinSet,
  storageDurable,
  licence,
  actions,
  onClose,
}: AdultMenuProps) {
  const [newName, setNewName] = useState("");
  const [rename, setRename] = useState(profile.name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [backupStatus, setBackupStatus] = useState("");
  const [studentStatus, setStudentStatus] = useState("");
  const [code, setCode] = useState("");
  const [licenceMessage, setLicenceMessage] = useState("");
  const needsLicence = (
    <p className="hint">
      Family (free, for home use) covers one student on this device. Schools need a classroom,
      school or district licence, which adds more students.
    </p>
  );
  useEffect(() => {
    setRename(profile.name);
    setConfirmRemove(false);
  }, [profile.id, profile.name]);
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
        <h3>Student</h3>
        <label className="field">
          This device is talking for
          <select value={profile.id} onChange={(e) => actions.switchTo(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label className="field grow">
            Name or nickname
            <input
              type="text"
              value={rename}
              maxLength={MAX_NAME}
              onChange={(e) => setRename(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={rename.trim() === profile.name || rename.trim() === ""}
            onClick={() => actions.rename(rename)}
          >
            Rename
          </button>
        </div>
        <p className="hint">
          A first name or nickname is enough. Each student has their own words, voice and settings.
        </p>
        <div className="row">
          <label className="field grow">
            Add another student
            <input
              type="text"
              value={newName}
              maxLength={MAX_NAME}
              placeholder="Name or nickname"
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={newName.trim() === "" || !licence.canAddStudent}
            onClick={() => {
              const problem = actions.add(newName);
              setStudentStatus(problem ?? "");
              if (!problem) setNewName("");
            }}
          >
            Add
          </button>
        </div>
        {!licence.canAddStudent && needsLicence}
        {studentStatus && (
          <p className="status" role="status">
            {studentStatus}
          </p>
        )}
        {profiles.length > 1 &&
          (confirmRemove ? (
            <div className="row">
              <button type="button" className="danger" onClick={actions.remove}>
                Yes, remove {profile.name} and their words
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)}>
                Keep
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)}>
              Remove {profile.name} from this device…
            </button>
          ))}
      </section>

      <section>
        <h3>Words</h3>
        <p className="hint">
          Add this student's own words (names, family foods, favourite things) in empty places, or
          hide words they don't need yet. Words never move, so the student's motor memory stays the
          same.
        </p>
        <button type="button" onClick={actions.editWords} disabled={!licence.teamTools}>
          Edit words
        </button>
        {!licence.teamTools && (
          <p className="hint">
            {profile.name}'s words all still work. Editing words for a second student on this device
            needs a school or district licence.
          </p>
        )}
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.returnToWords}
            onChange={(event) => set("returnToWords", event.target.checked)}
          />
          After a word on a topic page, go back to Words
        </label>
      </section>

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
            Words and settings saved on this device:{" "}
            <strong>{storageDurable && settingsSaved ? "yes" : "only until the app closes"}</strong>
            {!(storageDurable && settingsSaved) && (
              <span className="hint">
                {" "}
                — private browsing may block saving. The built-in words always work.
              </span>
            )}
          </li>
          <li>
            Works offline:{" "}
            <strong>{navigator.serviceWorker?.controller ? "yes" : "after reload"}</strong>
          </li>
        </ul>
      </section>

      {!licence.demo && (
        <section>
          <h3>Licence</h3>
          <p>{describeStatus(licence.status)}</p>
          {licence.keyReady ? (
            <>
              <div className="row">
                <label className="field grow">
                  Licence code from GiftedTech
                  <input
                    type="text"
                    value={code}
                    placeholder="GT-XXXX-XXXX"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={code.trim().length < 8}
                  onClick={() =>
                    void actions.activateLicence(code).then((m) => {
                      setLicenceMessage(m);
                      if (m.startsWith("Licensed")) setCode("");
                    })
                  }
                >
                  Activate
                </button>
              </div>
              <div className="row">
                <label className="file-button">
                  Load a licence file…
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void actions.importLicence(file).then(setLicenceMessage);
                    }}
                  />
                </label>
                {licence.status.kind !== "family" && (
                  <button type="button" onClick={actions.removeLicence}>
                    Remove licence
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="hint">Licences aren't set up in this version yet.</p>
          )}
          <p className="status" role="status">
            {licenceMessage}
          </p>
          <p className="hint">
            A licence never limits what a student can say. Every word, page and voice works on every
            device, licensed or not.
          </p>
        </section>
      )}

      <section>
        <h3>Adult PIN</h3>
        <p className="hint">
          {pinSet
            ? "The adult menu asks for the PIN after the 3-second hold."
            : "Add a PIN so only adults can open this menu. It isn't stored, only a scrambled check of it."}
        </p>
        <div className="row">
          <button type="button" onClick={actions.setPin}>
            {pinSet ? "Change PIN" : "Set a PIN"}
          </button>
          {pinSet && (
            <button type="button" onClick={actions.removePin}>
              Remove PIN
            </button>
          )}
        </div>
      </section>

      <section>
        <h3>Backup</h3>
        <p className="hint">
          Download a backup after adding words, and keep it somewhere safe and private. It holds{" "}
          {profile.name}'s name, words and photos. If this device is cleared or replaced, restore it
          here.
        </p>
        <div className="row">
          <button
            type="button"
            disabled={!licence.teamTools}
            onClick={() => void actions.downloadBackup().then(setBackupStatus)}
          >
            Download backup
          </button>
          <label className="file-button">
            Restore from a backup…
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void actions.restoreBackup(file).then(setBackupStatus);
              }}
            />
          </label>
        </div>
        <p className="status" role="status">
          {backupStatus}
        </p>
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
          Version {__BUILD_ID__}. Nothing about the student leaves this device.
        </p>
      </section>
    </dialog>
  );
}
