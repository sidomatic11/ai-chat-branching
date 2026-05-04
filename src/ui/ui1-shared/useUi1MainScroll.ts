'use client';

import { useLayoutEffect, type RefObject } from 'react';
import {
  UI1_SCROLL_CONTAINER_ID,
  useConversationStore,
} from '@/store/conversationStore';

/** Match `scroll-mt-14` on message rows (clear fixed FloatingMenu). */
const PIN_TOP_MARGIN_PX = 56;

function alignElementTopBelowScrollPadding(
  el: HTMLElement,
  container: HTMLElement,
  marginTopPx: number,
) {
  const cr = container.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  const delta = er.top - cr.top - marginTopPx;
  if (Math.abs(delta) < 0.5) return;
  container.scrollTop += delta;
}

function clearScrollIntentAfterFrame(
  hadIntent: 'pinUser' | 'anchor',
  intentUserId: string | undefined,
  intentNodeId: string | undefined,
) {
  queueMicrotask(() => {
    useConversationStore.setState(s => {
      const cur = s.scrollIntent;
      if (hadIntent === 'pinUser') {
        if (cur?.kind === 'pinUser' && cur.userId === intentUserId) {
          return { scrollIntent: null, skipNextScrollToBottom: false };
        }
        return {};
      }
      if (cur?.kind === 'anchor' && cur.nodeId === intentNodeId) {
        return { scrollIntent: null, skipNextScrollToBottom: false };
      }
      return {};
    });
  });
}

/**
 * Pin-latest-user + stable branch scroll for UI1 chat (`main` scrollport).
 * Clears `scrollIntent` / legacy `skipNextScrollToBottom` after handling.
 */
export function useUi1MainScroll(
  mainRef: RefObject<HTMLElement | null>,
  activePathIds: string[],
) {
  const pathKey = activePathIds.join();

  useLayoutEffect(() => {
    const container =
      mainRef.current ?? document.getElementById(UI1_SCROLL_CONTAINER_ID);
    if (!container) return;

    const state = useConversationStore.getState();
    const intent = state.scrollIntent;

    if (intent?.kind === 'pinUser') {
      const el = container.querySelector(
        `[data-message-id="${intent.userId}"]`,
      );
      if (el instanceof HTMLElement) {
        alignElementTopBelowScrollPadding(el, container, PIN_TOP_MARGIN_PX);
      }
      clearScrollIntentAfterFrame('pinUser', intent.userId, undefined);
      return;
    }

    if (intent?.kind === 'anchor') {
      const el = container.querySelector(`[data-message-id="${intent.nodeId}"]`);
      if (el instanceof HTMLElement) {
        if (intent.offsetBefore != null) {
          const cr = container.getBoundingClientRect();
          const er = el.getBoundingClientRect();
          const offsetAfter = er.top - cr.top;
          container.scrollTop += intent.offsetBefore - offsetAfter;
        } else {
          alignElementTopBelowScrollPadding(el, container, PIN_TOP_MARGIN_PX);
        }
      }
      clearScrollIntentAfterFrame('anchor', undefined, intent.nodeId);
      return;
    }

    if (state.skipNextScrollToBottom) {
      useConversationStore.setState({ skipNextScrollToBottom: false });
    }
  }, [pathKey]);
}
