import { useEffect, useRef, type CSSProperties } from "react";

/** Messages the game sends to the page that embeds it. */
export type HereALittleEvent =
  | { source: "here-a-little"; type: "ready" }
  | { source: "here-a-little"; type: "round-start"; scene: string }
  | { source: "here-a-little"; type: "stroke"; step: number; followed: boolean }
  | {
      source: "here-a-little";
      type: "round-complete";
      scene: string;
      perfect: boolean;
      followed: number;
    };

type Props = {
  /** Where the game's index.html is served. Defaults to /games/here-a-little/ under the app's base path. */
  src?: string;
  title?: string;
  /** Optional: react to game events (e.g. celebrate a perfect round). */
  onEvent?: (event: HereALittleEvent) => void;
  className?: string;
  style?: CSSProperties;
};

/**
 * "Here a Little, There a Little": embeds the self-contained game page in an iframe.
 * The game makes no network requests and imports nothing from the communicator,
 * so it works offline once the service worker has cached it.
 */
export default function HereALittleGame({
  src = `${import.meta.env.BASE_URL}games/here-a-little/`,
  title = "Here a Little, There a Little",
  onEvent,
  className,
  style,
}: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!onEvent) return;
    const handle = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return; // only our iframe
      const data = e.data as HereALittleEvent | undefined;
      if (data && data.source === "here-a-little") onEvent(data);
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [onEvent]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "4 / 3",
        minHeight: 360,
        maxHeight: "92vh",
        borderRadius: 24,
        overflow: "hidden",
        background: "#EEF5FF",
        ...style,
      }}
    >
      <iframe
        ref={frameRef}
        src={src}
        title={title}
        allow="autoplay; fullscreen"
        allowFullScreen
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
      />
    </div>
  );
}
