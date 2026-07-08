'use client';

import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface DocumentationPreviewProps {
  note: string;
  mode: 'auto' | 'manual';
  disabled?: boolean;
  noteSaving?: boolean;
  onChange: (value: string) => void;
  /** Switches note back to auto-generated mode. Called after user confirms. */
  onReset: () => void;
}

/**
 * Documentation preview panel for the Consultation Workspace.
 *
 * Displays the generated (or manually edited) consultation note with:
 * - Mode badge: AUTO (green) or EDITED (amber)
 * - Copy to clipboard button (one click, no manual selection)
 * - Regenerate button: warns before overwriting manual edits
 * - Editable textarea: switches mode to EDITED on first keystroke
 * - Auto-save status indicator
 *
 * Reusable across all consultation entry points that use DocumentationEngine.
 */
export default function DocumentationPreview({
  note,
  mode,
  disabled,
  noteSaving,
  onChange,
  onReset,
}: DocumentationPreviewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = note;
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for environments where clipboard API is unavailable.
      if (textareaRef.current) {
        textareaRef.current.select();
        document.execCommand('copy');
        window.getSelection()?.removeAllRanges();
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleRegenerate() {
    if (mode === 'manual') {
      const confirmed = window.confirm(
        'Replace your edited note with the auto-generated version?\n\nYour manual edits will be lost.',
      );
      if (!confirmed) return;
    }
    onReset();
  }

  return (
    <div className="cw-note-section">
      <div className="cw-note-toolbar">
        <div className="cw-note-toolbar-left">
          <span
            className={`cw-note-badge ${mode === 'manual' ? 'cw-note-badge-manual' : ''}`}
            title={mode === 'auto' ? 'Note is auto-generated from form data' : 'Note has been manually edited'}
          >
            {mode === 'auto' ? 'AUTO' : 'EDITED'}
          </span>
          {noteSaving && (
            <span className="cw-note-saving">saving draft…</span>
          )}
        </div>
        <div className="cw-note-toolbar-actions">
          <button
            type="button"
            className="cw-note-tool-btn"
            title="Regenerate note from current form data"
            onClick={handleRegenerate}
            disabled={disabled}
          >
            ↺ Regenerate
          </button>
          <button
            type="button"
            className={`cw-note-tool-btn cw-note-copy-btn${copied ? ' cw-note-copied' : ''}`}
            title="Copy clinical record to clipboard"
            onClick={handleCopy}
            disabled={disabled || !note.trim()}
          >
            {copied ? <><Check size={12} aria-hidden="true" /> Copied</> : <><Copy size={12} aria-hidden="true" /> Copy Note</>}
          </button>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        className="cw-note-area"
        value={note}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Note will auto-generate as you fill in the form…"
        spellCheck={false}
      />
    </div>
  );
}
