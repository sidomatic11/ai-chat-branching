'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { FloatingMenu } from '@/ui/FloatingMenu';
import { useUiStore } from '@/store/uiStore';

const ChatViewUi1 = dynamic(
  () => import('@/ui/ui1/ChatView').then(mod => mod.ChatViewUi1),
  {
    loading: () => (
      <div className="flex h-dvh items-center justify-center bg-zinc-50 text-sm text-zinc-600">
        Loading…
      </div>
    ),
  },
);

const ChatViewUi2 = dynamic(
  () => import('@/ui/ui2/ChatView').then(mod => mod.ChatViewUi2),
  {
    loading: () => (
      <div className="flex h-dvh items-center justify-center bg-zinc-50 text-sm text-zinc-600">
        Loading…
      </div>
    ),
  },
);

export function ClientRoot() {
  const [mounted, setMounted] = useState(false);
  const activeUi = useUiStore(s => s.activeUi);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- avoid hydration mismatch when client state loads from localStorage
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-dvh items-center justify-center bg-zinc-50 text-sm text-zinc-600">
        Loading…
      </div>
    );
  }

  return (
    <>
      <FloatingMenu />
      {activeUi === 'ui2' ? <ChatViewUi2 /> : <ChatViewUi1 />}
    </>
  );
}

