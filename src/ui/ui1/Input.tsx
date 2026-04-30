'use client';

import { useCallback, useRef, useState } from 'react';
import { useConversationStore } from '@/store/conversationStore';

export function Input() {
  const sendMessage = useConversationStore(s => s.sendMessage);
  const isStreaming = useConversationStore(s => s.isStreaming);

  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const onSubmit = useCallback(async () => {
    const content = value.trim();
    if (!content) return;
    setValue('');
    textareaRef.current?.focus();
    await sendMessage(content);
  }, [sendMessage, value]);

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void onSubmit();
          }
        }}
        placeholder="Type a message…"
        disabled={isStreaming}
        rows={1}
        className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 disabled:bg-zinc-100"
      />
      <button
        onClick={() => void onSubmit()}
        disabled={isStreaming || value.trim().length === 0}
        className="h-[44px] shrink-0 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        Send
      </button>
    </div>
  );
}

