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
import { getExpandedLinearChainIds } from '@/ui/ui2/canvasChain';
import { ConnectorsSvg } from '@/ui/ui2/ConnectorsSvg';
import { DEFAULT_FLIP_OPTS, runFlipToNatural } from '@/ui/ui2/modeTransitionFlip';
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
import type { CollapseViewportAnchor } from '@/ui/ui2/viewportSync';
import {
  panToPlaceWorldOnScreen,
  pickDominantVisiblePanel,
  worldPointForPanelFracY,
} from '@/ui/ui2/viewportSync';

type PanelLayoutMode = 'canvas' | 'linear';

/** Set false to disable FLIP and restore instant mode switches. */
const ENABLE_MODE_FLIP = false;

/** Canvas zoom-in past this factor opens linear mode on the panel under the cursor. */
const CANVAS_ZOOM_ENTER_LINEAR = 1.5;

type PendingExpandFlip = {
  panelId: string;
  chain: string[];
  rects: Map<string, DOMRect>;
};

/** After a full graph rebuild, canvas panel ids change — map expanded view to the active thread leaf. */
function findLivePanelIdForGraphLeaf(
  panels: Record<string, CanvasPanelState>,
  nodes: Record<string, import('@/store/conversationStore').MessageNode>,
  leafId: string,
): string | null {
  for (const p of Object.values(panels)) {
    if (p.kind !== 'live' || !p.headUserId) continue;
    const tail =
      p.tailLeafId ?? computeLatestLeafFromUserHead(nodes, p.headUserId);
    if (tail === leafId) return p.id;
  }
  return null;
}

/** Topmost `[data-panel-node]` under screen coords (document paint order). */
function findPanelIdAtClientPoint(
  clientX: number,
  clientY: number,
  panelEls: Map<string, HTMLDivElement>,
): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    const root = el.closest('[data-panel-node]') as HTMLElement | null;
    if (!root) continue;
    for (const [id, panelEl] of panelEls) {
      if (panelEl === root) return id;
    }
  }
  return null;
}

