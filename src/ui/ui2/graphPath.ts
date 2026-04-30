import type { MessageNode } from '@/store/conversationStore';
import { getPathToRootIds, ROOT_ID } from '@/store/conversationStore';

export type FlatMsg = {
  role: 'user' | 'assistant';
  nodeId: string;
  content: string;
};

/** Latest assistant under a user (UI2 v1 policy). */
export function latestAssistantId(
  nodes: Record<string, MessageNode>,
  userId: string,
): string | null {
  const u = nodes[userId];
  if (!u || u.role !== 'user') return null;
  const asst = u.childIds.filter(id => nodes[id]?.role === 'assistant');
  if (!asst.length) return null;
  return asst[asst.length - 1] ?? null;
}

/** Latest user under an assistant (UI2 v1 policy). */
export function latestUserIdUnderAssistant(
  nodes: Record<string, MessageNode>,
  assistantId: string,
): string | null {
  const a = nodes[assistantId];
  if (!a || a.role !== 'assistant') return null;
  const users = a.childIds.filter(id => nodes[id]?.role === 'user');
  if (!users.length) return null;
  return users[users.length - 1] ?? null;
}

/**
 * Walk from a user head using “latest child” at each step until a leaf.
 */
export function computeLatestLeafFromUserHead(
  nodes: Record<string, MessageNode>,
  headUserId: string,
): string {
  let cursor: string | null = headUserId;
  const visited = new Set<string>();

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const node = nodes[cursor];
    if (!node) return headUserId;

    if (node.role === 'user') {
      const nextA = latestAssistantId(nodes, cursor);
      if (!nextA) return cursor;
      cursor = nextA;
    } else if (node.role === 'assistant') {
      const nextU = latestUserIdUnderAssistant(nodes, cursor);
      if (!nextU) return cursor;
      cursor = nextU;
    } else {
      return cursor;
    }
  }

  return cursor ?? headUserId;
}

export function slicePathFromHeadToLeaf(
  nodes: Record<string, MessageNode>,
  headUserId: string,
  leafId: string,
): MessageNode[] {
  const pathIds = getPathToRootIds(nodes, leafId);
  const headIdx = pathIds.indexOf(headUserId);
  if (headIdx < 0) return [];
  return pathIds
    .slice(headIdx)
    .map(id => nodes[id])
    .filter((n): n is MessageNode => Boolean(n) && n.role !== 'root');
}

export function flattenFrozenThrough(
  nodes: Record<string, MessageNode>,
  throughId: string,
): FlatMsg[] {
  if (throughId === ROOT_ID) return [];
  const pathIds = getPathToRootIds(nodes, throughId);
  const out: FlatMsg[] = [];
  for (const id of pathIds) {
    const n = nodes[id];
    if (!n || n.role === 'root') continue;
    if (n.role === 'user' || n.role === 'assistant') {
      out.push({ role: n.role, nodeId: n.id, content: n.content });
    }
  }
  return out;
}

export function flattenLivePanel(
  nodes: Record<string, MessageNode>,
  headUserId: string | null,
  tailLeafId: string | null,
): FlatMsg[] {
  if (!headUserId) return [];

  const leaf =
    tailLeafId ??
    computeLatestLeafFromUserHead(nodes, headUserId);

  const chain = slicePathFromHeadToLeaf(nodes, headUserId, leaf);
  const out: FlatMsg[] = [];
  for (const n of chain) {
    if (n.role === 'user' || n.role === 'assistant') {
      out.push({ role: n.role, nodeId: n.id, content: n.content });
    }
  }
  return out;
}

export function firstUserChildOfRoot(
  nodes: Record<string, MessageNode>,
): string | null {
  const root = nodes[ROOT_ID];
  if (!root) return null;
  for (const id of root.childIds) {
    if (nodes[id]?.role === 'user') return id;
  }
  return null;
}
