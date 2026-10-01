import { useState } from "react";

export interface NoteEditorProps {
  initialText: string;
  aiDrafted?: boolean;
  onSave: (text: string) => void;
}

export function NoteEditor({ initialText, aiDrafted, onSave }: NoteEditorProps) {
  const [text, setText] = useState(initialText);
  return (
    <div className="space-y-2">
      {aiDrafted && (
        <span className="inline-block rounded-full bg-[var(--pf-primary)]/10 px-2 py-0.5 text-xs text-[var(--pf-primary)]">
          AI draft
        </span>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="w-full rounded-lg border border-[var(--pf-muted)]/20 bg-[var(--pf-surface)] p-3 text-sm"
      />
      <button
        type="button"
        onClick={() => onSave(text)}
        className="rounded-lg bg-[var(--pf-primary)] px-4 py-2 text-sm font-medium text-[var(--pf-surface)]"
      >
        Save note
      </button>
    </div>
  );
}