export function BranchingCanvas() {
  const nodes = useConversationStore(s => s.nodes);
  const sendMessage = useConversationStore(s => s.sendMessage);
  const branchFromUserMessage = useConversationStore(s => s.branchFromUserMessage);
  const createParallelChildThread = useConversationStore(s => s.createParallelChildThread);
  const setActivePath = useConversationStore(s => s.setActivePath);
  const isStreaming = useConversationStore(s => s.isStreaming);

  const panelEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const linearScrollRef = useRef<HTMLDivElement | null>(null);
  const expandedModeRef = useRef(false);
  const pendingExpandRef = useRef<PendingExpandFlip | null>(null);
  const pendingCollapseRef = useRef<Map<string, DOMRect> | null>(null);
  const pendingCollapseAnchorRef = useRef<CollapseViewportAnchor | null>(null);
  const flipWrapRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const measureRef = useRef<(id: string) => number>(() => 260);

  const [expandedPanelId, setExpandedPanelId] = useState<string | null>(null);
  const [flipLock, setFlipLock] = useState(false);

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

  const panelsRef = useRef(panels);
  const rootPanelIdRef = useRef(rootPanelId);

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(
    {},
  );

  useLayoutEffect(() => {
    panelsRef.current = panels;
    rootPanelIdRef.current = rootPanelId;
  }, [panels, rootPanelId]);

  const nodeCount = useMemo(() => Object.keys(nodes).length, [nodes]);
  const prevNodeCountRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const prev = prevNodeCountRef.current;

    if (prev === null) {
      prevNodeCountRef.current = nodeCount;
      // Empty / fresh conversation: start in linear (use existing seed canvas ids).
      if (nodeCount === 1 && rootPanelId && panels[rootPanelId]) {
        setExpandedPanelId(rootPanelId);
      }
      return;
    }

    if (prev === nodeCount) return;

    const canvas = rebuildCanvasFromGraph(nodes);
    prevNodeCountRef.current = nodeCount;
    setCanvas(canvas);
    setPositions({});
    // Clear chat (or any jump back to lone root): open linear on the root panel.
    if (nodeCount === 1) {
      setExpandedPanelId(canvas.rootPanelId);
    }
  }, [nodeCount, nodes, rootPanelId, panels]);

  expandedModeRef.current = expandedPanelId != null;

  const expandedChainIds = useMemo(() => {
    if (!expandedPanelId || !panels[expandedPanelId]) return [];
    return getExpandedLinearChainIds(panels, expandedPanelId);
  }, [expandedPanelId, panels]);

  const expandedChainSet = useMemo(
    () => new Set(expandedChainIds),
    [expandedChainIds],
  );

  useLayoutEffect(() => {
    if (!expandedPanelId) return;
    if (panels[expandedPanelId]) return;

    const leaf =
      useConversationStore.getState().activePathIds.at(-1) ?? null;
    if (!leaf) {
      setExpandedPanelId(null);
      return;
    }
    // After clear, active leaf is ROOT — map to the empty live root panel.
    if (leaf === ROOT_ID && nodeCount === 1 && rootPanelId && panels[rootPanelId]) {
      setExpandedPanelId(rootPanelId);
      return;
    }
    const nextId = findLivePanelIdForGraphLeaf(panels, nodes, leaf);
    setExpandedPanelId(nextId);
  }, [expandedPanelId, panels, nodes, nodeCount, rootPanelId]);

  const measure = useCallback((panelId: string) => {
    const el = panelEls.current.get(panelId);
    return el ? el.offsetHeight : 260;
  }, []);

  useLayoutEffect(() => {
    measureRef.current = measure;
  }, [measure]);

  const applyPostCollapseViewport = useCallback((anchor: CollapseViewportAnchor) => {
    const pv = viewportRef.current;
    if (!pv) return;
    const storePanels = panelsRef.current;
    const root = rootPanelIdRef.current;
    if (!root || !storePanels[root]) return;

    const base: Record<string, { id: string; canvasChildIds: string[] }> = {};
    for (const p of Object.values(storePanels)) {
      base[p.id] = { id: p.id, canvasChildIds: p.canvasChildIds };
    }

    const pos = layoutAllPanels(
      root,
      base,
      measureRef.current,
      120,
      40,
    );
    setPositions(pos);

    const h = measureRef.current(anchor.panelId);
    const wp = worldPointForPanelFracY(anchor.panelId, anchor.fracY, pos, h);
    if (!wp) return;

    const z = 1;
    zoomRef.current = z;
    setZoom(z);
    const panNext = panToPlaceWorldOnScreen(
      pv,
      anchor.focalClientX,
      anchor.focalClientY,
      wp.wx,
      wp.wy,
      z,
    );
    panRef.current = panNext;
    setPan(panNext);
  }, []);

  const captureCollapseAnchor = useCallback(() => {
    const ex = expandedPanelId;
    if (!ex) return;
    const chain = getExpandedLinearChainIds(panels, ex);
    const scrollEl = linearScrollRef.current;
    if (scrollEl && chain.length > 0) {
      const pick = pickDominantVisiblePanel(
        chain,
        flipWrapRefs.current,
        scrollEl.getBoundingClientRect(),
        ex,
      );
      pendingCollapseAnchorRef.current = {
        panelId: pick.panelId,
        focalClientX: pick.focalClientX,
        focalClientY: pick.focalClientY,
        fracY: pick.fracY,
      };
      return;
    }
    const vp = viewportRef.current;
    if (vp) {
      const r = vp.getBoundingClientRect();
      pendingCollapseAnchorRef.current = {
        panelId: ex,
        focalClientX: r.left + r.width / 2,
        focalClientY: r.top + r.height / 2,
        fracY: 0.5,
      };
    }
  }, [expandedPanelId, panels]);

  const collapseExpanded = useCallback(() => {
    if (!expandedPanelId) return;
    captureCollapseAnchor();
    if (ENABLE_MODE_FLIP) {
      const chain = getExpandedLinearChainIds(panels, expandedPanelId);
      const rects = new Map<string, DOMRect>();
      for (const id of chain) {
        const el = panelEls.current.get(id);
        if (el) rects.set(id, el.getBoundingClientRect());
      }
      pendingCollapseRef.current = rects;
      setFlipLock(true);
    }
    setExpandedPanelId(null);
  }, [expandedPanelId, panels, captureCollapseAnchor]);

  const handleExpandToggle = useCallback(
    (panelId: string) => {
      if (expandedPanelId === panelId) {
        collapseExpanded();
        return;
      }
      pendingCollapseAnchorRef.current = null;
      if (ENABLE_MODE_FLIP) {
        const chain = getExpandedLinearChainIds(panels, panelId);
        const rects = new Map<string, DOMRect>();
        for (const id of chain) {
          const el = panelEls.current.get(id);
          if (el) rects.set(id, el.getBoundingClientRect());
        }
        pendingExpandRef.current = { panelId, chain, rects };
        setFlipLock(true);
      }
      setExpandedPanelId(panelId);
    },
    [collapseExpanded, expandedPanelId, panels],
  );

  const handleExpandToggleRef = useRef(handleExpandToggle);
  handleExpandToggleRef.current = handleExpandToggle;

  const panelBase = useMemo(() => {
    const out: Record<string, { id: string; canvasChildIds: string[] }> = {};
    for (const p of Object.values(panels)) {
      out[p.id] = { id: p.id, canvasChildIds: p.canvasChildIds };
    }
    return out;
  }, [panels]);

  const relayout = useCallback(() => {
    if (expandedPanelId) return;
    if (!rootPanelId || !panels[rootPanelId]) return;
    const pos = layoutAllPanels(
      rootPanelId,
      panelBase,
      measure,
      120,
      40,
    );
    setPositions(pos);
  }, [expandedPanelId, rootPanelId, panelBase, measure, panels]);

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
    if (expandedModeRef.current) {
      // Pinch-zoom-out on trackpad (ctrl/cmd + wheel) exits linear mode.
      const wantsZoom = e.ctrlKey || e.metaKey;
      if (wantsZoom && e.deltaY > 0) {
        e.preventDefault();
        collapseExpanded();
      }
      return;
    }

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

      const zoomingIn = newZ > prevZ;
      const crossIntoLinear =
        zoomingIn &&
        prevZ <= CANVAS_ZOOM_ENTER_LINEAR &&
        newZ > CANVAS_ZOOM_ENTER_LINEAR;
      if (crossIntoLinear) {
        const panelId = findPanelIdAtClientPoint(e.clientX, e.clientY, panelEls.current);
        if (panelId) {
          queueMicrotask(() => handleExpandToggleRef.current(panelId));
        }
      }
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
  }, [collapseExpanded]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    // Must be non-passive so preventDefault can block browser zoom on pinch.
    const onWheelNative = (e: WheelEvent) => onWheel(e);
    el.addEventListener('wheel', onWheelNative, { passive: false });

    // Safari: WebKit gesture events — pinch closed (scale < 1) exits linear mode.
    const pinchTrack = { active: false, minScale: 1 };

    const onGestureStart = (e: Event) => {
      if (expandedModeRef.current) {
        pinchTrack.active = true;
        pinchTrack.minScale = 1;
        // Don't preventDefault — blocking WebKit gesture events breaks two-finger scroll in linear mode.
        return;
      }
      e.preventDefault();
    };

    const onGestureChange = (e: Event) => {
      if (expandedModeRef.current) {
        const scale = (e as unknown as { scale?: number }).scale ?? 1;
        if (pinchTrack.active) {
          pinchTrack.minScale = Math.min(pinchTrack.minScale, scale);
        }
        return;
      }
      e.preventDefault();
    };

    const onGestureEnd = (e: Event) => {
      if (expandedModeRef.current) {
        if (pinchTrack.active && pinchTrack.minScale < 0.92) {
          collapseExpanded();
        }
        pinchTrack.active = false;
        pinchTrack.minScale = 1;
        return;
      }
      e.preventDefault();
    };

    el.addEventListener('gesturestart', onGestureStart, { passive: false } as AddEventListenerOptions);
    el.addEventListener('gesturechange', onGestureChange, { passive: false } as AddEventListenerOptions);
    el.addEventListener('gestureend', onGestureEnd, { passive: false } as AddEventListenerOptions);

    return () => {
      el.removeEventListener('wheel', onWheelNative as EventListener);
      el.removeEventListener('gesturestart', onGestureStart as EventListener);
      el.removeEventListener('gesturechange', onGestureChange as EventListener);
      el.removeEventListener('gestureend', onGestureEnd as EventListener);
    };
  }, [onWheel, collapseExpanded]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.active) return;
      const next = { x: e.clientX - drag.ox, y: e.clientY - drag.oy };
      panRef.current = next;
      setPan(next);
    };
    const onUp = () => {
      setDrag(d => ({ ...d, active: false }));
      if (viewportRef.current) {
        viewportRef.current.style.cursor = expandedModeRef.current ? 'default' : 'grab';
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag.active, drag.ox, drag.oy]);

  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (expandedModeRef.current) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('[data-panel-node]')) return;
    const p = panRef.current;
    setDrag({ active: true, ox: e.clientX - p.x, oy: e.clientY - p.y });
    if (viewportRef.current) viewportRef.current.style.cursor = 'grabbing';
  }, []);

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

  const isExpanded = expandedPanelId != null;

  /** Live leaf that actually accepts new messages — tail of the expanded chain, not always `expandedPanelId`. */
  const linearFooterComposerPanel = useMemo((): LivePanelState | null => {
    if (!expandedPanelId || expandedChainIds.length === 0) return null;
    for (let i = expandedChainIds.length - 1; i >= 0; i--) {
      const p = panels[expandedChainIds[i]!];
      if (p?.kind === 'live' && p.canvasChildIds.length === 0) return p;
    }
    return null;
  }, [expandedPanelId, expandedChainIds, panels]);

  const [linearDraft, setLinearDraft] = useState('');
  useEffect(() => {
    setLinearDraft('');
  }, [expandedPanelId, linearFooterComposerPanel?.id]);

  const linearComposerInputRef = useRef<HTMLInputElement>(null);

  const focusLinearComposer = useCallback(() => {
    const el = linearComposerInputRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
    });
  }, []);

  useLayoutEffect(() => {
    if (!isExpanded || !linearFooterComposerPanel || flipLock) return;
    focusLinearComposer();
  }, [isExpanded, linearFooterComposerPanel?.id, flipLock, isStreaming, focusLinearComposer]);

  const graphPanels = useMemo(() => {
    const list = Object.values(panels);
    if (!isExpanded) return list;
    return list.filter(p => !expandedChainSet.has(p.id));
  }, [panels, isExpanded, expandedChainSet]);

  useLayoutEffect(() => {
    if (!ENABLE_MODE_FLIP) return;

    const ac = new AbortController();
    const signal = ac.signal;

    const collapseRects = pendingCollapseRef.current;
    if (expandedPanelId === null && collapseRects) {
      pendingCollapseRef.current = null;
      const ids = [...collapseRects.keys()];
      const promises: Promise<void>[] = [];
      for (const id of ids) {
        const firstRect = collapseRects.get(id);
        const el = panelEls.current.get(id);
        if (!firstRect || !el) continue;
        promises.push(runFlipToNatural(el, firstRect, DEFAULT_FLIP_OPTS, signal));
      }
      const done = () => {
        const anchor = pendingCollapseAnchorRef.current;
        pendingCollapseAnchorRef.current = null;
        setFlipLock(false);
        if (anchor) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              applyPostCollapseViewport(anchor);
            });
          });
        }
      };
      if (promises.length === 0) done();
      else void Promise.all(promises).then(done);
      return () => ac.abort();
    }

    const pEx = pendingExpandRef.current;
    if (expandedPanelId && pEx && pEx.panelId === expandedPanelId) {
      pendingExpandRef.current = null;
      const promises: Promise<void>[] = [];
      for (const id of pEx.chain) {
        const firstRect = pEx.rects.get(id);
        const wrap = flipWrapRefs.current.get(id);
        if (!firstRect || !wrap) continue;
        promises.push(runFlipToNatural(wrap, firstRect, DEFAULT_FLIP_OPTS, signal));
      }
      const done = () => setFlipLock(false);
      if (promises.length === 0) done();
      else void Promise.all(promises).then(done);
      return () => ac.abort();
    }

    return () => ac.abort();
  }, [expandedPanelId, applyPostCollapseViewport]);

  /** Instant collapse (no FLIP): apply zoom + pan once linear unmounts. */
  useLayoutEffect(() => {
    if (expandedPanelId !== null) return;
    if (flipLock) return;
    const anchor = pendingCollapseAnchorRef.current;
    if (!anchor) return;
    pendingCollapseAnchorRef.current = null;
    applyPostCollapseViewport(anchor);
  }, [expandedPanelId, flipLock, applyPostCollapseViewport]);

  /** Linear: keep focus panel in view after expand FLIP and on branch nav. */
  useLayoutEffect(() => {
    if (!expandedPanelId || flipLock) return;
    const id = expandedPanelId;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flipWrapRefs.current
          .get(id)
          ?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      });
    });
  }, [expandedPanelId, flipLock]);

  const setFlipWrapRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) flipWrapRefs.current.set(id, el);
    else flipWrapRefs.current.delete(id);
  }, []);

  return (
    <div
      ref={viewportRef}
      className={[
        'relative flex min-h-0 w-full flex-1 flex-col overflow-hidden transition-colors duration-300 ease-out',
        isExpanded ? 'cursor-default bg-white' : 'cursor-grab bg-zinc-950',
        flipLock ? 'pointer-events-none' : '',
      ].join(' ')}
      onMouseDown={onCanvasMouseDown}
    >
      {/* Canvas world: clip overflow so abspos nodes never inflate the linear scroller. Never transition this transform (pan/zoom). */}
      <div
        className={[
          'absolute inset-0 z-0 overflow-hidden',
          isExpanded ? 'pointer-events-none' : '',
        ].join(' ')}
        aria-hidden={isExpanded}
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
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: applyTransform(),
            transition: 'none',
          }}
        >
          <ConnectorsSvg panels={panelBase} positions={positions} measure={measure} />

          {graphPanels.map(p => {
            const pos = positions[p.id] ?? { x: 0, y: 0 };
            if (p.kind === 'frozen') {
              return (
                <FrozenPanel
                  key={p.id}
                  panel={p}
                  nodes={nodes}
                  layout="canvas"
                  left={pos.x}
                  top={pos.y}
                  setPanelEl={setPanelEl}
                  isExpandedFocus={false}
                  onExpandToggle={() => handleExpandToggle(p.id)}
                  isStreaming={isStreaming}
                />
              );
            }
            return (
              <LivePanel
                key={p.id}
                panel={p}
                nodes={nodes}
                layout="canvas"
                left={pos.x}
                top={pos.y}
                isStreaming={isStreaming}
                setPanelEl={setPanelEl}
                onSend={handleSend}
                onUserBubbleClick={handleUserBubbleClick}
                isExpandedFocus={false}
                onExpandToggle={() => handleExpandToggle(p.id)}
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
      </div>

      {isExpanded ? (
        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white transition-colors duration-300 ease-out">
          {/* Scrollport must not be a flex container: flex+overflow-auto often breaks scrolling (incl. WebKit).
              Perspective on an ancestor of overflow:auto also breaks trackpad scroll — keep it on flip wraps only. */}
          <div
            ref={linearScrollRef}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4"
            style={{ WebkitOverflowScrolling: 'touch' }}
            onPointerDownCapture={e => {
              if (flipLock || !linearFooterComposerPanel) return;
              const t = e.target as HTMLElement;
              if (t.closest?.('[data-ui2-no-composer-refocus]')) return;
              // Keep focus in composer; skip only when editing another field.
              if (t.closest?.('input, textarea, select, [contenteditable=true]')) return;
              focusLinearComposer();
            }}
          >
            <div className="flex flex-col items-center gap-0">
            {expandedChainIds.map(id => {
              const p = panels[id];
              if (!p) return null;
              const linearRole: 'focus' | 'ancestor' =
                id === expandedPanelId ? 'focus' : 'ancestor';
              const detachLinearComposer =
                linearFooterComposerPanel != null && p.id === linearFooterComposerPanel.id;
              if (p.kind === 'frozen') {
                return (
                  <div
                    key={p.id}
                    ref={el => setFlipWrapRef(p.id, el)}
                    className="isolate mx-auto min-w-0 overflow-x-hidden [perspective:1200px] [transition:none] [backface-visibility:hidden]"
                    style={{ width: NODE_WIDTH }}
                  >
                    <FrozenPanel
                      panel={p}
                      nodes={nodes}
                      layout="linear"
                      linearRole={linearRole}
                      left={0}
                      top={0}
                      setPanelEl={setPanelEl}
                      isExpandedFocus={linearRole === 'focus'}
                      onExpandToggle={collapseExpanded}
                      isStreaming={isStreaming}
                      linearBranchNav={getLinearBranchNav(p, panels, setExpandedPanelId)}
                    />
                  </div>
                );
              }
              return (
                <div
                  key={p.id}
                  ref={el => setFlipWrapRef(p.id, el)}
                  className="isolate mx-auto min-w-0 overflow-x-hidden [perspective:1200px] [transition:none] [backface-visibility:hidden]"
                  style={{ width: NODE_WIDTH }}
                >
                  <LivePanel
                    panel={p}
                    nodes={nodes}
                    layout="linear"
                    linearRole={linearRole}
                    left={0}
                    top={0}
                    isStreaming={isStreaming}
                    setPanelEl={setPanelEl}
                    onSend={handleSend}
                    onUserBubbleClick={handleUserBubbleClick}
                    isExpandedFocus={linearRole === 'focus'}
                    onExpandToggle={collapseExpanded}
                    linearBranchNav={getLinearBranchNav(p, panels, setExpandedPanelId)}
                    detachLinearComposer={detachLinearComposer}
                    onFocusPanel={() => {
                      const tail =
                        p.tailLeafId ??
                        (p.headUserId
                          ? computeLatestLeafFromUserHead(nodes, p.headUserId)
                          : null);
                      if (tail) setActivePath(tail);
                    }}
                  />
                </div>
              );
            })}
            </div>
          </div>
          {linearFooterComposerPanel ? (
            <div className="shrink-0 border-t border-zinc-200 bg-white px-3 pb-3 pt-2">
              <div className="mx-auto px-2 py-2" style={{ width: NODE_WIDTH }}>
                <div className="flex items-center gap-1.5">
                  <input
                    ref={linearComposerInputRef}
                    className="min-w-0 flex-1 rounded-lg border border-sky-500 bg-white px-2.5 py-1.5 text-[12.5px] text-zinc-900 outline-none placeholder:text-zinc-400"
                    placeholder="Message…"
                    value={linearDraft}
                    disabled={isStreaming}
                    onMouseDown={e => e.stopPropagation()}
                    onChange={e => setLinearDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void (async () => {
                          await handleSend(linearFooterComposerPanel, linearDraft);
                          setLinearDraft('');
                          focusLinearComposer();
                        })();
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={isStreaming || linearDraft.trim().length === 0}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-white disabled:cursor-not-allowed disabled:opacity-35"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => {
                      void (async () => {
                        await handleSend(linearFooterComposerPanel, linearDraft);
                        setLinearDraft('');
                        focusLinearComposer();
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
            </div>
          ) : null}
        </div>
      ) : null}

      {!isExpanded ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-20 rounded-md bg-black/50 px-2 py-1 text-[11px] text-white/80 tabular-nums">
          {Math.round(zoom * 100)}%
        </div>
      ) : null}
    </div>
  );
}

function ExpandNodeButton({
  isExpandedFocus,
  onPress,
  revealOnParentHover,
}: {
  isExpandedFocus: boolean;
  onPress: () => void;
  /** When true, parent must use `group`; button shows on row hover / focus-within / keyboard focus. */
  revealOnParentHover?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        '-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-200/80',
        revealOnParentHover
          ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'
          : '',
      ].join(' ')}
      aria-expanded={isExpandedFocus}
      aria-label={isExpandedFocus ? 'Collapse to canvas' : 'Expand linear view'}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation();
        onPress();
      }}
    >
      <span className="material-symbols-rounded text-[18px] leading-none" aria-hidden>
        {isExpandedFocus ? 'close_fullscreen' : 'expand_content'}
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

type LinearBranchNav = {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
};

/** Canvas-level siblings: any panel (live or frozen) under a parent with 2+ children. */
function getLinearBranchNav(
  panel: CanvasPanelState,
  panels: Record<string, CanvasPanelState>,
  setExpandedPanelId: (id: string) => void,
): LinearBranchNav | null {
  const parentId = panel.canvasParentId;
  if (!parentId) return null;
  const parent = panels[parentId];
  if (!parent || parent.canvasChildIds.length <= 1) return null;
  const ids = parent.canvasChildIds;
  const idx = ids.indexOf(panel.id);
  if (idx < 0) return null;
  return {
    index: idx,
    total: ids.length,
    onPrev: () => {
      const nextIdx = (idx - 1 + ids.length) % ids.length;
      setExpandedPanelId(ids[nextIdx]!);
    },
    onNext: () => {
      const nextIdx = (idx + 1) % ids.length;
      setExpandedPanelId(ids[nextIdx]!);
    },
  };
}

function LinearBranchNavRow({
  nav,
  isStreaming,
  onExpandToggle,
}: {
  nav: LinearBranchNav;
  isStreaming: boolean;
  onExpandToggle: () => void;
}) {
  return (
    <div className="group flex shrink-0 items-center justify-between gap-2 bg-white px-3 py-2 text-[11.5px] text-zinc-600">
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <button
          type="button"
          disabled={isStreaming}
          className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium tabular-nums hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous branch"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            nav.onPrev();
          }}
        >
          &lt;
        </button>
        <span className="shrink-0 tabular-nums">
          {nav.index + 1} / {nav.total}
        </span>
        <button
          type="button"
          disabled={isStreaming}
          className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium tabular-nums hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next branch"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            nav.onNext();
          }}
        >
          &gt;
        </button>
      </div>
      <ExpandNodeButton isExpandedFocus onPress={onExpandToggle} revealOnParentHover />
    </div>
  );
}

