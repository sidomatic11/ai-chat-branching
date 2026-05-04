'use client';

import { useMemo } from 'react';
import { useConversationStore } from '@/store/conversationStore';
import { BranchSwitcherRail } from './BranchSwitcherRail';

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

  if (total <= 1) return null;

  return (
    <BranchSwitcherRail align={align}>
      <button
        type="button"
        className="grid size-6 place-items-center rounded-md hover:bg-slate-900/[0.05]"
        onClick={() => navigateSibling(userId, 'prev')}
        aria-label="Previous assistant branch"
      >
        <span className="material-symbols-rounded text-[16px]">chevron_left</span>
      </button>
      <span className="tabular-nums">
        {index + 1} / {total}
      </span>
      <button
        type="button"
        className="grid size-6 place-items-center rounded-md hover:bg-slate-900/[0.05]"
        onClick={() => navigateSibling(userId, 'next')}
        aria-label="Next assistant branch"
      >
        <span className="material-symbols-rounded text-[16px]">chevron_right</span>
      </button>
    </BranchSwitcherRail>
  );
}

