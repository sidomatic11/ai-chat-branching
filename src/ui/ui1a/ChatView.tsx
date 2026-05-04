'use client';

import { useMemo, useRef } from 'react';
import { UI1_SCROLL_CONTAINER_ID, useConversationStore } from '@/store/conversationStore';
import { useUi1MainScroll } from '@/ui/ui1-shared/useUi1MainScroll';
import { Input } from './Input';
import { MessageBubble } from './MessageBubble';

function SidebarRectPlaceholder() {
  return (
    <span
      className="block h-[18px] w-[22px] shrink-0 rounded-md bg-slate-400/35"
      aria-hidden
    />
  );
}

export function ChatViewUi1a() {
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

  const mainRef = useRef<HTMLElement | null>(null);
  useUi1MainScroll(mainRef, activePathIds);

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50 text-slate-900">
      <aside className="hidden w-12 shrink-0 flex-col items-center justify-between border-r border-slate-200/60 bg-slate-100 py-3 text-slate-600 sm:flex">
        <div className="flex flex-col items-center gap-4">
          {Array.from({ length: 8 }, (_, i) => (
            <button
              key={i}
              type="button"
              className="grid size-6 place-items-center rounded-md hover:bg-slate-900/[0.06]"
              aria-label={`Sidebar placeholder ${i + 1}`}
            >
              <SidebarRectPlaceholder />
            </button>
          ))}
        </div>
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            className="grid size-6 place-items-center rounded-md hover:bg-slate-900/[0.06]"
            aria-label="Sidebar placeholder bottom"
          >
            <SidebarRectPlaceholder />
          </button>
          <div className="grid size-6 place-items-center rounded-md" aria-hidden>
            <SidebarRectPlaceholder />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="h-11 shrink-0 bg-slate-50">
          <div className="flex h-full items-center justify-between px-3">
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-slate-800 hover:bg-slate-900/[0.04]"
            >
              <span className="truncate">Branching Chat Prototype</span>
              <span className="material-symbols-rounded text-[17px] text-slate-500">
                expand_more
              </span>
            </button>
            <button
              type="button"
              aria-label="Share placeholder"
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200/90 bg-white/80 px-3 py-2 shadow-sm hover:bg-white"
            >
              <span
                className="block h-2 w-10 shrink-0 rounded-sm bg-slate-400/40"
                aria-hidden
              />
            </button>
          </div>
        </header>

        {error ? (
          <div className="border-y border-red-200 bg-red-50">
            <div className="mx-auto flex w-full max-w-[724px] items-center justify-between gap-3 px-4 py-2">
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

        <main
          ref={mainRef}
          id={UI1_SCROLL_CONTAINER_ID}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto flex min-h-full w-full max-w-[724px] flex-col px-4 pb-52 pt-10 sm:px-6">
            {/* Top-aligned thread: bottom-anchored flex fights pin-to-top + branch scroll compensation. */}
            <div className="flex flex-col gap-7">
              {messages.length === 0 ? (
                <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-dashed border-slate-200 bg-white/60 p-5 text-center text-sm leading-6 text-slate-600">
                  Send a message to start. Use <span className="font-medium text-slate-700">Edit</span>{' '}
                  or <span className="font-medium text-slate-700">Regenerate</span> to create branches.
                </div>
              ) : (
                <div className="text-[11px] leading-none text-slate-500">
                  Prototype chat data from your local branching conversation
                </div>
              )}

              {messages.map(node => (
                <MessageBubble key={node.id} nodeId={node.id} />
              ))}
              {isStreaming ? (
                <div className="text-xs text-slate-500">Response streaming…</div>
              ) : null}
            </div>
          </div>
        </main>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-slate-50 via-slate-50 to-slate-50/0 pt-12 sm:left-12">
          <div className="mx-auto w-full max-w-[752px] px-4 pb-4 sm:px-6">
            <div className="pointer-events-auto flex w-full flex-col gap-2.5">
              <Input />
              <p className="mx-auto w-full max-w-[724px] text-center text-[11px] leading-snug text-slate-500">
                This is a demo prototype. All chat features are not supported.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