/** Linear-mode user row: edit (Material edit icon left of bubble on hover) + resend via store. */
function LinearUserBubble({
  nodeId,
  content,
  isStreaming,
}: {
  nodeId: string;
  content: string;
  isStreaming: boolean;
}) {
  const editAndResend = useConversationStore(s => s.editAndResend);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <div className="flex w-full justify-end">
      <div
        className={[
          'group flex max-w-[78%] items-center gap-1',
          // row-reverse: DOM order bubble then control → icon renders left of bubble (no overflow clip)
          !editing ? 'flex-row-reverse' : 'min-w-0 flex-1 flex-col',
        ].join(' ')}
      >
        {editing ? (
          <div
            data-ui2-no-composer-refocus
            className="w-full rounded-xl rounded-br-[3px] bg-sky-500 px-2.5 py-2 text-left text-[12.5px] leading-snug text-white"
            onMouseDown={e => e.stopPropagation()}
          >
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={3}
              disabled={isStreaming}
              className="w-full min-h-[4.5rem] resize-y rounded-lg border border-white/30 bg-white/15 px-2 py-1.5 text-[12.5px] text-white outline-none placeholder:text-white/50"
            />
            <div className="mt-1.5 flex justify-end gap-1.5">
              <button
                type="button"
                disabled={isStreaming}
                className="rounded-md px-2 py-1 text-xs font-medium text-white/85 hover:bg-white/10"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  setEditing(false);
                  setDraft('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isStreaming || draft.trim().length === 0}
                className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-sky-600 hover:bg-zinc-50 disabled:opacity-40"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  void (async () => {
                    await editAndResend(nodeId, draft);
                    setEditing(false);
                    setDraft('');
                  })();
                }}
              >
                Resend
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1 rounded-xl rounded-br-[3px] bg-sky-500 px-2.5 py-2 text-[12.5px] leading-snug text-white">
              {content.trim().length === 0 ? (
                <span className="opacity-50">(empty)</span>
              ) : (
                <span className="whitespace-pre-wrap break-words">{content}</span>
              )}
            </div>
            <button
              type="button"
              data-ui2-no-composer-refocus
              aria-label="Edit message"
              disabled={isStreaming}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-600 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:pointer-events-none disabled:opacity-0"
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                setEditing(true);
                setDraft(content);
              }}
            >
              <span className="material-symbols-rounded text-[18px] leading-none" aria-hidden>
                edit
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function FrozenPanel({
  panel,
  nodes,
  layout,
  linearRole,
  left,
  top,
  setPanelEl,
  isExpandedFocus,
  onExpandToggle,
  linearBranchNav,
  isStreaming,
}: {
  panel: FrozenPanelState;
  nodes: Record<string, import('@/store/conversationStore').MessageNode>;
  layout: PanelLayoutMode;
  linearRole?: 'focus' | 'ancestor';
  left: number;
  top: number;
  setPanelEl: (id: string, el: HTMLDivElement | null) => void;
  isExpandedFocus: boolean;
  onExpandToggle: () => void;
  linearBranchNav?: LinearBranchNav | null;
  isStreaming: boolean;
}) {
  const flat = flattenFrozenThrough(nodes, panel.throughId);
  const isLinear = layout === 'linear';
  const nav = isLinear ? linearBranchNav ?? null : null;

  const cardClass = [
    'flex flex-col bg-white transition-[min-width,box-shadow] duration-300 ease-out',
    isLinear
      ? 'relative z-10 w-full shrink-0 self-center'
      : 'absolute z-[1] overflow-hidden rounded-[14px] shadow-[0_4px_24px_rgba(0,0,0,0.35)]',
  ].join(' ');

  return (
    <div
      data-panel-node
      ref={el => setPanelEl(panel.id, el)}
      className={cardClass}
      style={
        isLinear
          ? { width: NODE_WIDTH }
          : { left, top, width: NODE_WIDTH, zIndex: 1 }
      }
      onMouseDown={e => e.stopPropagation()}
    >
      {!isLinear ? (
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-t-[14px] border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11.5px] font-semibold tracking-wide text-zinc-600">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
            <span className="truncate">{headerLabel(panel, true)}</span>
          </div>
          <ExpandNodeButton isExpandedFocus={isExpandedFocus} onPress={onExpandToggle} />
        </div>
      ) : nav ? (
        <LinearBranchNavRow
          nav={nav}
          isStreaming={isStreaming}
          onExpandToggle={onExpandToggle}
        />
      ) : null}
      <div className="flex flex-col gap-1.5 px-2 py-2.5">
        {flat.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-zinc-400">(empty)</p>
        ) : (
          flat.map(msg =>
            msg.role === 'user' && isLinear ? (
              <LinearUserBubble
                key={msg.nodeId}
                nodeId={msg.nodeId}
                content={msg.content}
                isStreaming={isStreaming}
              />
            ) : (
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
            ),
          )
        )}
      </div>
      {!isLinear ? (
        <div className="flex shrink-0 items-center gap-1.5 rounded-b-[14px] border-t border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          Branched
        </div>
      ) : null}
    </div>
  );
}

