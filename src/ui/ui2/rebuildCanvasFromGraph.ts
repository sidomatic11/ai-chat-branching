import { v4 as uuidv4 } from 'uuid';
import type { MessageNode } from '@/store/conversationStore';
import { ROOT_ID } from '@/store/conversationStore';
import type {
  CanvasPanelState,
  CanvasState,
  LivePanelState,
  FrozenPanelState,
} from '@/ui/ui2/canvasTypes';
import {
  computeLatestLeafFromUserHead,
  latestAssistantId,
} from '@/ui/ui2/graphPath';

function userChildren(
  nodes: Record<string, MessageNode>,
  parentId: string,
): string[] {
  const p = nodes[parentId];
  if (!p) return [];
  return p.childIds.filter(id => nodes[id]?.role === 'user');
}

function emptyLivePanel(id: string): LivePanelState {
  return {
    kind: 'live',
    id,
    headUserId: null,
    tailLeafId: null,
    attachParentId: ROOT_ID,
    canvasParentId: null,
    canvasChildIds: [],
    threadLabel: 'chat',
  };
}

/**
 * From a user head, walk the latest-only spine until we hit an assistant with
 * multiple user children (a fork) or a leaf. Used to reconstruct UI2 from the
 * message graph when switching from UI1 or on first mount.
 */
function buildFromUserHead(
  nodes: Record<string, MessageNode>,
  userId: string,
  canvasParentId: string | null,
  threadLabel: LivePanelState['threadLabel'],
  panels: Record<string, CanvasPanelState>,
): string {
  let u = userId;

  while (true) {
    const aId = latestAssistantId(nodes, u);
    if (!aId) {
      const id = uuidv4();
      const tail = computeLatestLeafFromUserHead(nodes, userId);
      panels[id] = {
        kind: 'live',
        id,
        headUserId: userId,
        tailLeafId: tail,
        attachParentId: nodes[userId]?.parentId ?? ROOT_ID,
        canvasParentId,
        canvasChildIds: [],
        threadLabel,
      };
      return id;
    }

    const nextUsers = userChildren(nodes, aId);
    if (nextUsers.length > 1) {
      const fid = uuidv4();
      const frozen: FrozenPanelState = {
        kind: 'frozen',
        id: fid,
        throughId: aId,
        canvasParentId,
        canvasChildIds: [],
      };
      panels[fid] = frozen;

      for (const nu of nextUsers) {
        const childRoot = buildFromUserHead(
          nodes,
          nu,
          fid,
          'branch',
          panels,
        );
        frozen.canvasChildIds.push(childRoot);
      }
      return fid;
    }

    if (nextUsers.length === 1) {
      u = nextUsers[0]!;
      continue;
    }

    const id = uuidv4();
    panels[id] = {
      kind: 'live',
      id,
      headUserId: userId,
      tailLeafId: aId,
      attachParentId: nodes[userId]?.parentId ?? ROOT_ID,
      canvasParentId,
      canvasChildIds: [],
      threadLabel,
    };
    return id;
  }
}

function buildFromBranchPoint(
  nodes: Record<string, MessageNode>,
  branchPointId: string,
  canvasParentId: string | null,
  panels: Record<string, CanvasPanelState>,
): string {
  const users = userChildren(nodes, branchPointId);
  if (users.length === 0) {
    const id = uuidv4();
    panels[id] = emptyLivePanel(id);
    panels[id].attachParentId = branchPointId;
    panels[id].canvasParentId = canvasParentId;
    return id;
  }

  if (users.length === 1) {
    return buildFromUserHead(
      nodes,
      users[0]!,
      canvasParentId,
      'chat',
      panels,
    );
  }

  const fid = uuidv4();
  const frozen: FrozenPanelState = {
    kind: 'frozen',
    id: fid,
    throughId: branchPointId,
    canvasParentId,
    canvasChildIds: [],
  };
  panels[fid] = frozen;

  for (const u of users) {
    const childRoot = buildFromUserHead(nodes, u, fid, 'branch', panels);
    frozen.canvasChildIds.push(childRoot);
  }
  return fid;
}

/**
 * Full canvas reconstruction from the store graph (e.g. after UI1 edits or
 * when opening UI2). Mirrors branch points: every root/assistant with 2+ user
 * children becomes a frozen fork with one subtree per user.
 */
export function rebuildCanvasFromGraph(
  nodes: Record<string, MessageNode>,
): CanvasState {
  const panels: Record<string, CanvasPanelState> = {};
  const rootPanelId = buildFromBranchPoint(nodes, ROOT_ID, null, panels);
  return { panels, rootPanelId };
}
