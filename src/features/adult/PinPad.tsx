import { useEffect, useRef, useState } from "react";

interface PinPadProps {
  title: string;
  /** Shown under the title, e.g. "Enter the adult PIN". */
  prompt: string;
  /** Resolves to an error message, or null when accepted. */
  onSubmit: (pin: string) => Promise<string | null>;
  onCancel: () => void;
  lockedUntil?: number;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "enter"] as const;

export function PinPad({ title, prompt, onSubmit, onCancel, lockedUntil = 0 }: PinPadProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  useEffect(() => {
    if (lockedUntil <= now) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil, now]);

  const locked = lockedUntil > now;
  const wait = Math.ceil((lockedUntil - now) / 1000);

  const submit = async () => {
    if (busy || locked) return;
    setBusy(true);
    const message = await onSubmit(pin);
    setBusy(false);
    if (message) {
      setError(message);
      setPin("");
    }
  };

  const press = (key: (typeof KEYS)[number]) => {
    if (locked || busy) return;
    setError(null);
    if (key === "clear") setPin("");
    else if (key === "enter") void submit();
    else if (pin.length < 8) setPin(pin + key);
  };

  return (
    <dialog
      ref={dialog}
      className="pin-pad"
      aria-labelledby="pin-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onKeyDown={(event) => {
        if (/^\d$/.test(event.key)) press(event.key as (typeof KEYS)[number]);
        else if (event.key === "Backspace") setPin((p) => p.slice(0, -1));
        else if (event.key === "Enter") {
          event.preventDefault();
          void submit();
        }
      }}
    >
      <h2 id="pin-title">{title}</h2>
      <p>{prompt}</p>
      <div className="pin-dots" aria-live="polite" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={i < pin.length ? "dot filled" : "dot"} />
        ))}
      </div>
      <p className="pin-error" role="alert">
        {locked ? `Too many tries. Try again in ${wait} s.` : error}
      </p>
      <div className="pin-keys">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            disabled={locked || busy || (key === "enter" && pin.length < 4)}
            aria-label={key === "clear" ? "Clear" : key === "enter" ? "OK" : key}
          >
            {key === "clear" ? "Clear" : key === "enter" ? "OK" : key}
          </button>
        ))}
      </div>
      <button type="button" className="pin-cancel" onClick={onCancel}>
        Cancel
      </button>
    </dialog>
  );
}
