'use client';

import { useEffect } from 'react';

/**
 * Opts the current route into the fixed, non-scrolling workspace shell.
 *
 * A migrated page calls this once; it applies the dormant
 * `.shell-content--workspace` modifier (Part D of the M27 implementation
 * contract) to the shared content region for the page's lifetime and reverts it
 * on unmount, so legacy `.page` routes keep their scrolling behavior untouched.
 *
 * This is the single opt-in mechanism every future page migration reuses — no
 * page hand-rolls its own shell wiring.
 *
 * @param enabled Pass `false` to skip opting in (e.g. an unauthorized fallback
 * that still renders a legacy `.page`). Defaults to true.
 */
export function useWorkspaceShell(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;
    const content = document.querySelector('.shell-content');
    if (!content) return;
    content.classList.add('shell-content--workspace');
    return () => {
      content.classList.remove('shell-content--workspace');
    };
  }, [enabled]);
}
