'use client';

import { processDataStream } from 'ai';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import { v4 as uuidv4 } from 'uuid';
import { UI_STORAGE_KEY, useUiStore } from './uiStore';

export type Role = 'user' | 'assistant';
type InternalRole = Role | 'root';

export type MessageNode = {
  id: string; // uuid
  role: InternalRole;
  content: string;
  parentId: string | null; // null = root sentinel
  childIds: string[]; // ordered list of children
  createdAt: number;
};

type ApiMessage = { role: Role; content: string };

export type ConversationStore = {
  nodes: Record<string, MessageNode>;
  activePathIds: string[]; // ordered root → current leaf
  isStreaming: boolean;
  error: string | null;

  // Actions
  clearConversation: () => void;
  sendMessage: (content: string) => Promise<void>;
  editAndResend: (nodeId: string, newContent: string) => Promise<void>;
  regenerate: (nodeId: string) => Promise<void>;
  navigateUserBranch: (
    userId: string,
    direction: 'prev' | 'next',
  ) => void;
  navigateSibling: (
    nodeId: string,
    direction: 'prev' | 'next',
  ) => void;
  setActivePath: (leafId: string) => void;
  clearError: () => void;
};

const STORAGE_KEY = 'branching-chat-prototype:v1';
const ROOT_ID = 'root';

function createRootNode(): MessageNode {
  return {
    id: ROOT_ID,
    role: 'root',
    content: '',
    parentId: null,
    childIds: [],
    createdAt: Date.now(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function loadPersistedState():
  | Pick<ConversationStore, 'nodes' | 'activePathIds'>
  | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;

    const nodes = (parsed.nodes ?? null) as unknown;
    const activePathIds = (parsed.activePathIds ?? null) as unknown;
    if (!isRecord(nodes) || !Array.isArray(activePathIds)) return null;

    // Minimal validation: root exists and activePath is plausible
    const root = nodes[ROOT_ID] as unknown;
    if (!isRecord(root) || root.id !== ROOT_ID) return null;

    const typedNodes = nodes as Record<string, MessageNode>;
    const typedPath = activePathIds.filter(
      (id): id is string => typeof id === 'string' && id in typedNodes,
    );
    if (typedPath.length === 0 || typedPath[0] !== ROOT_ID) return null;

    return { nodes: typedNodes, activePathIds: typedPath };
  } catch {
    return null;
  }
}

let persistTimer: number | null = null;
function schedulePersist(state: Pick<ConversationStore, 'nodes' | 'activePathIds'>) {
  if (typeof window === 'undefined') return;
  if (persistTimer !== null) window.clearTimeout(persistTimer);

  // Debounce to reduce churn during token streaming.
  persistTimer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore localStorage failures (quota, private mode, etc).
    }
  }, 250);
}

function getPathToRoot(
  nodes: Record<string, MessageNode>,
  leafId: string,
): string[] {
  const path: string[] = [];
  let cursor: string | null = leafId;
  while (cursor) {
    const currentNode: MessageNode | undefined = nodes[cursor];
    if (!currentNode) break;
    path.push(currentNode.id);
    cursor = currentNode.parentId;
  }
  return path.reverse();
}

function getDeepestLeafId(
  nodes: Record<string, MessageNode>,
  startId: string,
): string {
  // Follow the most recently-created child chain to the deepest descendant.
  // This lets branch navigation restore the full continuation of a branch,
  // not just the first assistant message at the split point.
  let cursor = startId;
  const visited = new Set<string>();

  while (true) {
    if (visited.has(cursor)) return cursor;
    visited.add(cursor);

    const node = nodes[cursor];
    if (!node) return cursor;

    const nextId = node.childIds[node.childIds.length - 1];
    if (!nextId) return cursor;

    cursor = nextId;
  }
}

function getMessagesForApi(
  nodes: Record<string, MessageNode>,
  pathIds: string[],
): ApiMessage[] {
  const messages: ApiMessage[] = [];
  for (const id of pathIds) {
    const node = nodes[id];
    if (!node) continue;
    if (node.role === 'root') continue;
    if (node.role === 'user' || node.role === 'assistant') {
      if (node.content.trim().length === 0) continue;
      messages.push({ role: node.role, content: node.content });
    }
  }
  return messages;
}

