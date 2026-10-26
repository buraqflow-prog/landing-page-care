import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSmartFallbackGrade, loadCustomVisionConnection, parseGradeResult, sanitizeVisionEndpoint, testVisionConnection } from "./aiGradingAgent";

describe("AI grading connection resilience", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", class {
      naturalWidth = 1; naturalHeight = 1; onload: (() => void) | null = null; onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.sessionStorage.clear(); });

  it("replaces stale Gemini 3.8 and 2.5 endpoints with the safe Flash endpoint", () => {
    expect(sanitizeVisionEndpoint("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent"))
      .toContain("gemini-2.0-flash:generateContent");
    expect(sanitizeVisionEndpoint("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"))
      .toContain("gemini-2.0-flash:generateContent");
  });

  it("rewrites a stale session value before returning connection settings", () => {
    window.sessionStorage.setItem("midada-ai-grading-connection", JSON.stringify({ apiToken: "teacher-token", endpointUrl: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent" }));
    expect(loadCustomVisionConnection().endpointUrl).toContain("gemini-2.0-flash:generateContent");
    expect(window.sessionStorage.getItem("midada-ai-grading-connection")).toContain("gemini-2.0-flash:generateContent");
  });

  it("uses bearer fallback after a rejected AQ query-key probe", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("denied", { status: 401, statusText: "Unauthorized" }))
      .mockResolvedValueOnce(new Response('{"candidates":[{"content":{"parts":[{"text":"{\\"ok\\":true}"}]}}]}', { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await testVisionConnection({ apiToken: "AQ.token", endpointUrl: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent" });
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ Authorization: "Bearer AQ.token" });
  });

  it("returns a clear local continuity grade with the requested math steps", () => {
    const fallback = createSmartFallbackGrade("رياضيات");
    expect(fallback).toMatchObject({ score: 17 });
    expect(fallback.stepByStepCorrection.map((step) => step.title)).toEqual(["المعادلة 2x + 6 = 14", "المشتقة f'(x) = 2x + 3", "المستطيل"]);
  });

  it("clamps scores and normalizes flexible step results", () => {
    expect(parseGradeResult({ score: 28, summary: "مراجعة مكتملة", stepByStepCorrection: [{ title: "السؤال 1", result: "خطأ في الحل", note: "راجِع الإشارة" }], studentFeedback: "أعد المحاولة." }))
      .toMatchObject({ score: 20, stepByStepCorrection: [{ result: "incorrect" }] });
  });
});
