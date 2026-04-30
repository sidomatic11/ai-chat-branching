'use client';

import { useEffect, useState } from 'react';
import { ChatView } from '@/ui/default/ChatView';

export function ClientRoot() {
  const [mounted, setMounted] = useState(false);

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

  return <ChatView />;
}

