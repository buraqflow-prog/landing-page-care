export type WhiteboardBackground = "blank" | "grid" | "ruled";

export type WhiteboardFile = {
  id: string;
  dataURL: string;
  mimeType: string;
  created: number;
  lastRetrieved?: number;
  version?: number;
};

export type WhiteboardPage = {
  id: string;
  name: string;
  background: WhiteboardBackground;
  elements: unknown[];
  files: Record<string, WhiteboardFile>;
};

export type WhiteboardSnapshot = {
  version: 2;
  pages: WhiteboardPage[];
  activePage: number;
};

export type WhiteboardViewport = {
  panX: number;
  panY: number;
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
};

export type WhiteboardSyncMessage =
  | { kind: "snapshot"; source: string; snapshot: WhiteboardSnapshot }
  | { kind: "laser"; source: string; point: { x: number; y: number } | null }
  | { kind: "viewport_change"; source: string; viewport: WhiteboardViewport };

export function createWhiteboardSnapshot(): WhiteboardSnapshot {
  return {
    version: 2,
    activePage: 0,
    pages: [{ id: "page-1", name: "صفحة 1", background: "grid", elements: [], files: {} }],
  };
}

export function isWhiteboardSnapshot(value: unknown): value is WhiteboardSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WhiteboardSnapshot>;
  return (
    candidate.version === 2 &&
    Array.isArray(candidate.pages) &&
    typeof candidate.activePage === "number"
  );
}
