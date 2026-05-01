import { NODE_WIDTH } from '@/ui/ui2/canvasLayout';

/** Axis-aligned intersection; null if no overlap. */
export function intersectRects(
  a: DOMRectReadOnly,
  b: DOMRectReadOnly,
): { left: number; top: number; right: number; bottom: number } | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (left >= right || top >= bottom) return null;
  return { left, top, right, bottom };
}

export type DominantPanelPick = {
  panelId: string;
  wrapRect: DOMRectReadOnly;
  intersectionRect: DOMRectReadOnly;
  focalClientX: number;
  focalClientY: number;
  /** Vertical position down the linear flip-wrap (0..1) for mapping to canvas node height. */
  fracY: number;
};

/**
 * Chain panel whose flip-wrap has the largest visible intersection with the linear scrollport.
 */
export function pickDominantVisiblePanel(
  chainIds: string[],
  flipWrapRefs: Map<string, HTMLDivElement>,
  scrollRect: DOMRectReadOnly,
  fallbackPanelId: string,
): DominantPanelPick {
  let bestArea = -1;
  let bestId = fallbackPanelId;
  let bestWrap: DOMRectReadOnly | null = null;
  let bestInter: { left: number; top: number; right: number; bottom: number } | null =
    null;

  for (const id of chainIds) {
    const wrap = flipWrapRefs.get(id);
    if (!wrap) continue;
    const wrapRect = wrap.getBoundingClientRect();
    const inter = intersectRects(wrapRect, scrollRect);
    const area = inter ? (inter.right - inter.left) * (inter.bottom - inter.top) : 0;
    if (area > bestArea) {
      bestArea = area;
      bestId = id;
      bestWrap = wrapRect;
      bestInter = inter;
    }
  }

  const wrap = flipWrapRefs.get(bestId);
  const wrapRect = wrap?.getBoundingClientRect() ?? bestWrap;
  if (!wrapRect) {
    const fracY = 0.5;
    return {
      panelId: bestId,
      wrapRect: new DOMRect(0, 0, 0, 0),
      intersectionRect: new DOMRect(0, 0, 0, 0),
      focalClientX: scrollRect.left + scrollRect.width / 2,
      focalClientY: scrollRect.top + scrollRect.height / 2,
      fracY,
    };
  }

  let interRect: DOMRect;
  if (bestInter) {
    interRect = new DOMRect(
      bestInter.left,
      bestInter.top,
      bestInter.right - bestInter.left,
      bestInter.bottom - bestInter.top,
    );
  } else {
    const inter = intersectRects(wrapRect, scrollRect);
    if (inter) {
      interRect = new DOMRect(
        inter.left,
        inter.top,
        inter.right - inter.left,
        inter.bottom - inter.top,
      );
    } else {
      interRect = new DOMRect(
        wrapRect.left,
        wrapRect.top,
        wrapRect.width,
        wrapRect.height,
      );
    }
  }

  const focalClientX = interRect.left + interRect.width / 2;
  const focalClientY = interRect.top + interRect.height / 2;
  const denom = Math.max(wrapRect.height, 1);
  const fracY = Math.min(
    1,
    Math.max(0, (focalClientY - wrapRect.top) / denom),
  );

  return {
    panelId: bestId,
    wrapRect,
    intersectionRect: interRect,
    focalClientX,
    focalClientY,
    fracY,
  };
}

export type CollapseViewportAnchor = {
  panelId: string;
  focalClientX: number;
  focalClientY: number;
  fracY: number;
};

/** Pan (viewport-local / onWheel convention) so world (wx, wy) lands on client focal at zoom z. */
export function panToPlaceWorldOnScreen(
  viewportEl: HTMLElement,
  focalClientX: number,
  focalClientY: number,
  wx: number,
  wy: number,
  zoom: number,
): { x: number; y: number } {
  const rect = viewportEl.getBoundingClientRect();
  const anchorMx = focalClientX - rect.left;
  const anchorMy = focalClientY - rect.top;
  return {
    x: anchorMx - wx * zoom,
    y: anchorMy - wy * zoom,
  };
}

export function worldPointForPanelFracY(
  panelId: string,
  fracY: number,
  positions: Record<string, { x: number; y: number }>,
  panelHeight: number,
): { wx: number; wy: number } | null {
  const pos = positions[panelId];
  if (!pos) return null;
  const wx = pos.x + NODE_WIDTH / 2;
  const wy = pos.y + fracY * panelHeight;
  return { wx, wy };
}
