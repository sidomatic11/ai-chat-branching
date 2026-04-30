'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ROOT_ID, useConversationStore } from '@/store/conversationStore';
import { ConnectorsSvg } from '@/ui/ui2/ConnectorsSvg';
import { GRID_SIZE, NODE_WIDTH, layoutAllPanels } from '@/ui/ui2/canvasLayout';
import type {
  CanvasPanelState,
  FrozenPanelState,
  LivePanelState,
} from '@/ui/ui2/canvasTypes';
import { rebuildCanvasFromGraph } from '@/ui/ui2/rebuildCanvasFromGraph';
import {
  computeLatestLeafFromUserHead,
  flattenFrozenThrough,
  flattenLivePanel,
  latestAssistantId,
} from '@/ui/ui2/graphPath';

export function BranchingCanvas() {
  const nodes = useConversationStore(s => s.nodes);
  const sendMessage = useConversationStore(s => s.sendMessage);
  const branchFromUserMessage = useConversationStore(s => s.branchFromUserMessage);
  const createParallelChildThread = useConversationStore(s => s.createParallelChildThread);
  const setActivePath = useConversationStore(s => s.setActivePath);
  const isStreaming = useConversationStore(s => s.isStreaming);

  const panelEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const [pan, setPan] = useState({ x: 50, y: 80 });
  const [zoom, setZoom] = useState(1);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const [drag, setDrag] = useState<{
    active: boolean;
    ox: number;
    oy: number;
  }>({ active: false, ox: 0, oy: 0 });

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const [{ panels, rootPanelId }, setCanvas] = useState(() =>
    rebuildCanvasFromGraph(useConversationStore.getState().nodes),
  );

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(
    {},
  );

  const nodeCount = useMemo(() => Object.keys(nodes).length, [nodes]);
  const prevNodeCountRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevNodeCountRef.current;
    prevNodeCountRef.current = nodeCount;
    if (nodeCount !== 1) return;
    if (prev !== null && prev > 1) {
      setCanvas(rebuildCanvasFromGraph(nodes));
      setPositions({});
    }
  }, [nodeCount, nodes]);

  const measure = useCallback((panelId: string) => {
    const el = panelEls.current.get(panelId);
    return el ? el.offsetHeight : 260;
  }, []);

  const panelBase = useMemo(() => {
    const out: Record<string, { id: string; canvasChildIds: string[] }> = {};
    for (const p of Object.values(panels)) {
      out[p.id] = { id: p.id, canvasChildIds: p.canvasChildIds };
    }
    return out;
  }, [panels]);

  const relayout = useCallback(() => {
    if (!rootPanelId || !panels[rootPanelId]) return;
    const pos = layoutAllPanels(
      rootPanelId,
      panelBase,
      measure,
      120,
      40,
    );
    setPositions(pos);
  }, [rootPanelId, panelBase, measure, panels]);

  useLayoutEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        relayout();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [relayout, nodes, panels, zoom, pan]);

  const applyTransform = useCallback(() => {
    return `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  }, [pan.x, pan.y, zoom]);

  const onWheel = useCallback((e: WheelEvent) => {
    // Miro-style:
    // - Two-finger scroll pans
    // - Zoom only on pinch (trackpad typically sets ctrlKey) or cmd+scroll
    e.preventDefault();

    const el = viewportRef.current;
    if (!el) return;

    const wantsZoom = e.ctrlKey || e.metaKey;
    if (wantsZoom) {
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const prevZ = zoomRef.current;
      const prevP = panRef.current;
      const newZ = Math.min(Math.max(prevZ * factor, 0.18), 3);

      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const wx = (mx - prevP.x) / prevZ;
      const wy = (my - prevP.y) / prevZ;

      const newP = {
        x: mx - wx * newZ,
        y: my - wy * newZ,
      };

      zoomRef.current = newZ;
      panRef.current = newP;
      setZoom(newZ);
      setPan(newP);
      return;
    }

    setPan(p => {
      const next = {
        x: p.x - e.deltaX,
        y: p.y - e.deltaY,
      };
      panRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    // Must be non-passive so preventDefault can block browser zoom on pinch.
    const onWheelNative = (e: WheelEvent) => onWheel(e);
    el.addEventListener('wheel', onWheelNative, { passive: false });

    // Safari gesture events (trackpad pinch) can zoom the page unless prevented.
    const onGesture = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', onGesture, { passive: false } as AddEventListenerOptions);
    el.addEventListener('gesturechange', onGesture, { passive: false } as AddEventListenerOptions);
    el.addEventListener('gestureend', onGesture, { passive: false } as AddEventListenerOptions);

    return () => {
      el.removeEventListener('wheel', onWheelNative as EventListener);
      el.removeEventListener('gesturestart', onGesture as EventListener);
      el.removeEventListener('gesturechange', onGesture as EventListener);
      el.removeEventListener('gestureend', onGesture as EventListener);
    };
  }, [onWheel]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.active) return;
      const next = { x: e.clientX - drag.ox, y: e.clientY - drag.oy };
      panRef.current = next;
      setPan(next);
    };
    const onUp = () => {
      setDrag(d => ({ ...d, active: false }));
      if (viewportRef.current) viewportRef.current.style.cursor = 'grab';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag.active, drag.ox, drag.oy]);

  const onCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[data-panel-node]')) return;
      const p = panRef.current;
      setDrag({ active: true, ox: e.clientX - p.x, oy: e.clientY - p.y });
      if (viewportRef.current) viewportRef.current.style.cursor = 'grabbing';
    },
    [],
  );

  const setPanelEl = useCallback((panelId: string, el: HTMLDivElement | null) => {
    if (el) panelEls.current.set(panelId, el);
    else panelEls.current.delete(panelId);
  }, []);

  const updateLivePanel = useCallback(
    (panelId: string, patch: Partial<LivePanelState>) => {
      setCanvas(s => {
        const p = s.panels[panelId];
        if (!p || p.kind !== 'live') return s;
        return {
          ...s,
          panels: {
            ...s.panels,
            [panelId]: { ...p, ...patch },
          },
        };
      });
    },
    [],
  );

  const handleUserBubbleClick = useCallback(
    (panelId: string, clickedUserId: string, flatIndex: number) => {
      const panel = panels[panelId];
      if (!panel || panel.kind !== 'live') return;
      if (panel.canvasChildIds.length > 0) return;
      if (isStreaming) return;

      const canBranch = flatIndex > 0 || panel.canvasParentId != null;
      if (!canBranch) return;

      if (flatIndex === 0 && panel.canvasParentId) {
        const head = panel.headUserId;
        if (!head) return;
        const parentGraphId = nodes[head]?.parentId ?? ROOT_ID;
        const created = createParallelChildThread(parentGraphId);
        if (!created) return;

        const newPanelId = uuidv4();
        const parentCanvasId = panel.canvasParentId;

        setCanvas(s => {
          const next = { ...s, panels: { ...s.panels } };
          const parentP = next.panels[parentCanvasId];
          if (!parentP) return s;
          next.panels[parentCanvasId] = {
            ...parentP,
            canvasChildIds: [...parentP.canvasChildIds, newPanelId],
          };
          next.panels[newPanelId] = {
            kind: 'live',
            id: newPanelId,
            headUserId: created.userId,
            tailLeafId: created.assistantId,
            attachParentId: parentGraphId,
            canvasParentId: parentCanvasId,
            canvasChildIds: [],
            threadLabel: 'branch',
          };
          return next;
        });
        return;
      }

      if (flatIndex > 0) {
        const res = branchFromUserMessage(clickedUserId);
        if (!res) return;

        const fresh = useConversationStore.getState().nodes;
        const rightTail =
          latestAssistantId(fresh, res.rightHeadUserId) ?? res.rightHeadUserId;
        const leftTail = computeLatestLeafFromUserHead(fresh, res.leftHeadUserId);

        const leftId = uuidv4();
        const rightId = uuidv4();

        setCanvas(s => {
          const next = { ...s, panels: { ...s.panels } };
          const old = next.panels[panelId];
          if (!old || old.kind !== 'live') return s;

          const frozen: FrozenPanelState = {
            kind: 'frozen',
            id: panelId,
            throughId: res.frozenThroughId,
            canvasParentId: old.canvasParentId,
            canvasChildIds: [leftId, rightId],
          };

          next.panels[panelId] = frozen;
          next.panels[leftId] = {
            kind: 'live',
            id: leftId,
            headUserId: res.leftHeadUserId,
            tailLeafId: leftTail,
            attachParentId: res.frozenThroughId,
            canvasParentId: panelId,
            canvasChildIds: [],
            threadLabel: 'original',
          };
          next.panels[rightId] = {
            kind: 'live',
            id: rightId,
            headUserId: res.rightHeadUserId,
            tailLeafId: rightTail,
            attachParentId: res.frozenThroughId,
            canvasParentId: panelId,
            canvasChildIds: [],
            threadLabel: 'branch',
          };
          return next;
        });
      }
    },
    [
      panels,
      isStreaming,
      nodes,
      createParallelChildThread,
      branchFromUserMessage,
    ],
  );

  const handleSend = useCallback(
    async (panel: LivePanelState, text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      if (!panel.headUserId) {
        const r = await sendMessage(trimmed, { parentId: panel.attachParentId });
        if (r) {
          updateLivePanel(panel.id, {
            headUserId: r.userId,
            tailLeafId: r.assistantId,
          });
          setActivePath(r.assistantId);
        }
        return;
      }

      const headNode = nodes[panel.headUserId];
      const isPlaceholder =
        headNode?.role === 'user' && headNode.content.trim() === '';

      const storeNodes = useConversationStore.getState().nodes;
      let tail =
        panel.tailLeafId ??
        computeLatestLeafFromUserHead(storeNodes, panel.headUserId);
      const tailNode = storeNodes[tail];
      if (tailNode?.role === 'user') {
        const a = latestAssistantId(storeNodes, tail);
        if (a) tail = a;
      }

      const r = await sendMessage(trimmed, {
        parentId: tail,
        existingUserId: isPlaceholder ? panel.headUserId : undefined,
      });

      if (r) {
        updateLivePanel(panel.id, {
          tailLeafId: r.assistantId,
        });
        setActivePath(r.assistantId);
      }
    },
    [isStreaming, sendMessage, setActivePath, updateLivePanel, nodes],
  );

  const patternX = pan.x % (GRID_SIZE * zoom);
  const patternY = pan.y % (GRID_SIZE * zoom);
  const patternSize = GRID_SIZE * zoom;

  return (
    <div
      ref={viewportRef}
      className="relative h-full min-h-0 w-full cursor-grab overflow-hidden bg-zinc-950"
      onMouseDown={onCanvasMouseDown}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <pattern
            id="ui2-dot-grid"
            x={patternX}
            y={patternY}
            width={patternSize}
            height={patternSize}
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1.2" cy="1.2" r="1" fill="rgba(255,255,255,0.12)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ui2-dot-grid)" />
      </svg>

      <div
        className="absolute left-0 top-0 origin-top-left will-change-transform"
        style={{ transform: applyTransform() }}
      >
        <ConnectorsSvg panels={panelBase} positions={positions} measure={measure} />

        {Object.values(panels).map(p => {
          const pos = positions[p.id] ?? { x: 0, y: 0 };
          if (p.kind === 'frozen') {
            return (
              <FrozenPanel
                key={p.id}
                panel={p}
                nodes={nodes}
                left={pos.x}
                top={pos.y}
                setPanelEl={setPanelEl}
              />
            );
          }
          return (
            <LivePanel
              key={p.id}
              panel={p}
              nodes={nodes}
              left={pos.x}
              top={pos.y}
              isStreaming={isStreaming}
              setPanelEl={setPanelEl}
              onSend={handleSend}
              onUserBubbleClick={handleUserBubbleClick}
              onFocusPanel={() => {
                const tail =
                  p.tailLeafId ??
                  (p.headUserId
                    ? computeLatestLeafFromUserHead(nodes, p.headUserId)
                    : null);
                if (tail) setActivePath(tail);
              }}
            />
          );
        })}
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-black/50 px-2 py-1 text-[11px] text-white/80 tabular-nums">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}

function ExpandNodeButton() {
  return (
    <button
      type="button"
      className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-200/80"
      aria-label="Expand content"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <span className="material-symbols-rounded text-[18px] leading-none" aria-hidden>
        expand_content
      </span>
    </button>
  );
}

function headerLabel(
  panel: LivePanelState | FrozenPanelState,
  frozen: boolean,
): string {
  if (frozen) return 'Branched';
  if (panel.kind === 'frozen') return 'Branched';
  const live = panel as LivePanelState;
  if (live.threadLabel === 'original') return 'Original thread';
  if (live.threadLabel === 'branch') return 'New branch';
  return 'AI Chat';
}

function FrozenPanel({
  panel,
  nodes,
  left,
  top,
  setPanelEl,
}: {
  panel: FrozenPanelState;
  nodes: Record<string, import('@/store/conversationStore').MessageNode>;
  left: number;
  top: number;
  setPanelEl: (id: string, el: HTMLDivElement | null) => void;
}) {
  const flat = flattenFrozenThrough(nodes, panel.throughId);

  return (
    <div
      data-panel-node
      ref={el => setPanelEl(panel.id, el)}
      className="absolute flex flex-col rounded-[14px] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
      style={{ left, top, width: NODE_WIDTH, zIndex: 1 }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-t-[14px] border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11.5px] font-semibold tracking-wide text-zinc-600">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
          <span className="truncate">{headerLabel(panel, true)}</span>
        </div>
        <ExpandNodeButton />
      </div>
      <div className="flex flex-col gap-1.5 px-2 py-2.5">
        {flat.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-zinc-400">(empty)</p>
        ) : (
          flat.map(msg => (
            <div
              key={msg.nodeId}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={[
                  'max-w-[78%] rounded-xl px-2.5 py-2 text-[12.5px] leading-snug',
                  msg.role === 'user'
                    ? 'rounded-br-[3px] bg-sky-500 text-white'
                    : 'rounded-bl-[3px] bg-zinc-200 text-zinc-900',
                ].join(' ')}
              >
                {msg.content || (
                  <span className="opacity-50">(empty)</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 rounded-b-[14px] border-t border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
        Branched
      </div>
    </div>
  );
}

function LivePanel({
  panel,
  nodes,
  left,
  top,
  isStreaming,
  setPanelEl,
  onSend,
  onUserBubbleClick,
  onFocusPanel,
}: {
  panel: LivePanelState;
  nodes: Record<string, import('@/store/conversationStore').MessageNode>;
  left: number;
  top: number;
  isStreaming: boolean;
  setPanelEl: (id: string, el: HTMLDivElement | null) => void;
  onSend: (panel: LivePanelState, text: string) => void;
  onUserBubbleClick: (
    panelId: string,
    userId: string,
    flatIndex: number,
  ) => void;
  onFocusPanel: () => void;
}) {
  const [draft, setDraft] = useState('');

  const flat = flattenLivePanel(nodes, panel.headUserId, panel.tailLeafId);

  const showInput = panel.canvasChildIds.length === 0;

  const dotColor =
    panel.canvasChildIds.length > 0 ? 'bg-zinc-300' : 'bg-emerald-600';

  return (
    <div
      data-panel-node
      ref={el => setPanelEl(panel.id, el)}
      className="absolute flex flex-col rounded-[14px] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
      style={{ left, top, width: NODE_WIDTH, zIndex: 1 }}
      onMouseDown={e => {
        e.stopPropagation();
        onFocusPanel();
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-t-[14px] border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11.5px] font-semibold tracking-wide text-zinc-600">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
          <span className="truncate">{headerLabel(panel, false)}</span>
        </div>
        <ExpandNodeButton />
      </div>

      <div className="flex flex-col gap-1.5 px-2 py-2.5">
        {!panel.headUserId ? (
          <p className="px-2 py-6 text-center text-[12px] text-zinc-400">
            Type below to start this thread.
          </p>
        ) : flat.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-zinc-400">
            (empty)
          </p>
        ) : (
          flat.map((msg, i) => {
            const isUser = msg.role === 'user';
            const canBranch =
              isUser &&
              showInput &&
              !isStreaming &&
              (i > 0 || panel.canvasParentId != null);
            const isSibling = canBranch && i === 0 && panel.canvasParentId != null;
            const hoverRing = isSibling
              ? 'hover:shadow-[inset_0_0_0_2.5px_#a78bfa]'
              : 'hover:shadow-[inset_0_0_0_2.5px_#f5c542]';

            return (
              <div
                key={`${msg.nodeId}-${i}`}
                className={isUser ? 'flex justify-end' : 'flex justify-start'}
              >
                <button
                  type="button"
                  disabled={!canBranch}
                  title={
                    canBranch
                      ? isSibling
                        ? 'Add parallel branch'
                        : 'Branch from here'
                      : undefined
                  }
                  className={[
                    'max-w-[78%] rounded-xl px-2.5 py-2 text-left text-[12.5px] leading-snug transition',
                    isUser
                      ? `rounded-br-[3px] bg-sky-500 text-white ${canBranch ? `cursor-pointer ${hoverRing}` : ''}`
                      : 'cursor-default rounded-bl-[3px] bg-zinc-200 text-zinc-900',
                    !canBranch && isUser ? 'cursor-default' : '',
                  ].join(' ')}
                  onMouseDown={e => {
                    if (!canBranch) return;
                    e.stopPropagation();
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    if (!canBranch || !isUser) return;
                    onUserBubbleClick(panel.id, msg.nodeId, i);
                  }}
                >
                  {msg.role === 'assistant' &&
                  msg.content.trim().length === 0 &&
                  isStreaming ? (
                    <span className="opacity-70">…</span>
                  ) : msg.content.trim().length === 0 ? (
                    <span className="opacity-50">(empty)</span>
                  ) : (
                    msg.content
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      {showInput ? (
        <div className="shrink-0 border-t border-zinc-200 bg-white px-2 py-2">
          <div className="flex items-center gap-1.5">
            <input
              className="min-w-0 flex-1 rounded-lg border border-sky-500 bg-white px-2.5 py-1.5 text-[12.5px] text-zinc-900 outline-none placeholder:text-zinc-400"
              placeholder="Message…"
              value={draft}
              disabled={isStreaming}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void (async () => {
                    await onSend(panel, draft);
                    setDraft('');
                  })();
                }
              }}
            />
            <button
              type="button"
              disabled={isStreaming || draft.trim().length === 0}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-white disabled:cursor-not-allowed disabled:opacity-35"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => {
                void (async () => {
                  await onSend(panel, draft);
                  setDraft('');
                })();
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M1 7h12M7 1l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
