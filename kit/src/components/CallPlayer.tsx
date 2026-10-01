import { useState } from "react";

export interface CallTurn {
  speaker: "caller" | "system";
  text: string;
}

export interface CallPlayerProps {
  turns: CallTurn[];
}

export function CallPlayer({ turns }: CallPlayerProps) {
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);

  function speakFrom(i: number) {
    if (i >= turns.length) {
      setPlaying(false);
      setIndex(-1);
      return;
    }
    setIndex(i);
    try {
      const utterance = new SpeechSynthesisUtterance(turns[i].text);
      utterance.onend = () => speakFrom(i + 1);
      utterance.onerror = () => speakFrom(i + 1);
      window.speechSynthesis.speak(utterance);
    } catch {
      window.setTimeout(() => speakFrom(i + 1), 1200);
    }
  }

  function play() {
    setPlaying(true);
    speakFrom(0);
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={play}
        disabled={playing}
        className="rounded-lg bg-[var(--pf-primary)] px-4 py-2 text-sm font-medium text-[var(--pf-surface)] disabled:opacity-50"
      >
        {playing ? "Playing call…" : "Play call"}
      </button>
      <div className="space-y-2 text-sm">
        {turns.map((turn, i) => (
          <p key={i} className={i === index ? "font-medium text-[var(--pf-primary)]" : "text-[var(--pf-ink)]"}>
            <span className="text-[var(--pf-muted)]">{turn.speaker === "caller" ? "Caller: " : "System: "}</span>
            {turn.text}
          </p>
        ))}
      </div>
    </div>
  );
}
