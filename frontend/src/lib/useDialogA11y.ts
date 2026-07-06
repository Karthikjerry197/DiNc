'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared dialog accessibility behaviour (M35C) — the ONE implementation every
 * modal uses. Attach the returned ref to the dialog element (the node with
 * role="dialog").
 *
 * Provides, while `open`:
 *   - Escape closes the dialog (via `onClose`, which callers guard while saving)
 *   - Initial focus moves into the dialog (first focusable element)
 *   - Tab / Shift+Tab focus is trapped inside the dialog
 *   - Focus returns to the triggering element on close/unmount
 *
 * Layout/markup is unchanged — dialogs keep their existing structure.
 */
export function useDialogA11y(
  open: boolean,
  onClose: () => void,
): RefObject<HTMLDivElement> {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the effect on each render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const maybeDialog = dialogRef.current;
    if (!maybeDialog) return;
    const dialog: HTMLDivElement = maybeDialog;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Initial focus: the first focusable control that is not the close button,
    // falling back to the first focusable, then the dialog itself.
    const focusables = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    const initial =
      focusables().find((el) => !el.classList.contains('modal-close')) ??
      focusables()[0];
    if (initial) initial.focus();
    else {
      dialog.tabIndex = -1;
      dialog.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    // Capture phase so the trap wins over page-level key handlers.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [open]);

  return dialogRef;
}
