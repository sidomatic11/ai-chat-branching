/**
 * FLIP helpers for canvas ↔ linear mode. Screen-space rects (getBoundingClientRect).
 * Do not attach transitions to the pan/zoom world layer — only to these targets during mode tweens.
 *
 * Play phase uses Web Animations API when available (often smoother compositing than CSS transitions).
 */

export type FlipOpts = {
  durationMs: number;
  easing: string;
};

export const DEFAULT_FLIP_OPTS: FlipOpts = {
  durationMs: 280,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};

/** Map `to` layout box to look like `from` (invert step). Origin top-left. Uses translate3d for a stable layer. */
export function invertRectTransform(
  from: DOMRectReadOnly,
  to: DOMRectReadOnly,
): string {
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / Math.max(to.width, 0.5);
  const sy = from.height / Math.max(to.height, 0.5);
  return `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`;
}

const IDENTITY_3D = 'translate3d(0px, 0px, 0px) scale(1, 1)';

function clearFlipStyles(el: HTMLElement) {
  el.style.transition = '';
  el.style.transform = '';
  el.style.transformOrigin = '';
  el.style.willChange = '';
}

/**
 * Element is already laid out at its final (linear or canvas) box; animate from appearing as `fromRect`.
 * Runs inside `useLayoutEffect` so geometry is committed before the first paint of this subtree.
 */
export function runFlipToNatural(
  el: HTMLElement,
  fromRect: DOMRectReadOnly,
  opts: FlipOpts = DEFAULT_FLIP_OPTS,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise(resolve => {
    let settled = false;
    let anim: Animation | null = null;
    let raf = 0;

    const settle = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      cancelAnimationFrame(raf);
      if (anim) {
        try {
          anim.cancel();
        } catch {
          /* ignore */
        }
        anim = null;
      }
      clearFlipStyles(el);
      resolve();
    };

    if (signal?.aborted) {
      settle();
      return;
    }

    const toRect = el.getBoundingClientRect();

    const onAbort = () => settle();
    signal?.addEventListener('abort', onAbort);

    el.style.transformOrigin = '0 0';
    el.style.willChange = 'transform';

    const runCssFallback = () => {
      el.style.transition = 'none';
      el.style.transform = invertRectTransform(fromRect, toRect);
      void el.offsetHeight;
      raf = requestAnimationFrame(() => {
        if (settled) return;
        el.style.transition = `transform ${opts.durationMs}ms ${opts.easing}`;
        el.style.transform = IDENTITY_3D;
        el.addEventListener(
          'transitionend',
          e => {
            if (e.propertyName === 'transform') settle();
          },
          { once: true },
        );
        window.setTimeout(settle, opts.durationMs + 120);
      });
    };

    if (typeof el.animate === 'function') {
      try {
        anim = el.animate(
          [{ transform: invertRectTransform(fromRect, toRect) }, { transform: IDENTITY_3D }],
          {
            duration: opts.durationMs,
            easing: opts.easing,
            fill: 'forwards',
          },
        );
        anim.addEventListener('finish', () => settle(), { once: true });
        window.setTimeout(settle, opts.durationMs + 120);
      } catch {
        runCssFallback();
      }
    } else {
      runCssFallback();
    }
  });
}
