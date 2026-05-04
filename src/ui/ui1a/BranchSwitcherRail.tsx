'use client';

export function BranchSwitcherRail({
  align,
  children,
}: {
  align: 'left' | 'right';
  children: React.ReactNode;
}) {
  return (
    <div className="relative mb-1.5 mt-0.5 flex w-full min-w-0 items-center">
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200/90"
        aria-hidden
      />
      <div
        className={`relative z-[1] flex w-full min-w-0 ${
          align === 'right' ? 'justify-end' : 'justify-start'
        }`}
      >
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/85 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-500 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
