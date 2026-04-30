'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useConversationStore } from '@/store/conversationStore';
import { Input } from './Input';
import { MessageBubble } from './MessageBubble';

export function ChatViewUi1() {
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
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <div className="text-sm font-medium">Branching Chat Prototype</div>
          {isStreaming ? <div className="text-xs text-zinc-500">Streaming…</div> : null}
        </div>
      </header>

      {error ? (
        <div className="border-b border-red-200 bg-red-50">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2">
            <div className="text-sm text-red-800">{error}</div>
            <button
              className="text-sm font-medium text-red-900 underline"
              onClick={clearError}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <div className="flex flex-col gap-4">
            {messages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600">
                Send a message to start. Use <span className="font-medium">Edit</span>{' '}
                or <span className="font-medium">Regenerate</span> to create branches.
              </div>
            ) : null}

            {messages.map(node => (
              <MessageBubble key={node.id} nodeId={node.id} />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      </main>

      <div className="border-t border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          <Input />
        </div>
      </div>
    </div>
  );
}

