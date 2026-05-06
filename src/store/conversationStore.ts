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
type StoreSet = (
  partial:
    | Partial<ConversationStore>
    | ConversationStore
    | ((state: ConversationStore) => Partial<ConversationStore> | ConversationStore),
) => void;

export type SendMessageOptions = {
  /**
   * Parent node id to attach the new user/assistant pair under.
   * - For normal sends, this should be the current assistant leaf.
   * - `root` is allowed (first message).
   */
  parentId?: string;
  /**
   * If provided, reuse an existing user node as the new user turn.
   * This is useful for UI2 creating an empty branch “placeholder” user that
   * is only filled once the user actually types and sends.
   */
  existingUserId?: string;
};

export type SendMessageResult = { userId: string; assistantId: string };

export type ParallelThreadResult = { userId: string; assistantId: string };

export type BranchFromUserResult = {
  frozenThroughId: string;
  leftHeadUserId: string;
  rightHeadUserId: string;
};

/** Stable id on UI1 `<main>` scrollport; store reads DOM here for pre-navigation anchor offset. */
export const UI1_SCROLL_CONTAINER_ID = 'ui1-chat-scroll-main';

/** UI2 expanded linear column scrollport (`linearScrollRef`). */
export const UI2_LINEAR_SCROLL_CONTAINER_ID = 'ui2-linear-scroll';

export type Ui1ScrollIntent =
  | { kind: 'pinUser'; userId: string }
  | { kind: 'anchor'; nodeId: string; offsetBefore: number | null };

/** Message top minus scrollport top (viewport client coords), for branch scroll compensation. */
export function readMessageAnchorOffset(
  container: HTMLElement,
  nodeId: string,
): number | null {
  const el = container.querySelector(`[data-message-id="${nodeId}"]`);
  if (!el) return null;
  const er = el.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  return er.top - cr.top;
}

/** Measure message node top relative to UI1 scroll container (client coords delta). */
export function readUi1AnchorOffset(nodeId: string): number | null {
  if (typeof document === 'undefined') return null;
  const container = document.getElementById(UI1_SCROLL_CONTAINER_ID);
  if (!container) return null;
  return readMessageAnchorOffset(container, nodeId);
}

export type ConversationStore = {
  nodes: Record<string, MessageNode>;
  activePathIds: string[]; // ordered root → current leaf
  isStreaming: boolean;
  error: string | null;
  /** UI1: set with branch pagination so ChatView skips scroll-to-bottom once. Not persisted. */
  skipNextScrollToBottom: boolean;
  /**
   * One-shot scroll behavior for UI1 linear chat (and UI2 linear consumes pinUser).
   * Not persisted.
   */
  scrollIntent: Ui1ScrollIntent | null;

  // Actions
  clearConversation: () => void;
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<SendMessageResult | null>;
  /** UI2: append empty user+assistant under root or an assistant (parallel branch). */
  createParallelChildThread: (parentId: string) => ParallelThreadResult | null;
  /** UI2: same graph op as createParallelChildThread; returns ids for canvas layout. */
  branchFromUserMessage: (userNodeId: string) => BranchFromUserResult | null;
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
  setActivePath: (
    leafId: string,
    options?: { skipScrollToBottom?: boolean },
  ) => void;
  clearError: () => void;
};

const STORAGE_KEY = 'branching-chat-prototype:v1';
export const ROOT_ID = 'root';
const STREAM_FLUSH_MS = 32;

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