function addNode(nodes: Record<string, MessageNode>, node: MessageNode) {
  nodes[node.id] = node;
  if (node.parentId) {
    const parent = nodes[node.parentId];
    if (parent) parent.childIds = [...parent.childIds, node.id];
  }
}

async function streamAssistantText({
  messages,
  onTextDelta,
}: {
  messages: ApiMessage[];
  onTextDelta: (delta: string) => void;
}) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    let text = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json?.error) text = json.error;
    } catch {
      // ignore
    }
    throw new Error(text);
  }

  if (!res.body) throw new Error('Missing response body');

  await processDataStream({
    stream: res.body,
    onTextPart: async text => {
      onTextDelta(text);
    },
    onErrorPart: async err => {
      throw new Error(err);
    },
  });
}

function createInitialState(): Pick<
  ConversationStore,
  'nodes' | 'activePathIds' | 'isStreaming' | 'error'
> {
  const persisted = loadPersistedState();
  if (persisted) {
    return { ...persisted, isStreaming: false, error: null };
  }

  const root = createRootNode();
  return {
    nodes: { [root.id]: root },
    activePathIds: [root.id],
    isStreaming: false,
    error: null,
  };
}

export const useConversationStore = create<ConversationStore>()(
  subscribeWithSelector((set, get) => ({
  ...createInitialState(),

  clearConversation: () => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(UI_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    useUiStore.getState().resetUi();
    if (typeof window !== 'undefined' && persistTimer !== null) {
      window.clearTimeout(persistTimer);
      persistTimer = null;
    }

    const root = createRootNode();
    set({
      nodes: { [root.id]: root },
      activePathIds: [root.id],
      isStreaming: false,
      error: null,
    });
  },

  clearError: () => set({ error: null }),

  setActivePath: (leafId: string) => {
    set(state => ({
      activePathIds: getPathToRoot(state.nodes, leafId),
    }));
  },

  navigateUserBranch: (userId, direction) => {
    const { nodes } = get();
    const userNode = nodes[userId];
    if (!userNode || userNode.role !== 'user') return;

    const parentId = userNode.parentId ?? ROOT_ID;
    const parent = nodes[parentId];
    if (!parent) return;

    const userSiblingIds = parent.childIds.filter(id => nodes[id]?.role === 'user');
    if (userSiblingIds.length <= 1) return;

    const currentIndex = userSiblingIds.indexOf(userId);
    if (currentIndex < 0) return;

    const nextIndex =
      direction === 'next'
        ? (currentIndex + 1) % userSiblingIds.length
        : (currentIndex - 1 + userSiblingIds.length) % userSiblingIds.length;

    const nextUserId = userSiblingIds[nextIndex];
    if (!nextUserId) return;

    const nextUser = nodes[nextUserId];
    if (!nextUser || nextUser.role !== 'user') return;

    const assistantIds = nextUser.childIds.filter(id => nodes[id]?.role === 'assistant');
    const leafAssistantId = assistantIds[assistantIds.length - 1];
    if (!leafAssistantId) return;

    get().setActivePath(getDeepestLeafId(nodes, leafAssistantId));
  },

  navigateSibling: (nodeId, direction) => {
    const { nodes, activePathIds } = get();
    const userNode = nodes[nodeId];
    if (!userNode || userNode.role !== 'user') return;

    const assistantIds = userNode.childIds;
    if (assistantIds.length <= 1) return;

    const activeAssistantId =
      activePathIds.findLast?.(id => assistantIds.includes(id)) ??
      [...activePathIds].reverse().find(id => assistantIds.includes(id));

    const currentIndex = activeAssistantId
      ? assistantIds.indexOf(activeAssistantId)
      : 0;

    const nextIndex =
      direction === 'next'
        ? (currentIndex + 1) % assistantIds.length
        : (currentIndex - 1 + assistantIds.length) % assistantIds.length;

    const nextAssistantId = assistantIds[nextIndex];
    if (!nextAssistantId) return;
    get().setActivePath(getDeepestLeafId(nodes, nextAssistantId));
  },

  sendMessage: async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    if (get().isStreaming) return;

    const userId = uuidv4();
    const assistantId = uuidv4();
    const createdAt = Date.now();

    set(state => {
      const parentId = state.activePathIds[state.activePathIds.length - 1] ?? ROOT_ID;
      const nodes = { ...state.nodes };

      addNode(nodes, {
        id: userId,
        role: 'user',
        content: trimmed,
        parentId,
        childIds: [],
        createdAt,
      });

      addNode(nodes, {
        id: assistantId,
        role: 'assistant',
        content: '',
        parentId: userId,
        childIds: [],
        createdAt: createdAt + 1,
      });

      return {
        nodes,
        activePathIds: getPathToRoot(nodes, assistantId),
        isStreaming: true,
        error: null,
      };
    });

    try {
      const { nodes } = get();
      const pathToUser = getPathToRoot(nodes, userId);
      const messages = getMessagesForApi(nodes, pathToUser);

      await streamAssistantText({
        messages,
        onTextDelta: delta => {
          set(state => ({
            nodes: {
              ...state.nodes,
              [assistantId]: {
                ...state.nodes[assistantId],
                content: (state.nodes[assistantId]?.content ?? '') + delta,
              },
            },
          }));
        },
      });

      set({ isStreaming: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      set({ isStreaming: false, error: message });
    }
  },

  editAndResend: async (nodeId: string, newContent: string) => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    if (get().isStreaming) return;

    const { nodes: currentNodes } = get();
    const original = currentNodes[nodeId];
    if (!original || original.role !== 'user') return;

    const userId = uuidv4();
    const assistantId = uuidv4();
    const createdAt = Date.now();

    set(state => {
      const nodes = { ...state.nodes };
      const parentId = original.parentId ?? ROOT_ID;

      addNode(nodes, {
        id: userId,
        role: 'user',
        content: trimmed,
        parentId,
        childIds: [],
        createdAt,
      });

      addNode(nodes, {
        id: assistantId,
        role: 'assistant',
        content: '',
        parentId: userId,
        childIds: [],
        createdAt: createdAt + 1,
      });

      return {
        nodes,
        activePathIds: getPathToRoot(nodes, assistantId),
        isStreaming: true,
        error: null,
      };
    });

    try {
      const { nodes } = get();
      const pathToUser = getPathToRoot(nodes, userId);
      const messages = getMessagesForApi(nodes, pathToUser);

      await streamAssistantText({
        messages,
        onTextDelta: delta => {
          set(state => ({
            nodes: {
              ...state.nodes,
              [assistantId]: {
                ...state.nodes[assistantId],
                content: (state.nodes[assistantId]?.content ?? '') + delta,
              },
            },
          }));
        },
      });

      set({ isStreaming: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      set({ isStreaming: false, error: message });
    }
  },

  regenerate: async (nodeId: string) => {
    if (get().isStreaming) return;
    const { nodes: currentNodes } = get();
    const assistant = currentNodes[nodeId];
    if (!assistant || assistant.role !== 'assistant') return;

    const parentUserId = assistant.parentId;
    if (!parentUserId) return;

    const parentUser = currentNodes[parentUserId];
    if (!parentUser || parentUser.role !== 'user') return;

    const assistantId = uuidv4();
    const createdAt = Date.now();

    set(state => {
      const nodes = { ...state.nodes };

      addNode(nodes, {
        id: assistantId,
        role: 'assistant',
        content: '',
        parentId: parentUserId,
        childIds: [],
        createdAt,
      });

      return {
        nodes,
        activePathIds: getPathToRoot(nodes, assistantId),
        isStreaming: true,
        error: null,
      };
    });

    try {
      const { nodes } = get();
      const pathToUser = getPathToRoot(nodes, parentUserId);
      const messages = getMessagesForApi(nodes, pathToUser);

      await streamAssistantText({
        messages,
        onTextDelta: delta => {
          set(state => ({
            nodes: {
              ...state.nodes,
              [assistantId]: {
                ...state.nodes[assistantId],
                content: (state.nodes[assistantId]?.content ?? '') + delta,
              },
            },
          }));
        },
      });

      set({ isStreaming: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      set({ isStreaming: false, error: message });
    }
  },
  })),
);

// Persist nodes + activePathIds (debounced).
useConversationStore.subscribe(
  state => [state.nodes, state.activePathIds] as const,
  ([nodes, activePathIds]) => schedulePersist({ nodes, activePathIds }),
  { equalityFn: shallow },
);

