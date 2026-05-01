// `_node` destructures are intentional: react-markdown v10 always passes a
// hast `node` prop to components (passNode is on by default). We strip it so
// it isn't spread onto real DOM elements (would trigger a React warning).
/* eslint-disable @typescript-eslint/no-unused-vars */
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Compact element overrides for UI2's narrow message column. The spacing is
 * sized for plain assistant text while still fitting the canvas cards.
 * Inline code is detected by the absence of a `language-*` className (fenced
 * blocks always carry one); block code is styled on the wrapping <pre>.
 */
const compactComponents: Components = {
  h1: ({ node: _node, children, ...rest }) => (
    <h1
      className="mb-2.5 mt-3 text-[16px] font-semibold leading-snug text-zinc-950"
      {...rest}
    >
      {children}
    </h1>
  ),
  h2: ({ node: _node, children, ...rest }) => (
    <h2
      className="mb-2 mt-3 text-[15px] font-semibold leading-snug text-zinc-950"
      {...rest}
    >
      {children}
    </h2>
  ),
  h3: ({ node: _node, children, ...rest }) => (
    <h3
      className="mb-1.5 mt-2.5 text-[14px] font-semibold leading-snug text-zinc-900"
      {...rest}
    >
      {children}
    </h3>
  ),
  p: ({ node: _node, children, ...rest }) => (
    <p className="m-0 [&:not(:last-child)]:mb-3" {...rest}>
      {children}
    </p>
  ),
  ul: ({ node: _node, children, ...rest }) => (
    <ul className="my-2.5 list-disc pl-4" {...rest}>
      {children}
    </ul>
  ),
  ol: ({ node: _node, children, ...rest }) => (
    <ol className="my-2.5 list-decimal pl-4" {...rest}>
      {children}
    </ol>
  ),
  li: ({ node: _node, children, ...rest }) => (
    <li className="my-1" {...rest}>
      {children}
    </li>
  ),
  code: ({ node: _node, className, children, ...rest }) => {
    const isBlock = /language-/.test(className ?? '');
    if (isBlock) {
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-black/10 px-1 py-0.5 text-[12.5px]"
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre: ({ node: _node, children, ...rest }) => (
    <pre
      className="my-3 overflow-x-auto rounded bg-black/10 p-3 text-[12.5px] leading-[1.5]"
      {...rest}
    >
      {children}
    </pre>
  ),
  a: ({ node: _node, children, href, ...rest }) => (
    <a
      className="underline underline-offset-2"
      href={href}
      target="_blank"
      rel="noreferrer"
      {...rest}
    >
      {children}
    </a>
  ),
  strong: ({ node: _node, children, ...rest }) => (
    <strong className="font-semibold" {...rest}>
      {children}
    </strong>
  ),
  table: ({ node: _node, children, ...rest }) => (
    <div className="overflow-x-auto">
      <table {...rest}>{children}</table>
    </div>
  ),
  hr: ({ node: _node, ...rest }) => (
    <hr className="my-3 border-zinc-300" {...rest} />
  ),
};

/**
 * Single shared assistant-message renderer used by every UI.
 *
 * - `prose` variant relies on @tailwindcss/typography for roomy article-style
 *   layout (UI1 chat bubbles).
 * - `compact` variant ships a small components map sized for UI2's narrow
 *   canvas cards so we don't pull in Typography's article-scale spacing.
 *
 * GFM (tables, strikethrough, task lists, autolinks) is on for both. During
 * streaming callers can temporarily render plain text and let the final
 * settled message pay the markdown parse cost once.
 */
export function AssistantMarkdown({
  content,
  variant,
  streaming = false,
}: {
  content: string;
  variant: 'prose' | 'compact';
  streaming?: boolean;
}) {
  if (streaming) {
    return <span className="whitespace-pre-wrap break-words">{content}</span>;
  }

  if (variant === 'prose') {
    return (
      <div className="prose prose-sm max-w-none text-sm leading-6 prose-pre:overflow-x-auto">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    );
  }
  return (
    <div className="text-[13.5px] leading-[1.58]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={compactComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
