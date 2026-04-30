import type { CanvasPanelState } from '@/ui/ui2/canvasTypes';

/**
 * Ordered panel ids from canvas root down to `panelId` (inclusive).
 * Walks `canvasParentId` upward then reverses.
 */
export function getCanvasChainFromRoot(
  panels: Record<string, CanvasPanelState>,
  panelId: string,
): string[] {
  const rev: string[] = [];
  let cur: string | null = panelId;
  const seen = new Set<string>();

  while (cur && panels[cur] && !seen.has(cur)) {
    seen.add(cur);
    rev.push(cur);
    cur = panels[cur]!.canvasParentId;
  }

  rev.reverse();
  return rev;
}

/**
 * Full linear chain for expand view: root → … → `panelId`, then continue down the
 * canvas tree to a leaf by always taking the **last** `canvasChildIds` entry at each
 * fork (same “latest branch” convention as elsewhere in UI2).
 */
export function getExpandedLinearChainIds(
  panels: Record<string, CanvasPanelState>,
  panelId: string,
): string[] {
  const prefix = getCanvasChainFromRoot(panels, panelId);
  const suffix: string[] = [];
  let cursor = panelId;
  const seen = new Set(prefix);

  while (true) {
    const p = panels[cursor];
    if (!p || p.canvasChildIds.length === 0) break;
    const next = p.canvasChildIds[p.canvasChildIds.length - 1]!;
    if (seen.has(next)) break;
    seen.add(next);
    suffix.push(next);
    cursor = next;
  }

  return [...prefix, ...suffix];
}