function LivePanel({
  panel,
  nodes,
  layout,
  linearRole,
  left,
  top,
  isStreaming,
  setPanelEl,
  onSend,
  onUserBubbleClick,
  onFocusPanel,
  isExpandedFocus,
  onExpandToggle,
  linearBranchNav,
  detachLinearComposer,
}: {
  panel: LivePanelState;
  nodes: Record<string, import('@/store/conversationStore').MessageNode>;
  layout: PanelLayoutMode;
  linearRole?: 'focus' | 'ancestor';
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
  isExpandedFocus: boolean;
  onExpandToggle: () => void;
  linearBranchNav?: LinearBranchNav | null;
  detachLinearComposer?: boolean;
}) {
  const [draft, setDraft] = useState('');

  const flat = flattenLivePanel(nodes, panel.headUserId, panel.tailLeafId);

  const showInput = panel.canvasChildIds.length === 0;

  const dotColor =
    panel.canvasChildIds.length > 0 ? 'bg-zinc-300' : 'bg-emerald-600';

  const isLinear = layout === 'linear';

  const nav = isLinear ? linearBranchNav ?? null : null;

  const cardClass = [
    'flex flex-col bg-white transition-[min-width,box-shadow] duration-300 ease-out',
    isLinear
      ? 'relative z-10 w-full shrink-0 self-center'
      : 'absolute z-[1] rounded-[14px] shadow-[0_4px_24px_rgba(0,0,0,0.35)]',
  ].join(' ');

  const showInlineInput = showInput && (!isLinear || !detachLinearComposer);

  return (
    <div
      data-panel-node
      ref={el => setPanelEl(panel.id, el)}
      className={cardClass}
      style={
        isLinear
          ? { width: NODE_WIDTH }
          : { left, top, width: NODE_WIDTH, zIndex: 1 }
      }
      onMouseDown={e => {
        e.stopPropagation();
        if (!isLinear) onFocusPanel();
      }}
    >
      {isLinear ? (
        nav ? (
          <LinearBranchNavRow
            nav={nav}
            isStreaming={isStreaming}
            onExpandToggle={onExpandToggle}
          />
        ) : null
      ) : (
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-t-[14px] border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11.5px] font-semibold tracking-wide text-zinc-600">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
            <span className="truncate">{headerLabel(panel, false)}</span>
          </div>
          <ExpandNodeButton isExpandedFocus={isExpandedFocus} onPress={onExpandToggle} />
        </div>
      )}

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
            if (isUser && isLinear) {
              return (
                <LinearUserBubble
                  key={`${msg.nodeId}-${i}`}
                  nodeId={msg.nodeId}
                  content={msg.content}
                  isStreaming={isStreaming}
                />
              );
            }
            const canBranch =
              layout === 'canvas' &&
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

      {showInlineInput ? (
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
