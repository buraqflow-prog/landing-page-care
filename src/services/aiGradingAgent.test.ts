import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gradeSubmissionWithAI, imageUrlToCleanBase64, parseGradeResult, resolveVisionEndpoint } from "./aiGradingAgent";

describe("gradeSubmissionWithAI", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", class {
      naturalWidth = 1;
      naturalHeight = 1;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toDataURL: () => "data:image/jpeg;base64,QQ==",
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement(tagName);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports the HTTP status and status text from a custom vision endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Invalid API key", {
      status: 401,
      statusText: "Unauthorized",
    })));

    await expect(gradeSubmissionWithAI({
      exerciseTitle: "قوانين نيوتن",
      studentImagesBase64: ["data:image/jpeg;base64,QQ=="],
    }, {
      apiToken: "teacher-token",
      endpointUrl: "https://vision.example.test/grade",
    })).rejects.toThrow("HTTP 401 — Unauthorized");
  });

  it("keeps a teacher-selected numbered Flash model without discovery", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveVisionEndpoint("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent", "teacher-token"))
      .resolves.toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefers Gemini 3 and excludes Gemini 2.5 during auto-discovery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      models: [
        { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.0-flash", supportedGenerationMethods: ["generateContent"] },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(resolveVisionEndpoint("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", "teacher-token"))
      .resolves.toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent");
  });

  it("clamps scores and normalizes flexible step results", () => {
    expect(parseGradeResult({
      score: 28,
      summary: "مراجعة مكتملة",
      stepByStepCorrection: [{ title: "السؤال 1", result: "خطأ في الحل", note: "راجِع الإشارة" }],
      studentFeedback: "أعد المحاولة.",
    })).toMatchObject({ score: 20, stepByStepCorrection: [{ result: "incorrect" }] });
  });

  it("stops a stalled model request after 60 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      const signal = (init as RequestInit).signal;
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));

    const grading = gradeSubmissionWithAI({
      exerciseTitle: "قوانين نيوتن",
      studentImagesBase64: ["data:image/jpeg;base64,QQ=="],
    }, {
      apiToken: "teacher-token",
      endpointUrl: "https://vision.example.test/grade",
    });
    const assertion = expect(grading).rejects.toThrow("خلال 60 ثانية");
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(60_000);

    await assertion;
  });
});