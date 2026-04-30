'use client';

import { useConversationStore } from '@/store/conversationStore';
import { useUiStore } from '@/store/uiStore';

export function FloatingMenu() {
  const isStreaming = useConversationStore(s => s.isStreaming);
  const clearConversation = useConversationStore(s => s.clearConversation);
  const activeUi = useUiStore(s => s.activeUi);
  const setActiveUi = useUiStore(s => s.setActiveUi);

  return (
    <div className="fixed left-4 top-4 z-50">
      <div className="rounded-xl border border-zinc-200 bg-white/90 p-1 shadow-sm backdrop-blur">
        <div className="flex items-center gap-1 p-1">
          <button
            type="button"
            disabled={isStreaming}
            onClick={() => setActiveUi('ui1')}
            className={[
              'rounded-lg px-2.5 py-1.5 text-[11px] font-medium',
              activeUi === 'ui1'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-900 hover:bg-zinc-100',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            UI1
          </button>
          <button
            type="button"
            disabled={isStreaming}
            onClick={() => setActiveUi('ui2')}
            className={[
              'rounded-lg px-2.5 py-1.5 text-[11px] font-medium',
              activeUi === 'ui2'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-900 hover:bg-zinc-100',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            UI2
          </button>
        </div>

        <button
          type="button"
          disabled={isStreaming}
          onClick={clearConversation}
          className="w-full rounded-lg px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear chat
        </button>
      </div>
    </div>
  );
}

