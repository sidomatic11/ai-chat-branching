export const NODE_WIDTH = 255;
export const H_GAP = 44;
export const V_GAP = 80;
export const SVG_OFFSET = 1000;
export const SVG_SIZE = 9000;
export const GRID_SIZE = 20;

export type CanvasPanelBase = {
  id: string;
  canvasChildIds: string[];
};

export function subtreeWidth(
  panelId: string,
  panels: Record<string, CanvasPanelBase>,
  measure: (panelId: string) => number,
): number {
  const p = panels[panelId];
  if (!p || !p.canvasChildIds.length) return NODE_WIDTH;
  let total = 0;
  for (const cid of p.canvasChildIds) {
    total += subtreeWidth(cid, panels, measure);
  }
  return total + H_GAP * (p.canvasChildIds.length - 1);
}

export function layoutSubtree(
  panelId: string,
  x: number,
  y: number,
  panels: Record<string, CanvasPanelBase>,
  measure: (panelId: string) => number,
  positions: Record<string, { x: number; y: number }>,
): void {
  const p = panels[panelId];
  if (!p) return;
  positions[panelId] = { x, y };
  if (!p.canvasChildIds.length) return;

  const childY = y + measure(panelId) + V_GAP;
  let cx = x;
  for (const cid of p.canvasChildIds) {
    layoutSubtree(cid, cx, childY, panels, measure, positions);
    cx += subtreeWidth(cid, panels, measure) + H_GAP;
  }
}

export function layoutAllPanels(
  rootPanelId: string,
  panels: Record<string, CanvasPanelBase>,
  measure: (panelId: string) => number,
  rootX: number,
  rootY: number,
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  layoutSubtree(rootPanelId, rootX, rootY, panels, measure, positions);
  return positions;
}
