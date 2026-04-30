'use client';

import { useMemo } from 'react';
import { useConversationStore } from '@/store/conversationStore';

export function UserBranchNav({ userId }: { userId: string }) {
  const nodes = useConversationStore(s => s.nodes);
  const navigateUserBranch = useConversationStore(s => s.navigateUserBranch);

  const { index, total } = useMemo(() => {
    const user = nodes[userId];
    if (!user || user.role !== 'user') return { index: 0, total: 0 };

    const parentId = user.parentId ?? 'root';
    const parent = nodes[parentId];
    if (!parent) return { index: 0, total: 0 };

    const userSiblingIds = parent.childIds.filter(id => nodes[id]?.role === 'user');
    const total = userSiblingIds.length;
    if (total <= 1) return { index: 0, total };

    const idx = userSiblingIds.indexOf(userId);
    return { index: Math.max(0, idx), total };
  }, [nodes, userId]);

  if (total <= 1) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-white/80">
      <button
        className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
        onClick={() => navigateUserBranch(userId, 'prev')}
      >
        &lt;
      </button>
      <span className="tabular-nums">
        {index + 1} / {total}
      </span>
      <button
        className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
        onClick={() => navigateUserBranch(userId, 'next')}
      >
        &gt;
      </button>
    </div>
  );
}

