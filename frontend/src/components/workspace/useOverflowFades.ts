'use client';

import { useEffect, useRef } from 'react';

/**
 * Horizontal-overflow affordance (M39.1). Attach the returned ref to a
 * horizontally-scrollable element; the hook toggles `has-fade-left` /
 * `has-fade-right` on that element's parent (the non-scrolling "host") based on
 * the current scroll position:
 *   - at the start → only the right fade,
 *   - in the middle → both,
 *   - at the end → only the left fade,
 *   - not scrollable → neither.
 *
 * The host renders the fades as CSS gradients, so this hook only flips classes.
 * Reads are batched into a single rAF and the scroll listener is passive, so it
 * never blocks scrolling.
 */
export function useOverflowFades<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;

    let raf = 0;
    const EPS = 1;

    const apply = () => {
      raf = 0;
      // Batch all layout reads before any writes to avoid thrash.
      const { scrollWidth, clientWidth, offsetWidth, scrollLeft } = el;
      const max = scrollWidth - clientWidth;
      const scrollable = max > EPS;
      // Width of the scroller's own vertical scrollbar, so the right fade can be
      // inset clear of it when one is present (0 for the overflow-y:hidden grids).
      const scrollbar = Math.max(0, offsetWidth - clientWidth);
      host.classList.toggle('has-fade-left', scrollable && scrollLeft > EPS);
      host.classList.toggle('has-fade-right', scrollable && scrollLeft < max - EPS);
      host.style.setProperty('--ws-fade-inset', `${scrollbar}px`);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    apply();
    el.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      host.classList.remove('has-fade-left', 'has-fade-right');
      host.style.removeProperty('--ws-fade-inset');
    };
  }, []);

  return ref;
}
