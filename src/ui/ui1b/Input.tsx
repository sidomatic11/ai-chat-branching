'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversationStore } from '@/store/conversationStore';

export function Input() {
  const sendMessage = useConversationStore(s => s.sendMessage);
  const isStreaming = useConversationStore(s => s.isStreaming);

  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      // Textarea was disabled during streaming; restore focus for the next message.
      textareaRef.current?.focus();
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const onSubmit = useCallback(async () => {
    const content = value.trim();
    if (!content) return;
    setValue('');
    textareaRef.current?.focus();
    await sendMessage(content);
  }, [sendMessage, value]);

  return (
    <div className="w-full rounded-3xl border border-slate-200/90 bg-white shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4 px-4 pb-3 pt-4 sm:px-5 sm:pb-3.5 sm:pt-5">
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
          placeholder="Write a message..."
          disabled={isStreaming}
          rows={1}
          className="max-h-36 min-h-[28px] w-full resize-none bg-transparent text-[15px] leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
        />

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-full text-slate-600 hover:bg-slate-900/[0.05]"
            aria-label="Attach placeholder"
          >
            <span className="material-symbols-rounded text-[22px] font-light">add</span>
          </button>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              className="flex max-w-[min(52vw,14rem)] items-center gap-0.5 rounded-lg py-1 pl-2 pr-1.5 text-left text-[13px] text-slate-600 hover:bg-slate-900/[0.04] sm:max-w-none"
              aria-label="Model: gemini 2.5 flash"
            >
              <span className="truncate">gemini 2.5 flash</span>
              <span className="material-symbols-rounded shrink-0 text-[18px] text-slate-500">
                expand_more
              </span>
            </button>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full text-slate-600 hover:bg-slate-900/[0.05]"
              aria-label="Voice placeholder"
            >
              <span className="material-symbols-rounded text-[20px]">graphic_eq</span>
            </button>
            <button
              type="button"
              onClick={() => void onSubmit()}
              disabled={isStreaming || value.trim().length === 0}
              className="grid size-9 place-items-center rounded-full bg-slate-400 text-white shadow-sm hover:bg-slate-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              aria-label="Send message"
            >
              <span className="material-symbols-rounded text-[22px]">arrow_upward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
