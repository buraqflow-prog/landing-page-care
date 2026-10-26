import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildOpenAICompatibleBody,
  createSmartFallbackGrade,
  loadCustomVisionConnection,
  parseGradeResult,
  sanitizeVisionEndpoint,
  testVisionConnection,
} from "./aiGradingAgent";

describe("AI grading connection resilience", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 1;
        naturalHeight = 1;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it("replaces stale Gemini 3.8 and 2.5 endpoints with the latest Flash endpoint", () => {
    expect(
      sanitizeVisionEndpoint(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      ),
    ).toContain("gemini-flash-latest:generateContent");
    expect(
      sanitizeVisionEndpoint(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      ),
    ).toContain("gemini-flash-latest:generateContent");
  });

  it("rewrites a stale session value before returning connection settings", () => {
    window.sessionStorage.setItem(
      "midada-ai-grading-connection",
      JSON.stringify({
        apiToken: "teacher-token",
        endpointUrl:
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      }),
    );
    expect(loadCustomVisionConnection().endpointUrl).toContain(
      "gemini-flash-latest:generateContent",
    );
    expect(window.sessionStorage.getItem("midada-ai-grading-connection")).toContain(
      "gemini-flash-latest:generateContent",
    );
  });

  it("uses the Google AI Studio key header with a clean endpoint for AQ tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"candidates":[{"content":{"parts":[{"text":"{\\"ok\\":true}"}]}}]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await testVisionConnection({
      provider: "google-ai-studio",
      modelId: "gemini-2.0-flash",
      apiToken: "AQ.token",
      endpointUrl:
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    });
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("?key=");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ "X-goog-api-key": "AQ.token" });
  });

  it("reports CORS or browser transport failures without exposing the API token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await testVisionConnection({
      provider: "openai-compatible",
      modelId: "vision-model",
      apiToken: "private-teacher-token",
      endpointUrl: "https://provider.example/v1/chat/completions",
    });
    expect(result.ok).toBe(false);
    expect(result.telemetry).toContain("CORS");
    expect(result.telemetry).not.toContain("private-teacher-token");
  });

  it("formats compatible provider image grading with the selected model", () => {
    const body = buildOpenAICompatibleBody(
      { exerciseTitle: "رياضيات", modelId: "vision-model", studentImagesBase64: [] },
      [{ mimeType: "image/jpeg", base64: "abc" }],
    );
    expect(body).toMatchObject({ model: "vision-model", response_format: { type: "json_object" } });
    expect(JSON.stringify(body)).toContain("data:image/jpeg;base64,abc");
  });

  it("returns a clear local continuity grade with the requested math steps", () => {
    const fallback = createSmartFallbackGrade("رياضيات");
    expect(fallback).toMatchObject({ score: 17 });
    expect(fallback.stepByStepCorrection.map((step) => step.title)).toEqual([
      "المعادلة 2x + 6 = 14",
      "المشتقة f'(x) = 2x + 3",
      "المستطيل",
    ]);
  });

  it("clamps scores and normalizes flexible step results", () => {
    expect(
      parseGradeResult({
        score: 28,
        summary: "مراجعة مكتملة",
        stepByStepCorrection: [{ title: "السؤال 1", result: "خطأ في الحل", note: "راجِع الإشارة" }],
        studentFeedback: "أعد المحاولة.",
      }),
    ).toMatchObject({ score: 20, stepByStepCorrection: [{ result: "incorrect" }] });
  });
});
