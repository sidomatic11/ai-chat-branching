# Branching chat prototype (Next.js + Zustand)

A small Next.js app for prototyping **branching conversation UX patterns** (similar to Claude’s chat branching).

**Core constraint**: all conversation tree + streaming logic lives in the Zustand store (`src/store/conversationStore.ts`). UI experiments live under `src/ui/`* and must only read state + call actions.

## Getting Started

### 1) Install

```bash
npm install
```

### 2) Configure environment

Create `.env.local`:

```bash
GOOGLE_GENERATIVE_AI_API_KEY=...
GOOGLE_GEMINI_MODEL=gemini-2.5-flash
```

`GOOGLE_GEMINI_MODEL` is optional (defaults to `gemini-2.5-flash`).

### 3) Run the dev server

```bash
npm run dev
```

Open `http://localhost:3000`.

## How to use (reference UI)

- **Send**: type in the input and press Enter (Shift+Enter = newline).
- **Edit + resend**: click **Edit** on a user message → change text → **Resend**.
This creates a **new branch** (a new user sibling + a new assistant response).
- **Navigate user branches**: on a user message that has been edited/resend multiple times, use the **upper** `< 2 / 3 >` control next to that user message to switch between the different user-sibling branches created at that point.
- **Regenerate**: click **Regenerate** on an assistant message.
This creates an **additional assistant variant** under the same user message.
- **Navigate assistant variants**: on a user message, use the **lower** `< 2 / 3 >` control to switch between assistant variants (only appears after you’ve regenerated at least once).
Switching updates the active path immediately.

## Project layout

```text
src/
  store/
    conversationStore.ts       # all tree + streaming logic (no JSX/UI imports)
  app/
    api/
      chat/
        route.ts               # server-side Gemini streaming (API key stays server-only)
    page.tsx                   # mounts the active UI experiment
  ui/
    default/                   # reference UI harness
      ChatView.tsx
      MessageBubble.tsx
      SiblingNav.tsx
      Input.tsx
    experiment-a/              # placeholder alternate UI (swap it into page.tsx)
      ChatView.tsx
```

## Notes

- **Persistence**: `nodes` + `activePathIds` autosave to `localStorage` (debounced). Clear site data to reset.
- **Streaming**: the client manually consumes the server stream with `TextDecoder` and updates the assistant node’s `content` incrementally.
- **No client API key**: calls go through `src/app/api/chat/route.ts`.

## Verification

```bash
npm run lint
npm run build
```

