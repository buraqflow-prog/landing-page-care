export type GradingStep = {
  title: string;
  result: "correct" | "needs-review" | "incorrect";
  note: string;
};

export type AIGradeResult = {
  score: number;
  summary: string;
  stepByStepCorrection: GradingStep[];
  studentFeedback: string;
};

export type GradeSubmissionInput = {
  exerciseTitle: string;
  questionFileUrlOrBase64?: string;
  studentImagesBase64: string[];
};

export type CustomVisionConnectionSettings = {
  apiToken: string;
  endpointUrl: string;
};

const CONNECTION_SETTINGS_KEY = "midada-ai-grading-connection";

export const defaultCustomVisionConnection: CustomVisionConnectionSettings = {
  apiToken: "",
  endpointUrl: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
};

type CleanImage = {
  base64: string;
  mimeType: string;
};

/** Converts browser image URLs into validated data URLs before secure grading. */
export async function imageUrlToCleanBase64(src: string): Promise<CleanImage> {
  const source = src.trim();
  if (!source) throw new Error("تعذر قراءة إحدى صور الإجابة");

  if (source.startsWith("data:")) {
    const match = source.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) throw new Error("صيغة إحدى صور الإجابة غير مدعومة");
    return { mimeType: match[1] ?? "image/jpeg", base64: match[2] ?? "" };
  }

  const response = await fetch(source);
  if (!response.ok) throw new Error("تعذر تحميل إحدى صور الإجابة");
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("الملف المرفوع ليس صورة صالحة للتصحيح");

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("تعذر تحويل صورة الإجابة"));
    reader.readAsDataURL(blob);
  });
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error("تعذر تجهيز إحدى صور الإجابة");
  return { mimeType: match[1] ?? "image/jpeg", base64: match[2] ?? "" };
}

export function loadCustomVisionConnection(): CustomVisionConnectionSettings {
  if (typeof window === "undefined") return defaultCustomVisionConnection;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(CONNECTION_SETTINGS_KEY) ?? "{}") as Partial<CustomVisionConnectionSettings>;
    return {
      apiToken: typeof saved.apiToken === "string" ? saved.apiToken : "",
      endpointUrl: typeof saved.endpointUrl === "string" && saved.endpointUrl.trim() ? saved.endpointUrl : defaultCustomVisionConnection.endpointUrl,
    };
  } catch {
    return defaultCustomVisionConnection;
  }
}

export function saveCustomVisionConnection(settings: CustomVisionConnectionSettings) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CONNECTION_SETTINGS_KEY, JSON.stringify(settings));
}

function getEndpointUrl(endpointUrl: string, apiToken: string) {
  const parsed = new URL(endpointUrl.trim());
  const permitsLocalDevelopment = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !permitsLocalDevelopment) {
    throw new Error("استخدم رابط HTTPS آمناً، أو رابط localhost للتطوير المحلي فقط");
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error("رابط الوكيل يجب ألا يحتوي على بيانات دخول أو جزء مرجعي");
  }
  parsed.searchParams.set("key", apiToken.trim());
  return parsed.toString();
}

const gradingPrompt = (exerciseTitle: string) => `أنت أستاذ خبير ومصحح أكاديمي دقيق. صحّح حل الطالب في تمرين "${exerciseTitle}" من الصور المرفقة. حل الأسئلة علمياً أولاً ثم قارن الحل خطوة بخطوة. أرجع JSON صالحاً فقط بلا أي نص إضافي بهذا الشكل:
{"score":15,"summary":"...","stepByStepCorrection":[{"title":"السؤال 1","result":"correct أو needs-review أو incorrect","note":"..."}],"studentFeedback":"..."}`;

function parseGradeResult(raw: unknown): AIGradeResult {
  if (!raw || typeof raw !== "object") throw new Error("استجابة وكيل التصحيح غير مكتملة");
  const result = raw as Partial<AIGradeResult>;
  const score = result.score ?? Number.NaN;
  const summary = result.summary;
  const steps = result.stepByStepCorrection;
  const studentFeedback = result.studentFeedback;
  if (!Number.isFinite(score) || typeof summary !== "string" || !Array.isArray(steps) || typeof studentFeedback !== "string") {
    throw new Error("استجابة وكيل التصحيح غير مكتملة");
  }
  if (score < 0 || score > 20 || !summary.trim() || !studentFeedback.trim() || steps.some((step) => !step || typeof step.title !== "string" || typeof step.note !== "string" || !["correct", "needs-review", "incorrect"].includes(step.result))) {
    throw new Error("تقرير التصحيح غير صالح");
  }
  return { score, summary, stepByStepCorrection: steps, studentFeedback };
}

async function responseError(response: Response) {
  const fallback = response.statusText || "خطأ غير معروف";
  const errorText = await response.text();
  try {
    const body = JSON.parse(errorText) as { error?: { message?: string }; message?: string };
    return body.error?.message || body.message || fallback;
  } catch {
    return errorText.trim().slice(0, 500) || fallback;
  }
}

/** Calls a teacher-configured vision endpoint with session-only browser settings. */
export async function gradeSubmissionWithAI(input: GradeSubmissionInput, connection: CustomVisionConnectionSettings): Promise<AIGradeResult> {
  if (!input.studentImagesBase64.length) {
    throw new Error("أضف صور ورقة الإجابة قبل بدء التصحيح");
  }
  if (!connection.apiToken.trim()) {
    throw new Error("أدخل رمز API في إعدادات الاتصال قبل بدء التصحيح");
  }

  const cleanImages = await Promise.all(input.studentImagesBase64.map(imageUrlToCleanBase64));
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  let response: Response;
  try {
    response = await fetch(getEndpointUrl(connection.endpointUrl, connection.apiToken), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    signal: controller.signal,
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: gradingPrompt(input.exerciseTitle) },
          ...cleanImages.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.base64 } })),
        ],
      }],
    }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("انتهت مهلة الاتصال بالوكيل بعد 45 ثانية");
    throw new Error("تعذر الاتصال بالوكيل. تحقق من الرابط ومن سماح خدمة الوكيل بالاتصال من المتصفح");
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const details = await responseError(response);
    throw new Error(`فشل الاتصال بالوكيل: HTTP ${response.status} ${response.statusText || ""}${details ? ` — ${details}` : ""}`.trim());
  }

  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("أعاد الوكيل استجابة غير متوقعة بدلاً من JSON");
  }

  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("لم يُرجع الوكيل تقرير تصحيح صالحاً");
  try {
    return parseGradeResult(JSON.parse(json));
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("تعذر قراءة تقرير التصحيح من الوكيل");
  }
}