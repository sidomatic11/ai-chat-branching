'use client';

import { useMemo } from 'react';
import { useConversationStore } from '@/store/conversationStore';

export function SiblingNav({ userId }: { userId: string }) {
  const nodes = useConversationStore(s => s.nodes);
  const activePathIds = useConversationStore(s => s.activePathIds);
  const navigateSibling = useConversationStore(s => s.navigateSibling);

  const { index, total } = useMemo(() => {
    const user = nodes[userId];
    if (!user) return { index: 0, total: 0 };
    const assistantIds = user.childIds;
    const total = assistantIds.length;
    if (total <= 1) return { index: 0, total };

    const activeAssistantId =
      activePathIds.findLast?.(id => assistantIds.includes(id)) ??
      [...activePathIds].reverse().find(id => assistantIds.includes(id));

    const idx = activeAssistantId ? assistantIds.indexOf(activeAssistantId) : 0;
    return { index: Math.max(0, idx), total };
  }, [activePathIds, nodes, userId]);

  if (total <= 1) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-zinc-600">
      <button
        className="rounded-md border border-zinc-200 bg-white px-2 py-1 hover:bg-zinc-50"
        onClick={() => navigateSibling(userId, 'prev')}
      >
        &lt;
      </button>
      <span className="tabular-nums">
        {index + 1} / {total}
      </span>
      <button
        className="rounded-md border border-zinc-200 bg-white px-2 py-1 hover:bg-zinc-50"
        onClick={() => navigateSibling(userId, 'next')}
      >
        &gt;
      </button>
    </div>
  );
}

