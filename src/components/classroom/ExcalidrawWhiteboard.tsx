import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  FileImage,
  LocateFixed,
  Plus,
  Presentation,
  Radio,
  Trash2,
} from "lucide-react";
import {
  Excalidraw,
  exportToBlob,
  getDataURL,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

import {
  createWhiteboardSnapshot,
  isWhiteboardSnapshot,
  type WhiteboardBackground,
  type WhiteboardFile,
  type WhiteboardSnapshot,
  type WhiteboardSyncMessage,
  type WhiteboardViewport,
} from "./whiteboard-types";

type BoardApi = {
  updateScene: (scene: {
    elements?: unknown[];
    appState?: Record<string, unknown>;
    captureUpdate?: "IMMEDIATELY" | "NEVER";
  }) => void;
  getSceneElements: () => readonly unknown[];
  getFiles: () => Record<string, WhiteboardFile>;
};

type Props = {
  sessionId: string;
  role: "teacher" | "student";
  canWrite: boolean;
  onSnapshotChange?: (snapshot: WhiteboardSnapshot) => void;
};

const backgrounds: { value: WhiteboardBackground; label: string }[] = [
  { value: "blank", label: "أبيض" },
  { value: "grid", label: "مربعات" },
  { value: "ruled", label: "أسطر" },
];

function makePage(index: number, background: WhiteboardBackground = "grid") {
  return {
    id: `page-${Date.now()}-${index}`,
    name: `صفحة ${index}`,
    background,
    elements: [],
    files: {},
  };
}

function isSyncMessage(value: unknown): value is WhiteboardSyncMessage {
  if (!value || typeof value !== "object" || !("kind" in value) || !("source" in value))
    return false;
  const candidate = value as Partial<WhiteboardSyncMessage>;
  return (
    (candidate.kind === "snapshot" && isWhiteboardSnapshot(candidate.snapshot)) ||
    candidate.kind === "laser" ||
    (candidate.kind === "viewport_change" && isViewport(candidate.viewport))
  );
}

function isViewport(value: unknown): value is WhiteboardViewport {
  if (!value || typeof value !== "object") return false;
  const viewport = value as Partial<WhiteboardViewport>;
  return [
    viewport.panX,
    viewport.panY,
    viewport.zoom,
    viewport.canvasWidth,
    viewport.canvasHeight,
  ].every((item) => typeof item === "number" && Number.isFinite(item));
}

export default function ExcalidrawWhiteboard({
  sessionId,
  role,
  canWrite,
  onSnapshotChange,
}: Props) {
  const [snapshot, setSnapshot] = useState<WhiteboardSnapshot>(createWhiteboardSnapshot);
  const [laser, setLaser] = useState<{ x: number; y: number } | null>(null);
  const [api, setApi] = useState<BoardApi | null>(null);
  const [connected, setConnected] = useState(false);
  const [followingTeacher, setFollowingTeacher] = useState(role === "student");
  const [teacherViewport, setTeacherViewport] = useState<WhiteboardViewport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const snapshotRef = useRef(snapshot);
  const apiRef = useRef<BoardApi | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const supabaseChannelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(
    null,
  );
  const sourceRef = useRef(`board-${crypto.randomUUID()}`);
  const syncingRef = useRef(false);
  const changeTimerRef = useRef<number | null>(null);
  const viewportTimerRef = useRef<number | null>(null);
  const applyingViewportRef = useRef(false);
  const editable = role === "teacher" || canWrite;
  const activePage = snapshot.pages[snapshot.activePage] ?? snapshot.pages[0];

  useEffect(() => {
    snapshotRef.current = snapshot;
    onSnapshotChange?.(snapshot);
  }, [snapshot, onSnapshotChange]);
  useEffect(() => {
    apiRef.current = api;
  }, [api]);

  const broadcast = useCallback(
    (
      message:
        | { kind: "snapshot"; snapshot: WhiteboardSnapshot }
        | { kind: "laser"; point: { x: number; y: number } | null }
        | { kind: "viewport_change"; viewport: WhiteboardViewport },
    ) => {
      const payload = { ...message, source: sourceRef.current } as WhiteboardSyncMessage;
      channelRef.current?.postMessage(payload);
      if (supabaseChannelRef.current && role === "teacher")
        void supabaseChannelRef.current.send({ type: "broadcast", event: "whiteboard", payload });
    },
    [role],
  );

  const applyRemote = useCallback((incoming: WhiteboardSyncMessage) => {
    if (incoming.source === sourceRef.current) return;
    if (incoming.kind === "laser") {
      setLaser(incoming.point);
      return;
    }
    if (incoming.kind === "viewport_change") {
      setTeacherViewport(incoming.viewport);
      return;
    }
    syncingRef.current = true;
    setSnapshot(incoming.snapshot);
    const page = incoming.snapshot.pages[incoming.snapshot.activePage];
    if (page && apiRef.current)
      apiRef.current.updateScene({
        elements: page.elements,
        appState: pageAppState(page.background),
      });
    window.setTimeout(() => {
      syncingRef.current = false;
    }, 0);
  }, []);

  const applyTeacherViewport = useCallback(
    (viewport: WhiteboardViewport) => {
      const target = apiRef.current;
      if (!target || role !== "student") return;
      const container = document.querySelector(".excalidraw-container");
      const bounds = container?.getBoundingClientRect();
      const canvasWidth = bounds?.width ?? viewport.canvasWidth;
      const canvasHeight = bounds?.height ?? viewport.canvasHeight;
      const panX = viewport.panX + (canvasWidth - viewport.canvasWidth) / 2;
      const panY = viewport.panY + (canvasHeight - viewport.canvasHeight) / 2;
      applyingViewportRef.current = true;
      target.updateScene({
        appState: { scrollX: panX, scrollY: panY, zoom: { value: viewport.zoom } },
        captureUpdate: "NEVER",
      });
      window.setTimeout(() => {
        applyingViewportRef.current = false;
      }, 0);
    },
    [role],
  );

  useEffect(() => {
    if (followingTeacher && teacherViewport) applyTeacherViewport(teacherViewport);
  }, [followingTeacher, teacherViewport, applyTeacherViewport]);

  useEffect(() => {
    const channel = new BroadcastChannel(`classroom_sync:${sessionId}`);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (isSyncMessage(event.data)) applyRemote(event.data);
    };
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [sessionId, applyRemote]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    if (!client) return;
    const channel = client
      .channel(`classroom:${sessionId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "whiteboard" }, ({ payload }) => {
        if (isSyncMessage(payload)) applyRemote(payload);
      })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    supabaseChannelRef.current = channel;
    return () => {
      supabaseChannelRef.current = null;
      setConnected(false);
      void client.removeChannel(channel);
    };
  }, [sessionId, applyRemote]);

  const commitSnapshot = useCallback(
    (next: WhiteboardSnapshot, shouldBroadcast = true) => {
      setSnapshot(next);
      if (shouldBroadcast) broadcast({ kind: "snapshot", snapshot: next });
    },
    [broadcast],
  );

  const switchPage = useCallback(
    (index: number) => {
      const next = { ...snapshotRef.current, activePage: index };
      const nextPage = next.pages[index];
      if (!nextPage) return;
      commitSnapshot(next);
      apiRef.current?.updateScene({
        elements: nextPage.elements,
        appState: pageAppState(nextPage.background),
      });
    },
    [commitSnapshot],
  );

  const onChange = useCallback(
    (elements: readonly unknown[], _appState: unknown, files: Record<string, WhiteboardFile>) => {
      if (syncingRef.current || !editable) return;
      if (changeTimerRef.current) window.clearTimeout(changeTimerRef.current);
      changeTimerRef.current = window.setTimeout(() => {
        const current = snapshotRef.current;
        const page = current.pages[current.activePage];
        if (!page) return;
        const pages = current.pages.map((entry, index) =>
          index === current.activePage ? { ...entry, elements: [...elements], files } : entry,
        );
        commitSnapshot({ ...current, pages });
      }, 160);
    },
    [commitSnapshot, editable],
  );

  const changeBackground = (background: WhiteboardBackground) => {
    const current = snapshotRef.current;
    const pages = current.pages.map((page, index) =>
      index === current.activePage ? { ...page, background } : page,
    );
    const next = { ...current, pages };
    commitSnapshot(next);
    apiRef.current?.updateScene({ appState: pageAppState(background) });
  };

  const addPage = () => {
    const current = snapshotRef.current;
    const next = {
      ...current,
      pages: [...current.pages, makePage(current.pages.length + 1, activePage?.background)],
      activePage: current.pages.length,
    };
    commitSnapshot(next);
    apiRef.current?.updateScene({
      elements: [],
      appState: pageAppState(activePage?.background ?? "grid"),
    });
  };

  const clearPage = () => {
    if (!editable) return;
    const current = snapshotRef.current;
    const pages = current.pages.map((page, index) =>
      index === current.activePage ? { ...page, elements: [], files: {} } : page,
    );
    const next = { ...current, pages };
    commitSnapshot(next);
    apiRef.current?.updateScene({ elements: [] });
  };

  const addImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !apiRef.current || !editable) return;
    const fileId = `${Date.now()}-${file.name.replace(/[^a-z0-9]/gi, "-")}`;
    const dataURL = await getDataURL(file);
    const image = new Image();
    image.src = dataURL;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image-load"));
    });
    const width = Math.min(image.naturalWidth || 720, 720);
    const height = Math.max(
      1,
      (image.naturalHeight || 480) * (width / (image.naturalWidth || 720)),
    );
    const elements = convertToExcalidrawElements(
      [{ type: "image", x: 120, y: 120, width, height, fileId: fileId as never }],
      { regenerateIds: false },
    );
    const current = snapshotRef.current;
    const page = current.pages[current.activePage];
    if (!page) return;
    const files = {
      ...page.files,
      [fileId]: { id: fileId, dataURL, mimeType: file.type || "image/png", created: Date.now() },
    };
    const pages = current.pages.map((entry, index) =>
      index === current.activePage
        ? { ...entry, elements: [...entry.elements, ...elements], files }
        : entry,
    );
    commitSnapshot({ ...current, pages });
    apiRef.current.updateScene({ elements: [...page.elements, ...elements] });
  };

  const exportPng = async () => {
    if (!api || !activePage) return;
    const blob = await exportToBlob({
      elements: api.getSceneElements() as never[],
      files: api.getFiles() as never,
      appState: { exportBackground: true } as never,
      mimeType: "image/png",
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `board-${sessionId}-${snapshot.activePage + 1}.png`;
    link.click();
    URL.revokeObjectURL(href);
  };

  const onScrollChange = useCallback(
    (panX: number, panY: number, zoom: { value: number }) => {
      if (role !== "teacher" || applyingViewportRef.current) return;
      if (viewportTimerRef.current) window.clearTimeout(viewportTimerRef.current);
      viewportTimerRef.current = window.setTimeout(() => {
        const canvas = document.querySelector(".excalidraw-container")?.getBoundingClientRect();
        broadcast({
          kind: "viewport_change",
          viewport: {
            panX,
            panY,
            zoom: zoom.value,
            canvasWidth: canvas?.width ?? 0,
            canvasHeight: canvas?.height ?? 0,
          },
        });
      }, 40);
    },
    [broadcast, role],
  );

  return (
    <div className="flex min-h-[540px] flex-col bg-background" dir="rtl">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card p-3">
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept="image/*"
          onChange={(event) => void addImage(event)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!editable}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileImage />
          إدراج صورة
        </Button>
        <Button size="sm" variant="ghost" disabled={!editable} onClick={clearPage}>
          <Trash2 />
          مسح الصفحة
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void exportPng()}>
          <Download />
          حفظ صورة
        </Button>
        <span className="mr-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Radio className={`size-3 ${connected ? "text-accent" : ""}`} />
          {connected ? "متصل بالحصة" : "مزامنة بين التبويبات مفعّلة"}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-3 py-2 text-sm">
        <div className="flex flex-wrap gap-1">
          {backgrounds.map((background) => (
            <Button
              key={background.value}
              size="sm"
              variant={activePage?.background === background.value ? "secondary" : "ghost"}
              disabled={!editable}
              onClick={() => changeBackground(background.value)}
            >
              {background.label}
            </Button>
          ))}
        </div>
        <span className="text-muted-foreground">
          {editable ? "استخدم أدوات النص والأشكال والصور والتحريك من اللوح" : "عرض فقط"}
        </span>
      </div>
      <div className="relative h-[560px] min-h-[460px] flex-none overflow-hidden bg-card [&_.excalidraw]:!h-full [&_.excalidraw]:!min-h-full">
        {activePage && (
          <Excalidraw
            key={activePage.id}
            excalidrawAPI={(nextApi) => setApi(nextApi as unknown as BoardApi)}
            initialData={{
              elements: activePage.elements as never[],
              files: activePage.files as never,
              appState: pageAppState(activePage.background) as never,
            }}
            onChange={onChange}
            onScrollChange={onScrollChange}
            onPointerUpdate={(payload) => {
              if (role === "teacher" && payload.pointer.tool === "laser") {
                const point = { x: payload.pointer.x, y: payload.pointer.y };
                setLaser(point);
                broadcast({ kind: "laser", point });
              }
            }}
            viewModeEnabled={!editable}
            gridModeEnabled={activePage.background === "grid"}
            UIOptions={{
              canvasActions: {
                export: false,
                saveToActiveFile: false,
                loadScene: false,
                clearCanvas: false,
                changeViewBackgroundColor: false,
              },
              tools: { image: true },
            }}
            langCode="ar"
          />
        )}
        {laser && role === "student" && (
          <span className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1 bg-destructive px-2 py-1 text-xs font-bold text-destructive-foreground">
            <Presentation className="size-3" />
            مؤشر الأستاذ
          </span>
        )}
        {role === "student" && (
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 border border-border bg-card px-2 py-2 text-xs shadow-sm">
            <Eye className="size-3 text-primary" />
            <span>
              {followingTeacher ? "👁️ متابعة مباشرة لكاميرا الأستاذ" : "التنقل الحر مفعّل"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFollowingTeacher((value) => !value)}
            >
              {followingTeacher ? "إيقاف المتابعة" : "متابعة"}
            </Button>
            {!followingTeacher && teacherViewport && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setFollowingTeacher(true);
                  applyTeacherViewport(teacherViewport);
                }}
              >
                <LocateFixed />
                العودة لموقع الأستاذ
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card p-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          {snapshot.pages.map((page, index) => (
            <Button
              key={page.id}
              size="sm"
              variant={index === snapshot.activePage ? "secondary" : "ghost"}
              onClick={() => switchPage(index)}
            >
              {page.name}
            </Button>
          ))}
          <Button size="sm" variant="outline" disabled={!editable} onClick={addPage}>
            <Plus />
            صفحة جديدة
          </Button>
        </div>
        <span className="text-sm text-muted-foreground">
          صفحة {snapshot.activePage + 1} من {snapshot.pages.length}
        </span>
      </div>
    </div>
  );
}

function pageAppState(background: WhiteboardBackground) {
  return {
    viewBackgroundColor:
      background === "blank" ? "#ffffff" : background === "ruled" ? "#f8fbff" : "#ffffff",
    gridSize: background === "grid" ? 20 : 0,
  };
}
