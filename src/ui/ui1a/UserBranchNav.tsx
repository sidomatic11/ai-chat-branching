'use client';

import { useMemo } from 'react';
import { useConversationStore } from '@/store/conversationStore';
import { BranchSwitcherRail } from './BranchSwitcherRail';

export function UserBranchNav({
  userId,
  align,
}: {
  userId: string;
  align: 'left' | 'right';
}) {
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
    <BranchSwitcherRail align={align}>
      <button
        type="button"
        className="grid size-6 place-items-center rounded-md hover:bg-slate-900/[0.05]"
        onClick={() => navigateUserBranch(userId, 'prev')}
        aria-label="Previous user branch"
      >
        <span className="material-symbols-rounded text-[16px]">chevron_left</span>
      </button>
      <span className="tabular-nums">
        {index + 1} / {total}
      </span>
      <button
        type="button"
        className="grid size-6 place-items-center rounded-md hover:bg-slate-900/[0.05]"
        onClick={() => navigateUserBranch(userId, 'next')}
        aria-label="Next user branch"
      >
        <span className="material-symbols-rounded text-[16px]">chevron_right</span>
      </button>
    </BranchSwitcherRail>
  );
}

