import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export const HOLD_MS = 3000;

/**
 * Opens the adult menu only after a deliberate 3-second hold (decision D6),
 * so a student can't open it by accident. Works with touch, mouse, and
 * keyboard/switch (hold Enter or Space). A PIN is added in release 2.
 */
export function AdultHoldButton({ onOpen }: { onOpen: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  const start = () => {
    if (timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onOpen();
    }, HOLD_MS);
  };

  useEffect(() => cancel, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
      event.preventDefault();
      start();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") cancel();
  };

  return (
    <button
      type="button"
      className={`adult-hold${holding ? " holding" : ""}`}
      aria-label="Adult menu. Press and hold for 3 seconds."
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="adult-hold-ring" aria-hidden="true" />
      <span className="adult-hold-label">{holding ? "Keep holding…" : "Adults: hold"}</span>
    </button>
  );
}
