'use client';

import {
  NODE_WIDTH,
  SVG_OFFSET,
  SVG_SIZE,
  V_GAP,
} from '@/ui/ui2/canvasLayout';

type PanelShape = { canvasChildIds: string[] };

export function ConnectorsSvg({
  panels,
  positions,
  measure,
}: {
  panels: Record<string, PanelShape>;
  positions: Record<string, { x: number; y: number }>;
  measure: (panelId: string) => number;
}) {
  const segments: string[] = [];

  for (const id of Object.keys(panels)) {
    const p = panels[id];
    if (!p?.canvasChildIds.length) continue;

    const pos = positions[id];
    if (!pos) continue;

    const pCX = pos.x + NODE_WIDTH / 2 + SVG_OFFSET;
    const pBot = pos.y + measure(id) + SVG_OFFSET;
    const midY = pBot + V_GAP * 0.44;

    const firstChildId = p.canvasChildIds[0];
    if (!firstChildId) continue;
    const firstPos = positions[firstChildId];
    if (!firstPos) continue;
    const cTopY = firstPos.y + SVG_OFFSET;

    const childCenters = p.canvasChildIds.map(cid => {
      const c = positions[cid];
      return c ? c.x + NODE_WIDTH / 2 + SVG_OFFSET : pCX;
    });

    segments.push(`M${pCX} ${pBot}L${pCX} ${midY}`);

    if (p.canvasChildIds.length === 1) {
      segments.push(`M${pCX} ${midY}L${childCenters[0]!} ${cTopY}`);
    } else {
      segments.push(
        `M${childCenters[0]!} ${midY}L${childCenters[childCenters.length - 1]!} ${midY}`,
      );
      for (const cx of childCenters) {
        segments.push(`M${cx} ${midY}L${cx} ${cTopY}`);
      }
    }
  }

  return (
    <svg
      width={SVG_SIZE}
      height={SVG_SIZE}
      className="pointer-events-none absolute"
      style={{ left: -SVG_OFFSET, top: -SVG_OFFSET }}
    >
      {segments.map((d, i) => (
        <path
          // eslint-disable-next-line react/no-array-index-key -- stable geometry batch
          key={i}
          d={d}
          stroke="#f5c542"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
