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

export type GradingProgress = {
  stage: 1 | 2 | 3;
  message: string;
};

export type CustomVisionConnectionSettings = {
  apiToken: string;
  endpointUrl: string;
};

const CONNECTION_SETTINGS_KEY = "midada-ai-grading-connection";

export const defaultCustomVisionConnection: CustomVisionConnectionSettings = {
  apiToken: "",
  endpointUrl: "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
};

type CleanImage = {
  base64: string;
  mimeType: string;
};

const MODEL_DISCOVERY_TIMEOUT_MS = 5_000;
const GENERATE_CONTENT_TIMEOUT_MS = 60_000;

function abortAfter(controller: AbortController, duration: number) {
  return window.setTimeout(() => controller.abort(), duration);
}

/** Converts browser image URLs into validated data URLs before secure grading. */
export async function imageUrlToCleanBase64(src: string): Promise<CleanImage> {
  const source = src.trim();
  if (!source) throw new Error("تعذر قراءة إحدى صور الإجابة");

  const dataUrl = source.startsWith("data:") ? source : await loadImageAsDataUrl(source);
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error("صيغة إحدى صور الإجابة غير مدعومة");
  return downscaleImage(match[1] ?? "image/jpeg", match[2] ?? "");
}

async function loadImageAsDataUrl(source: string) {
  const controller = new AbortController();
  const timeout = abortAfter(controller, 3_000);
  try {
    const response = await fetch(source, { signal: controller.signal });
    if (!response.ok) throw new Error("تعذر تحميل إحدى صور الإجابة");
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("الملف المرفوع ليس صورة صالحة للتصحيح");
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("تعذر تحويل صورة الإجابة"));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("انتهت مهلة قراءة صورة الإجابة بعد 3 ثوانٍ");
    if (error instanceof Error) throw error;
    throw new Error("تعذر تحميل إحدى صور الإجابة");
  } finally {
    window.clearTimeout(timeout);
  }
}

async function downscaleImage(mimeType: string, base64: string): Promise<CleanImage> {
  const image = new Image();
  const dataUrl = `data:${mimeType};base64,${base64}`;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("تعذر تجهيز إحدى صور الإجابة"));
    image.src = dataUrl;
  });
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  if (!longestSide) throw new Error("تعذر تجهيز إحدى صور الإجابة");
  const scale = Math.min(1, 800 / longestSide);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر تجهيز إحدى صور الإجابة");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const compressed = canvas.toDataURL("image/jpeg", 0.7);
  const compressedBase64 = compressed.split(",")[1];
  if (!compressedBase64) throw new Error("تعذر تجهيز إحدى صور الإجابة");
  return { mimeType: "image/jpeg", base64: compressedBase64 };
}

function isGoogleGenerateContentEndpoint(endpointUrl: string) {
  const parsed = new URL(endpointUrl);
  return parsed.hostname === "generativelanguage.googleapis.com" && /^\/v1beta\/models\/[^/]+:generateContent$/.test(parsed.pathname);
}

function preferredFlashModel(models: Array<{ name?: string; supportedGenerationMethods?: string[] }>) {
  const availableModels = models
    .filter((model) => model.name?.startsWith("models/") && model.name.toLowerCase().includes("flash") && (!model.supportedGenerationMethods || model.supportedGenerationMethods.includes("generateContent")))
    .map((model) => model.name?.replace(/^models\//, "") ?? "");
  return availableModels.sort((left, right) => {
    const rank = (model: string) => model === "gemini-flash-latest" ? 0 : model.includes("latest") ? 1 : 2;
    return rank(left) - rank(right) || right.localeCompare(left, undefined, { numeric: true });
  })[0];
}

/** Finds an active Gemini Flash model quickly, while preserving configured non-Google endpoints. */
export async function resolveVisionEndpoint(endpointUrl: string, apiToken: string): Promise<string> {
  if (!isGoogleGenerateContentEndpoint(endpointUrl)) return endpointUrl;

  const parsed = new URL(endpointUrl);
  const fallback = new URL(defaultCustomVisionConnection.endpointUrl);
  const controller = new AbortController();
  const timeout = abortAfter(controller, MODEL_DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiToken.trim())}`, { signal: controller.signal, credentials: "omit" });
    if (!response.ok) return fallback.toString();
    const payload = await response.json() as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
    const model = preferredFlashModel(payload.models ?? []);
    if (!model) return fallback.toString();
    parsed.pathname = `/v1beta/models/${model}:generateContent`;
    return parsed.toString();
  } catch {
    return fallback.toString();
  } finally {
    window.clearTimeout(timeout);
  }
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

function formatHttpDiagnostic(response: Response, details: string) {
  const statusText = response.statusText.trim() || "بدون وصف للحالة";
  return `HTTP ${response.status} — ${statusText}${details ? `\n${details}` : ""}`;
}

/** Calls a teacher-configured vision endpoint with session-only browser settings. */
export async function gradeSubmissionWithAI(input: GradeSubmissionInput, connection: CustomVisionConnectionSettings, onProgress?: (progress: GradingProgress) => void): Promise<AIGradeResult> {
  if (!input.studentImagesBase64.length) {
    throw new Error("أضف صور ورقة الإجابة قبل بدء التصحيح");
  }
  if (!connection.apiToken.trim()) {
    throw new Error("أدخل رمز API في إعدادات الاتصال قبل بدء التصحيح");
  }

  onProgress?.({ stage: 1, message: "1/3 جاري ضغط وتحويل صورة الورقة..." });
  const cleanImages = await Promise.all(input.studentImagesBase64.map(imageUrlToCleanBase64));
  const base64SizeKb = Math.ceil(cleanImages.reduce((total, image) => total + image.base64.length, 0) * 0.75 / 1024);
  console.info(`[AI grading] Base64 payload: ${base64SizeKb} KB`);
  let response: Response;
  let timeout: number | undefined;
  try {
    const selectedEndpoint = await resolveVisionEndpoint(connection.endpointUrl, connection.apiToken);
    onProgress?.({ stage: 2, message: "2/3 جاري إرسال الورقة إلى Gemini وتحليل الخط..." });
    const controller = new AbortController();
    timeout = abortAfter(controller, GENERATE_CONTENT_TIMEOUT_MS);
    response = await fetch(getEndpointUrl(selectedEndpoint, connection.apiToken), {
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
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("تعذر الحصول على رد من وكيل التصحيح خلال 60 ثانية. تحقق من رمز API ومن أن خدمة Gemini تسمح بالاتصال من المتصفح");
    throw new Error("تعذر الاتصال بالوكيل. تحقق من الرابط ومن سماح خدمة الوكيل بالاتصال من المتصفح");
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const details = await responseError(response);
    throw new Error(`فشل الاتصال بالوكيل:\n${formatHttpDiagnostic(response, details)}`);
  }

  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("أعاد الوكيل استجابة غير متوقعة بدلاً من JSON");
  }

  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("لم يُرجع الوكيل تقرير تصحيح صالحاً");
  try {
    const result = parseGradeResult(JSON.parse(json));
    onProgress?.({ stage: 3, message: "3/3 تم استلام التصحيح!" });
    return result;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("تعذر قراءة تقرير التصحيح من الوكيل");
  }
}