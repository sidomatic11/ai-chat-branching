'use client';

import { useMemo } from 'react';
import { useConversationStore } from '@/store/conversationStore';
import { BranchSwitcherDots } from './BranchSwitcherDots';

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

  return (
    <BranchSwitcherDots
      align={align}
      activeIndex={index}
      branchCount={total}
      onPrev={() => navigateUserBranch(userId, 'prev')}
      onNext={() => navigateUserBranch(userId, 'next')}
      prevLabel="Previous user branch"
      nextLabel="Next user branch"
    />
  );
}
