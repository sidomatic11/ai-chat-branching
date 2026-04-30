'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useConversationStore } from '@/store/conversationStore';
import { Input } from '../ui1/Input';
import { MessageBubble } from '../ui1/MessageBubble';

export function ChatViewUi2() {
  const nodes = useConversationStore(s => s.nodes);
  const activePathIds = useConversationStore(s => s.activePathIds);
  const isStreaming = useConversationStore(s => s.isStreaming);
  const error = useConversationStore(s => s.error);
  const clearError = useConversationStore(s => s.clearError);

  const messages = useMemo(() => {
    return activePathIds
      .map(id => nodes[id])
      .filter(Boolean)
      .filter(n => n.role !== 'root');
  }, [activePathIds, nodes]);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isStreaming]);

  return (
    <div className="relative h-dvh bg-zinc-950 text-zinc-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.10),transparent_55%)]" />

      <div className="relative flex h-dvh flex-col">
        <header className="border-b border-white/10 bg-white/5 backdrop-blur">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3">
            <div className="text-sm font-medium tracking-wide">Branching Chat Prototype</div>
            {isStreaming ? <div className="text-xs text-white/60">Streaming…</div> : null}
          </div>
        </header>

        {error ? (
          <div className="border-b border-red-500/20 bg-red-500/10">
            <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-2">
              <div className="text-sm text-red-200">{error}</div>
              <button
                className="text-sm font-medium text-red-100 underline"
                onClick={clearError}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-4 py-6">
            <div className="flex flex-col gap-4">
              {messages.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
                  Send a message to start. Use{' '}
                  <span className="font-medium text-white/90">Edit</span> or{' '}
                  <span className="font-medium text-white/90">Regenerate</span> to create
                  branches.
                </div>
              ) : null}

              {messages.map(node => (
                <div key={node.id} className="rounded-2xl bg-white/5 p-[1px]">
                  <div className="rounded-2xl bg-zinc-950/60 p-0.5">
                    <MessageBubble nodeId={node.id} />
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>
        </main>

        <div className="border-t border-white/10 bg-white/5 backdrop-blur">
          <div className="mx-auto w-full max-w-4xl px-4 py-3">
            <Input />
          </div>
        </div>
      </div>
    </div>
  );
}

