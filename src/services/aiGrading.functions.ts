import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const gradingStepSchema = z.object({
  title: z.string().trim().min(1).max(160),
  result: z.enum(["correct", "needs-review", "incorrect"]),
  note: z.string().trim().min(1).max(1000),
});

const gradeResultSchema = z.object({
  score: z.number().finite().min(0).max(20),
  summary: z.string().trim().min(1).max(1200),
  stepByStepCorrection: z.array(gradingStepSchema).min(1).max(12),
  studentFeedback: z.string().trim().min(1).max(1200),
});

const imageDataUrlSchema = z
  .string()
  .trim()
  .regex(/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i, "صيغة الصورة غير صالحة")
  .max(4_000_000, "حجم صورة الإجابة كبير جداً");

const gradeInputSchema = z.object({
  exerciseTitle: z.string().trim().min(1).max(240),
  studentImagesBase64: z
    .array(imageDataUrlSchema)
    .min(1, "أضف صورة واحدة على الأقل لورقة الإجابة")
    .max(6),
});

type GeminiModel = {
  name?: string;
  supportedGenerationMethods?: string[];
};

type GeminiModelList = { models?: GeminiModel[] };

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

const gradingPrompt = (
  exerciseTitle: string,
) => `أنت أستاذ خبير ومصحح أكاديمي دقيق. صحّح حل الطالب في تمرين "${exerciseTitle}" من الصور المرفقة. حل الأسئلة علمياً أولاً ثم قارن الحل خطوة بخطوة. أرجع JSON صالحاً فقط بلا أي نص إضافي بهذا الشكل:
{"score":15,"summary":"...","stepByStepCorrection":[{"title":"السؤال 1","result":"correct أو needs-review أو incorrect","note":"..."}],"studentFeedback":"..."}`;

function selectGeminiModel(models: GeminiModel[]) {
  const supported = models.filter((model) => {
    const name = model.name?.toLowerCase() ?? "";
    return (
      model.supportedGenerationMethods?.includes("generateContent") &&
      !name.includes("tts") &&
      !name.includes("image-generation")
    );
  });
  const priorities = [
    (name: string) => name.includes("gemini-2.5-flash"),
    (name: string) => name.includes("gemini-3") && name.includes("flash"),
    (name: string) => name.includes("gemini-2.0-flash"),
  ];

  for (const priority of priorities) {
    const match = supported.find((model) => priority(model.name?.toLowerCase() ?? ""));
    if (match?.name) return match.name.replace(/^models\//, "");
  }

  return "gemini-flash-latest";
}

function normalizeResult(raw: unknown) {
  const source = z
    .object({
      score: z.coerce.number(),
      summary: z.string(),
      stepByStepCorrection: z.array(
        z.object({
          title: z.string().optional(),
          step: z.string().optional(),
          result: z.enum(["correct", "needs-review", "incorrect"]).optional(),
          status: z.enum(["correct", "needs-review", "incorrect"]).optional(),
          note: z.string().optional(),
          comment: z.string().optional(),
        }),
      ),
      studentFeedback: z.string(),
    })
    .parse(raw);

  return gradeResultSchema.parse({
    score: source.score,
    summary: source.summary,
    stepByStepCorrection: source.stepByStepCorrection.map((step, index) => ({
      title: step.title ?? step.step ?? `السؤال ${index + 1}`,
      result: step.result ?? step.status ?? "needs-review",
      note: step.note ?? step.comment ?? "راجِع هذه الخطوة مع الأستاذ.",
    })),
    studentFeedback: source.studentFeedback,
  });
}

export const gradeSubmissionWithGemini = createServerFn({ method: "POST" })
  .validator((input) => gradeInputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["GEMINI_API_KEY"]?.trim();
    if (!apiKey) throw new Error("لم يتم إعداد مفتاح Gemini الآمن بعد");

    const headers = {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    };

    const modelsResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers,
    });
    if (!modelsResponse.ok) {
      console.error("Gemini model discovery failed", modelsResponse.status);
      throw new Error("تعذر التحقق من نموذج Gemini المتاح");
    }

    const modelList = (await modelsResponse.json()) as GeminiModelList;
    const modelName = selectGeminiModel(modelList.models ?? []);
    console.info("Gemini grading model selected:", modelName);

    const parts = [
      { text: gradingPrompt(data.exerciseTitle) },
      ...data.studentImagesBase64.map((imageDataUrl) => {
        const data = imageDataUrl.includes(",") ? (imageDataUrl.split(",")[1] ?? "") : imageDataUrl;
        const mimeType = imageDataUrl.match(/data:(.*?);base64/i)?.[1] || "image/jpeg";
        return { inlineData: { mimeType, data } };
      }),
    ];

    const gradingResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ contents: [{ role: "user", parts }] }),
      },
    );
    const payload = (await gradingResponse.json()) as GeminiResponse;
    if (!gradingResponse.ok) {
      console.error(
        "Gemini grading request failed",
        gradingResponse.status,
        payload.error?.message,
      );
      throw new Error("تعذر إتمام التصحيح الذكي حالياً");
    }

    const text =
      payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("لم يُرجع Gemini تقرير تصحيح صالحاً");

    try {
      return normalizeResult(JSON.parse(json));
    } catch (error) {
      console.error("Gemini grading result validation failed", error);
      throw new Error("تقرير التصحيح الذكي غير مكتمل");
    }
  });
