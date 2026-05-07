'use client';

import { useConversationStore } from '@/store/conversationStore';
import { BranchingCanvas } from '@/ui/ui2/BranchingCanvas';

export function ChatViewUi2() {
  const isStreaming = useConversationStore(s => s.isStreaming);
  const error = useConversationStore(s => s.error);
  const clearError = useConversationStore(s => s.clearError);
  const clearConversation = useConversationStore(s => s.clearConversation);

  return (
    <div className="relative h-dvh bg-zinc-950 text-zinc-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.10),transparent_55%)]" />

      <div className="relative flex h-dvh min-h-0 flex-col">
        <header className="shrink-0 border-b border-white/10 bg-white/5 backdrop-blur">
          <div className="mx-auto flex h-[60px] w-full max-w-4xl items-center px-4">
            <div className="flex-1" aria-hidden />
            <div className="shrink-0 text-center text-sm font-medium tracking-wide">
              Branching Chat Prototype (UI2)
            </div>
            <div className="flex flex-1 justify-end">
              {isStreaming ? (
                <div className="text-xs text-white/60">Streaming…</div>
              ) : (
                <button
                  type="button"
                  onClick={clearConversation}
                  className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/75 hover:bg-white/10 hover:text-white"
                >
                  Clear chat
                </button>
              )}
            </div>
          </div>
        </header>

        {error ? (
          <div className="shrink-0 border-b border-red-500/20 bg-red-500/10">
            <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-2">
              <div className="text-sm text-red-200">{error}</div>
              <button
                type="button"
                className="text-sm font-medium text-red-100 underline"
                onClick={clearError}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <main className="flex min-h-0 flex-1 flex-col">
          <BranchingCanvas />
        </main>
      </div>
    </div>
  );
}

