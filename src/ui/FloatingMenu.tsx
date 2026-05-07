'use client';

import { useConversationStore } from '@/store/conversationStore';
import { useUiStore } from '@/store/uiStore';

export function FloatingMenu() {
  const isStreaming = useConversationStore(s => s.isStreaming);
  const clearConversation = useConversationStore(s => s.clearConversation);
  const activeUi = useUiStore(s => s.activeUi);
  const setActiveUi = useUiStore(s => s.setActiveUi);

  if (process.env.NODE_ENV !== 'development') return null;

  const chip = (active: boolean) =>
    [
      'rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap',
      active ? 'bg-zinc-900 text-white' : 'text-zinc-900 hover:bg-zinc-100',
      'disabled:cursor-not-allowed disabled:opacity-50',
    ].join(' ');

  return (
    <div className="group fixed left-1/2 top-0 z-50 -translate-x-1/2">
      {/* Hide menu except a 8px "tab"; slide in on hover/focus. */}
      <div className="translate-y-[calc(-100%+8px)] transition-transform duration-200 ease-out will-change-transform group-hover:translate-y-0 group-focus-within:translate-y-0">
        <div className="flex items-center gap-1 rounded-b-xl border-x border-b border-zinc-200 bg-white/90 px-1.5 pb-2.5 pt-2 shadow-sm backdrop-blur">
          <button
            type="button"
            disabled={isStreaming}
            onClick={() => setActiveUi('ui1a')}
            className={chip(activeUi === 'ui1a')}
          >
            UI 1a
          </button>
          <button
            type="button"
            disabled={isStreaming}
            onClick={() => setActiveUi('ui1b')}
            className={chip(activeUi === 'ui1b')}
          >
            UI 1b
          </button>
          <button
            type="button"
            disabled={isStreaming}
            onClick={() => setActiveUi('ui2')}
            className={chip(activeUi === 'ui2')}
          >
            UI 2
          </button>
          <button
            type="button"
            disabled={isStreaming}
            onClick={clearConversation}
            className={chip(false)}
          >
            Clear chat
          </button>
        </div>
      </div>
    </div>
  );
}
