'use client';

import { useState } from 'react';
import { useConversationStore } from '@/store/conversationStore';
import { AssistantMarkdown } from '@/ui/AssistantMarkdown';
import { SiblingNav } from './SiblingNav';
import { UserBranchNav } from './UserBranchNav';

export function MessageBubble({ nodeId }: { nodeId: string }) {
  const nodes = useConversationStore(s => s.nodes);
  const node = nodes[nodeId];
  const isStreaming = useConversationStore(s => s.isStreaming);
  const editAndResend = useConversationStore(s => s.editAndResend);
  const regenerate = useConversationStore(s => s.regenerate);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!node) return null;

  const isUser = node.role === 'user';
  const isAssistant = node.role === 'assistant';
  const parentUserId =
    isAssistant && node.parentId ? (nodes[node.parentId]?.role === 'user' ? node.parentId : null) : null;

  return (
    <div
      data-message-id={node.id}
      className={[
        // `group` so branch dots/arrows respond to hover anywhere on this message (wireframe: trigger is full bubble).
        'scroll-mt-14',
        'group flex w-full min-w-0 flex-col',
        isUser ? 'items-end' : 'items-stretch',
      ].join(' ')}
    >
      {isUser ? <UserBranchNav userId={node.id} align="right" /> : null}
      {isAssistant && parentUserId ? (
        <SiblingNav userId={parentUserId} align="left" />
      ) : null}
      <div
        className={[
          isUser
            ? 'max-w-[78%] rounded-xl bg-slate-200 px-4 py-2 text-slate-800'
            : 'w-full max-w-none text-slate-900',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isUser && isEditing ? (
              <div className="mt-2 flex flex-col gap-2">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-900/[0.05]"
                    onClick={() => {
                      setIsEditing(false);
                      setDraft('');
                    }}
                    disabled={isStreaming}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
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
              <div
                className={[
                  'break-words text-[14px] leading-7',
                  isUser ? 'whitespace-pre-wrap' : '',
                ].join(' ')}
              >
                {node.content.length > 0 ? (
                  isAssistant ? (
                    <AssistantMarkdown content={node.content} variant="prose" />
                  ) : (
                    <span className="whitespace-pre-wrap">{node.content}</span>
                  )
                ) : isAssistant && isStreaming ? (
                  <span className="opacity-70">…</span>
                ) : (
                  <span className="opacity-50">(empty)</span>
                )}
              </div>
            )}

            {isAssistant && node.content.length > 0 && !isStreaming ? (
              <div className="mt-2.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  type="button"
                  className="grid size-6 cursor-default place-items-center rounded text-slate-600"
                  aria-label="Copy message"
                  onClick={() => void navigator.clipboard.writeText(node.content)}
                >
                  <span className="material-symbols-rounded text-[12px]">content_copy</span>
                </button>
                <button
                  type="button"
                  className="grid size-6 cursor-default place-items-center rounded text-slate-600"
                  aria-label="Upvote (placeholder)"
                >
                  <span className="material-symbols-rounded text-[12px]">thumb_up</span>
                </button>
                <button
                  type="button"
                  className="grid size-6 cursor-default place-items-center rounded text-slate-600"
                  aria-label="Downvote (placeholder)"
                >
                  <span className="material-symbols-rounded text-[12px]">thumb_down</span>
                </button>
                <button
                  type="button"
                  title="Regenerate response"
                  className="grid size-6 cursor-pointer place-items-center rounded text-slate-600 hover:bg-slate-900/[0.06]"
                  aria-label="Regenerate response"
                  onClick={() => void regenerate(node.id)}
                >
                  <span className="material-symbols-rounded text-[12px]">refresh</span>
                </button>
              </div>
            ) : null}
          </div>

          {isUser ? (
            <div className="flex shrink-0 flex-col items-end gap-2">
              <button
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 opacity-0 hover:bg-slate-900/[0.05] group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-40"
                disabled={isStreaming}
                onClick={() => {
                  setIsEditing(v => !v);
                  setDraft(node.content);
                }}
              >
                Edit
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

