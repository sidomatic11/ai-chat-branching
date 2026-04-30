'use client';

import { useMemo } from 'react';
import { useConversationStore } from '@/store/conversationStore';

export function ChatView() {
  const nodes = useConversationStore(s => s.nodes);
  const activePathIds = useConversationStore(s => s.activePathIds);

  const stats = useMemo(() => {
    const nodeCount = Object.keys(nodes).length;
    const leafId = activePathIds[activePathIds.length - 1] ?? 'root';
    return { nodeCount, leafId, pathLength: activePathIds.length };
  }, [activePathIds, nodes]);

  return (
    <div className="flex h-dvh items-center justify-center bg-zinc-950 text-zinc-50">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-sm font-medium">Experiment A (placeholder)</div>
        <div className="mt-4 space-y-2 text-sm text-zinc-200">
          <div>
            <span className="text-zinc-400">nodes</span>: {stats.nodeCount}
          </div>
          <div>
            <span className="text-zinc-400">activeLeafId</span>: {stats.leafId}
          </div>
          <div>
            <span className="text-zinc-400">activePathLength</span>: {stats.pathLength}
          </div>
        </div>
        <div className="mt-4 text-xs text-zinc-400">
          Swap this into <code className="text-zinc-200">src/app/page.tsx</code>{' '}
          to validate UI experiments can reuse the same store.
        </div>
      </div>
    </div>
  );
}

