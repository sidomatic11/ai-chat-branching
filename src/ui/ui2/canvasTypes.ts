export type ThreadLabel = 'chat' | 'original' | 'branch';

export type LivePanelState = {
  kind: 'live';
  id: string;
  headUserId: string | null;
  tailLeafId: string | null;
  attachParentId: string;
  canvasParentId: string | null;
  canvasChildIds: string[];
  threadLabel: ThreadLabel;
};

export type FrozenPanelState = {
  kind: 'frozen';
  id: string;
  throughId: string;
  canvasParentId: string | null;
  canvasChildIds: string[];
};

export type CanvasPanelState = LivePanelState | FrozenPanelState;

export type CanvasState = {
  panels: Record<string, CanvasPanelState>;
  rootPanelId: string;
};
