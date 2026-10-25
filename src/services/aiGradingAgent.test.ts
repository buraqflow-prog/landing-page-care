import { describe, expect, it, vi } from "vitest";

import { gradeSubmissionWithAI } from "./aiGradingAgent";

describe("gradeSubmissionWithAI", () => {
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
});