import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";

import type { WhiteboardSnapshot } from "./whiteboard-types";

const ExcalidrawWhiteboard = lazy(() => import("./ExcalidrawWhiteboard"));

export type { WhiteboardSnapshot } from "./whiteboard-types";

type InteractiveWhiteboardProps = {
  sessionId: string;
  role: "teacher" | "student";
  canWrite: boolean;
  onSnapshotChange?: (snapshot: WhiteboardSnapshot) => void;
};

function WhiteboardPlaceholder() {
  return <div className="min-h-[540px] animate-pulse border border-border bg-muted/40" aria-label="جارٍ تجهيز اللوح التفاعلي" />;
}

export function InteractiveWhiteboard(props: InteractiveWhiteboardProps) {
  return (
    <ClientOnly fallback={<WhiteboardPlaceholder />}>
      <Suspense fallback={<WhiteboardPlaceholder />}>
        <ExcalidrawWhiteboard {...props} />
      </Suspense>
    </ClientOnly>
  );
}