export function getPathToRootIds(
  nodes: Record<string, MessageNode>,
  leafId: string,
): string[] {
  return getPathToRoot(nodes, leafId);
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

export function getMessagesForApiFromLeaf(
  nodes: Record<string, MessageNode>,
  leafId: string,
): ApiMessage[] {
  return getMessagesForApi(nodes, getPathToRoot(nodes, leafId));
}

function addNode(nodes: Record<string, MessageNode>, node: MessageNode) {
  nodes[node.id] = node;
  if (node.parentId) {
    const parent = nodes[node.parentId];
    if (parent) parent.childIds = [...parent.childIds, node.id];
  }
}

function appendAssistantContent(
  set: StoreSet,
  assistantId: string,
  delta: string,
) {
  if (!delta) return;
  set(state => {
    const assistant = state.nodes[assistantId];
    if (!assistant || assistant.role !== 'assistant') return state;
    return {
      nodes: {
        ...state.nodes,
        [assistantId]: {
          ...assistant,
          content: assistant.content + delta,
        },
      },
    };
  });
}

function createAssistantStreamBuffer(set: StoreSet, assistantId: string) {
  let pending = '';
  let timer: number | null = null;

  const flush = () => {
    timer = null;
    const delta = pending;
    pending = '';
    appendAssistantContent(set, assistantId, delta);
  };

  return {
    push(delta: string) {
      pending += delta;
      if (typeof window === 'undefined') {
        flush();
        return;
      }
      if (timer !== null) return;
      timer = window.setTimeout(flush, STREAM_FLUSH_MS);
    },
    flush() {
      if (typeof window !== 'undefined' && timer !== null) {
        window.clearTimeout(timer);
      }
      flush();
    },
  };
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
  | 'nodes'
  | 'activePathIds'
  | 'isStreaming'
  | 'error'
  | 'skipNextScrollToBottom'
  | 'scrollIntent'
> {
  const persisted = loadPersistedState();
  if (persisted) {
    return {
      ...persisted,
      isStreaming: false,
      error: null,
      skipNextScrollToBottom: false,
      scrollIntent: null,
    };
  }

  const root = createRootNode();
  return {
    nodes: { [root.id]: root },
    activePathIds: [root.id],
    isStreaming: false,
    error: null,
    skipNextScrollToBottom: false,
    scrollIntent: null,
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
      skipNextScrollToBottom: false,
      scrollIntent: null,
    });
  },

  clearError: () => set({ error: null }),

  createParallelChildThread: (parentId: string) => {
    const { nodes } = get();
    const parent = nodes[parentId];
    if (!parent) return null;
    if (parent.role !== 'root' && parent.role !== 'assistant') return null;

    const userId = uuidv4();
    const assistantId = uuidv4();
    const createdAt = Date.now();

    set(state => {
      const nextNodes = { ...state.nodes };
      addNode(nextNodes, {
        id: userId,
        role: 'user',
        content: '',
        parentId,
        childIds: [],
        createdAt,
      });
      addNode(nextNodes, {
        id: assistantId,
        role: 'assistant',
        content: '',
        parentId: userId,
        childIds: [],
        createdAt: createdAt + 1,
      });
      return { nodes: nextNodes };
    });

    return { userId, assistantId };
  },

  branchFromUserMessage: (userNodeId: string) => {
    const { nodes } = get();
    const user = nodes[userNodeId];
    if (!user || user.role !== 'user') return null;

    const parentId = user.parentId ?? ROOT_ID;
    const parent = nodes[parentId];
    if (!parent) return null;
    if (parent.role !== 'root' && parent.role !== 'assistant') return null;

    const created = get().createParallelChildThread(parentId);
    if (!created) return null;

    return {
      frozenThroughId: parentId,
      leftHeadUserId: userNodeId,
      rightHeadUserId: created.userId,
    };
  },

  setActivePath: (leafId, options) => {
    set(state => ({
      activePathIds: getPathToRoot(state.nodes, leafId),
      skipNextScrollToBottom: options?.skipScrollToBottom === true,
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

    const leafId = getDeepestLeafId(nodes, leafAssistantId);
    const scrollIntent: Ui1ScrollIntent =
      parent.role === 'assistant'
        ? {
            kind: 'anchor',
            nodeId: parentId,
            offsetBefore: readUi1AnchorOffset(parentId),
          }
        : { kind: 'pinUser', userId: nextUserId };

    set(state => ({
      activePathIds: getPathToRoot(state.nodes, leafId),
      skipNextScrollToBottom: true,
      scrollIntent,
    }));
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
    const leafId = getDeepestLeafId(nodes, nextAssistantId);
    const scrollIntent: Ui1ScrollIntent = {
      kind: 'anchor',
      nodeId,
      offsetBefore: readUi1AnchorOffset(nodeId),
    };
    set(state => ({
      activePathIds: getPathToRoot(state.nodes, leafId),
      skipNextScrollToBottom: true,
      scrollIntent,
    }));
  },

  sendMessage: async (content: string, options?: SendMessageOptions) => {
    const trimmed = content.trim();
    if (!trimmed) return null;
    if (get().isStreaming) return null;

    const existingUserId = options?.existingUserId;
    if (existingUserId) {
      const existing = get().nodes[existingUserId];
      if (!existing || existing.role !== 'user') return null;
    }

    const createdAt = Date.now();
    const initialParentId =
      options?.parentId ??
      get().activePathIds[get().activePathIds.length - 1] ??
      ROOT_ID;

    let userId = existingUserId ?? uuidv4();
    let assistantId = uuidv4();

    set(state => {
      const nodes = { ...state.nodes };

      if (existingUserId) {
        const existingUser = nodes[existingUserId];
        if (!existingUser || existingUser.role !== 'user') return state;

        // Prefer the latest assistant under this user (latest-only policy).
        const existingAssistantId =
          existingUser.childIds[existingUser.childIds.length - 1];
        const existingAssistant = existingAssistantId
          ? nodes[existingAssistantId]
          : undefined;

        if (existingAssistant && existingAssistant.role === 'assistant') {
          assistantId = existingAssistant.id;
        } else {
          addNode(nodes, {
            id: assistantId,
            role: 'assistant',
            content: '',
            parentId: existingUserId,
            childIds: [],
            createdAt: createdAt + 1,
          });
        }

        nodes[existingUserId] = {
          ...existingUser,
          content: trimmed,
        };
        userId = existingUserId;
      } else {
        addNode(nodes, {
          id: userId,
          role: 'user',
          content: trimmed,
          parentId: initialParentId,
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
      }

      return {
        nodes,
        activePathIds: getPathToRoot(nodes, assistantId),
        isStreaming: true,
        error: null,
        skipNextScrollToBottom: false,
        scrollIntent: { kind: 'pinUser', userId },
      };
    });

    try {
      const { nodes } = get();
      const pathToUser = getPathToRoot(nodes, userId);
      const messages = getMessagesForApi(nodes, pathToUser);
      const streamBuffer = createAssistantStreamBuffer(set, assistantId);

      try {
        await streamAssistantText({
          messages,
          onTextDelta: streamBuffer.push,
        });
      } finally {
        streamBuffer.flush();
      }
      set({ isStreaming: false });
      return { userId, assistantId };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      set({ isStreaming: false, error: message });
      return null;
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
        skipNextScrollToBottom: false,
        scrollIntent: { kind: 'pinUser', userId },
      };
    });

    try {
      const { nodes } = get();
      const pathToUser = getPathToRoot(nodes, userId);
      const messages = getMessagesForApi(nodes, pathToUser);
      const streamBuffer = createAssistantStreamBuffer(set, assistantId);

      try {
        await streamAssistantText({
          messages,
          onTextDelta: streamBuffer.push,
        });
      } finally {
        streamBuffer.flush();
      }
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
        skipNextScrollToBottom: false,
        scrollIntent: { kind: 'pinUser', userId: parentUserId },
      };
    });

    try {
      const { nodes } = get();
      const pathToUser = getPathToRoot(nodes, parentUserId);
      const messages = getMessagesForApi(nodes, pathToUser);
      const streamBuffer = createAssistantStreamBuffer(set, assistantId);

      try {
        await streamAssistantText({
          messages,
          onTextDelta: streamBuffer.push,
        });
      } finally {
        streamBuffer.flush();
      }
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

