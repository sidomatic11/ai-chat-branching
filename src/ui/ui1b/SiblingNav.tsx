'use client';

import { useMemo } from 'react';
import { useConversationStore } from '@/store/conversationStore';
import { BranchSwitcherDots } from './BranchSwitcherDots';

export function SiblingNav({
  userId,
  align,
}: {
  userId: string;
  align: 'left' | 'right';
}) {
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

  return (
    <BranchSwitcherDots
      align={align}
      activeIndex={index}
      branchCount={total}
      onPrev={() => navigateSibling(userId, 'prev')}
      onNext={() => navigateSibling(userId, 'next')}
      prevLabel="Previous assistant branch"
      nextLabel="Next assistant branch"
    />
  );
}
