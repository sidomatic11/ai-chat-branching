'use client';

import { useState } from 'react';
import { useConversationStore } from '@/store/conversationStore';
import { SiblingNav } from './SiblingNav';
import { UserBranchNav } from './UserBranchNav';

export function MessageBubble({ nodeId }: { nodeId: string }) {
  const node = useConversationStore(s => s.nodes[nodeId]);
  const isStreaming = useConversationStore(s => s.isStreaming);
  const editAndResend = useConversationStore(s => s.editAndResend);
  const regenerate = useConversationStore(s => s.regenerate);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!node) return null;

  const isUser = node.role === 'user';
  const isAssistant = node.role === 'assistant';

  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={[
          'w-full max-w-[85%] rounded-2xl border px-4 py-3',
          isUser
            ? 'border-zinc-200 bg-zinc-900 text-white'
            : 'border-zinc-200 bg-white text-zinc-950',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium opacity-70">
              {isUser ? 'User' : 'Assistant'}
            </div>

            {isUser && isEditing ? (
              <div className="mt-2 flex flex-col gap-2">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-zinc-500"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 hover:text-white"
                    onClick={() => {
                      setIsEditing(false);
                      setDraft('');
                    }}
                    disabled={isStreaming}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-60"
                    onClick={() => {
                      void editAndResend(node.id, draft);
                      setIsEditing(false);
                      setDraft('');
                    }}
                    disabled={isStreaming || draft.trim().length === 0}
                  >
                    Resend
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                {node.content.length > 0 ? (
                  node.content
                ) : isAssistant && isStreaming ? (
                  <span className="opacity-70">…</span>
                ) : (
                  <span className="opacity-50">(empty)</span>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {isUser ? (
              <button
                className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white/90 hover:bg-white/15 disabled:opacity-50"
                disabled={isStreaming}
                onClick={() => {
                  setIsEditing(v => !v);
                  setDraft(node.content);
                }}
              >
                Edit
              </button>
            ) : isAssistant ? (
              <button
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                disabled={isStreaming}
                onClick={() => void regenerate(node.id)}
              >
                Regenerate
              </button>
            ) : null}

            {isUser ? (
              <div className="flex flex-col items-end gap-2">
                <UserBranchNav userId={node.id} />
                <SiblingNav userId={node.id} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

