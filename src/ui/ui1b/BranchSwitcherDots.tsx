'use client';

import type { ReactNode } from 'react';
import { useConversationStore } from '@/store/conversationStore';

export function BranchSwitcherDots({
  align,
  activeIndex,
  branchCount,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  /** Tighter vertical spacing when embedded in a header row (e.g. UI2 linear). */
  dense = false,
  /** Render after the next chevron (e.g. collapse control); line spans full width of this component. */
  trailing,
}: {
  align: 'left' | 'right';
  activeIndex: number;
  branchCount: number;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  dense?: boolean;
  trailing?: ReactNode;
}) {
  const isStreaming = useConversationStore(s => s.isStreaming);

  if (branchCount <= 1) return null;

  const clusterAlign = align === 'right' ? 'ml-auto' : '';

  const arrowBtn = [
    'grid size-7 shrink-0 cursor-pointer place-items-center rounded-md border border-slate-200/90 bg-slate-100 text-slate-600',
    // Hidden until an ancestor with `group` is hovered (the message bubble below).
    'pointer-events-none opacity-0 transition-opacity',
    'group-hover:pointer-events-auto group-hover:opacity-100',
    'hover:bg-slate-200/90 disabled:cursor-not-allowed disabled:opacity-40',
  ].join(' ');

  return (
    <div
      className={[
        'relative flex h-6 w-full min-w-0 items-center',
        dense ? 'mb-0 mt-0' : 'mb-2 mt-0.5',
      ].join(' ')}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200/90"
        aria-hidden
      />
      <div
        className={['relative z-[1] flex min-w-0 items-center gap-2', clusterAlign].join(' ')}
      >
        <button
          type="button"
          disabled={isStreaming}
          onClick={onPrev}
          aria-label={prevLabel}
          className={arrowBtn}
        >
          <span className="material-symbols-rounded text-[18px] leading-none">chevron_left</span>
        </button>
        <div
          className="flex items-center gap-2 px-0.5"
          aria-label={`${branchCount} branches`}
        >
          {Array.from({ length: branchCount }, (_, i) => (
            <span
              key={i}
              className={[
                'size-1.5 shrink-0 rounded-full bg-slate-300 transition-colors',
                i === activeIndex ? 'group-hover:bg-slate-700' : '',
              ].join(' ')}
              aria-hidden
            />
          ))}
        </div>
        <button
          type="button"
          disabled={isStreaming}
          onClick={onNext}
          aria-label={nextLabel}
          className={arrowBtn}
        >
          <span className="material-symbols-rounded text-[18px] leading-none">chevron_right</span>
        </button>
        {trailing ? <div className="flex shrink-0 items-center">{trailing}</div> : null}
      </div>
    </div>
  );
}
