'use client';

import { useEffect, useState } from 'react';
import { FloatingMenu } from '@/ui/FloatingMenu';
import { ChatViewUi1 } from '@/ui/ui1/ChatView';
import { ChatViewUi2 } from '@/ui/ui2/ChatView';
import { useUiStore } from '@/store/uiStore';

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

