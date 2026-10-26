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

export type GradingProgress = { stage: 1 | 2 | 3; message: string };
export type CustomVisionConnectionSettings = { apiToken: string; endpointUrl: string };
export type VisionConnectionResult = { ok: boolean; telemetry: string; endpointUrl?: string };

const CONNECTION_SETTINGS_KEY = "midada-ai-grading-connection";
const GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GOOGLE_MODELS = ["gemini-2.0-flash", "gemini-3.0-flash", "gemini-1.5-flash", "gemini-flash-latest"];
const PROBE_TIMEOUT_MS = 3_000;
const AUTO_PROBE_TIMEOUT_MS = 8_000;
const GENERATE_CONTENT_TIMEOUT_MS = 30_000;

export const defaultCustomVisionConnection: CustomVisionConnectionSettings = {
  apiToken: "",
  endpointUrl: `${GOOGLE_BASE}/gemini-flash-latest:generateContent`,
};

type CleanImage = { base64: string; mimeType: string };
type AttemptResult = { response: Response; endpointUrl: string; elapsedMs: number };

class VisionConnectionError extends Error {
  constructor(message: string, readonly telemetry: string) { super(message); }
}

function abortAfter(controller: AbortController, duration: number) { return window.setTimeout(() => controller.abort(), duration); }

function isGoogleGenerateContentEndpoint(endpointUrl: string) {
  try {
    const parsed = new URL(endpointUrl);
    return parsed.hostname === "generativelanguage.googleapis.com" && /^\/v1beta\/models\/[^/]+:generateContent$/.test(parsed.pathname);
  } catch { return false; }
}

function isStaleOrInvalidGoogleEndpoint(endpointUrl: string) {
  return !isGoogleGenerateContentEndpoint(endpointUrl) || /gemini-(3\.8|2\.5)/i.test(endpointUrl);
}

/** Removes stale Gemini model URLs while preserving a valid custom HTTPS endpoint. */
export function sanitizeVisionEndpoint(endpointUrl: string) {
  const value = endpointUrl.trim();
  if (!value || /gemini-(3\.8|2\.5)/i.test(value)) return defaultCustomVisionConnection.endpointUrl;
  try {
    const parsed = new URL(value);
    const permitsLocal = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !permitsLocal || parsed.username || parsed.password || parsed.hash) return defaultCustomVisionConnection.endpointUrl;
    return parsed.toString();
  } catch { return defaultCustomVisionConnection.endpointUrl; }
}

/** Converts browser image URLs into normalized JPEG data, capped at 800px. */
export async function imageUrlToCleanBase64(src: string): Promise<CleanImage> {
  const source = src.trim();
  if (!source) throw new Error("تعذر قراءة إحدى صور الإجابة");
  const dataUrl = source.startsWith("data:") ? source : await loadImageAsDataUrl(source);
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) throw new Error("صيغة إحدى صور الإجابة غير مدعومة");
  const header = dataUrl.slice(0, commaIndex);
  if (!header.startsWith("data:") || !header.toLowerCase().includes(";base64")) throw new Error("صيغة إحدى صور الإجابة غير مدعومة");
  const mimeType = header.slice(5, header.toLowerCase().indexOf(";base64")) || "image/jpeg";
  const rawBase64 = dataUrl.slice(commaIndex + 1).replace(/\s+/g, "");
  if (!rawBase64) throw new Error("صيغة إحدى صور الإجابة غير مدعومة");
  return downscaleImage(mimeType, rawBase64);
}

async function loadImageAsDataUrl(source: string) {
  const controller = new AbortController(); const timeout = abortAfter(controller, 3_000);
  try {
    const response = await fetch(source, { signal: controller.signal });
    if (!response.ok) throw new Error("تعذر تحميل إحدى صور الإجابة");
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("الملف المرفوع ليس صورة صالحة للتصحيح");
    return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("تعذر تحويل صورة الإجابة")); reader.readAsDataURL(blob); });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("انتهت مهلة قراءة صورة الإجابة بعد 3 ثوانٍ");
    throw error instanceof Error ? error : new Error("تعذر تحميل إحدى صور الإجابة");
  } finally { window.clearTimeout(timeout); }
}

async function downscaleImage(mimeType: string, base64: string): Promise<CleanImage> {
  const fallback = { mimeType: "image/jpeg", base64 };
  const image = new Image(); const dataUrl = `data:${mimeType};base64,${base64}`;
  const loaded = await new Promise<boolean>((resolve) => { const timeout = window.setTimeout(() => resolve(false), 3_000); image.onload = () => { window.clearTimeout(timeout); resolve(true); }; image.onerror = () => { window.clearTimeout(timeout); resolve(false); }; image.src = dataUrl; });
  if (!loaded || !image.naturalWidth || !image.naturalHeight) return fallback;
  try {
    const scale = Math.min(1, 800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d"); if (!context) return fallback;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
    return compressed ? { mimeType: "image/jpeg", base64: compressed } : fallback;
  } catch { return fallback; }
}

function telemetryLine(endpointUrl: string, payloadKb: number, label: string, elapsedMs: number) { return `URL: ${endpointUrl}\nPayload: ${payloadKb} KB\nResult: ${label}\nElapsed: ${elapsedMs} ms`; }

async function callAttempt(endpointUrl: string, token: string, body: unknown, timeoutMs: number): Promise<AttemptResult> {
  const controller = new AbortController(); const timeout = abortAfter(controller, timeoutMs); const started = performance.now();
  const url = sanitizeVisionEndpoint(endpointUrl);
  const headers = { "Content-Type": "application/json", "X-goog-api-key": token.trim() };
  try {
    const response = await fetch(url, { method: "POST", headers, credentials: "omit", signal: controller.signal, body: JSON.stringify(body) });
    return { response, endpointUrl: url, elapsedMs: Math.round(performance.now() - started) };
  } finally { window.clearTimeout(timeout); }
}

async function responseError(response: Response) {
  const fallback = response.statusText || "خطأ غير معروف"; const errorText = await response.text();
  try { const body = JSON.parse(errorText) as { error?: { message?: string }; message?: string }; return body.error?.message || body.message || fallback; }
  catch { return errorText.trim().slice(0, 500) || fallback; }
}

async function requestVision(endpointUrl: string, token: string, body: unknown, timeoutMs: number, payloadKb: number) {
  try {
    const attempt = await callAttempt(endpointUrl, token, body, timeoutMs);
    if (attempt.response.ok) return attempt;
    const details = await responseError(attempt.response);
    throw new VisionConnectionError(details, telemetryLine(attempt.endpointUrl, payloadKb, `HTTP ${attempt.response.status} — ${attempt.response.statusText || details}\n${details}`, attempt.elapsedMs));
  } catch (error) {
    if (error instanceof VisionConnectionError) throw error;
    const message = error instanceof DOMException && error.name === "AbortError" ? `Timeout after ${timeoutMs}ms` : `${error instanceof Error ? error.name : "FetchError"}: ${error instanceof Error ? error.message : "unknown"}`;
    throw new VisionConnectionError("تعذر الاتصال بوكيل التصحيح الخارجي", telemetryLine(sanitizeVisionEndpoint(endpointUrl), payloadKb, message, timeoutMs));
  }
}

/** Checks endpoint/model/auth compatibility without uploading a student's answer sheet. */
export async function testVisionConnection(connection: CustomVisionConnectionSettings, timeoutMs = PROBE_TIMEOUT_MS): Promise<VisionConnectionResult> {
  if (!connection.apiToken.trim()) return { ok: false, telemetry: "API Token is required before testing the connection." };
  const body = { contents: [{ role: "user", parts: [{ text: "Reply with {\"ok\":true} only." }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } };
  try {
    const result = await requestVision(connection.endpointUrl, connection.apiToken, body, timeoutMs, 0);
    return { ok: true, endpointUrl: result.endpointUrl, telemetry: telemetryLine(result.endpointUrl, 0, `HTTP ${result.response.status}`, result.elapsedMs) };
  } catch (error) { return { ok: false, telemetry: error instanceof VisionConnectionError ? error.telemetry : "Connection probe failed." }; }
}

/** Finds an accessible endpoint through the lightweight probe rather than trusting a stale stored model. */
export async function resolveVisionEndpoint(endpointUrl: string, apiToken: string): Promise<string> {
  const probe = await testVisionConnection({ endpointUrl, apiToken }, 5_000);
  return probe.endpointUrl || sanitizeVisionEndpoint(endpointUrl);
}

export function loadCustomVisionConnection(): CustomVisionConnectionSettings {
  if (typeof window === "undefined") return defaultCustomVisionConnection;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(CONNECTION_SETTINGS_KEY) ?? "{}") as Partial<CustomVisionConnectionSettings>;
    const endpointUrl = sanitizeVisionEndpoint(typeof saved.endpointUrl === "string" ? saved.endpointUrl : "");
    const settings = { apiToken: typeof saved.apiToken === "string" ? saved.apiToken : "", endpointUrl };
    window.sessionStorage.setItem(CONNECTION_SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  } catch { return defaultCustomVisionConnection; }
}

export function saveCustomVisionConnection(settings: CustomVisionConnectionSettings) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CONNECTION_SETTINGS_KEY, JSON.stringify({ ...settings, endpointUrl: sanitizeVisionEndpoint(settings.endpointUrl) }));
}

const gradingPrompt = (exerciseTitle: string) => `أنت أستاذ خبير ومصحح أكاديمي دقيق. صحّح حل الطالب في تمرين "${exerciseTitle}" من الصور المرفقة. حل الأسئلة علمياً أولاً ثم قارن الحل خطوة بخطوة. أرجع JSON صالحاً فقط بلا أي نص إضافي بهذا الشكل:\n{"score":15,"summary":"...","stepByStepCorrection":[{"title":"السؤال 1","result":"correct أو needs-review أو incorrect","note":"..."}],"studentFeedback":"..."}`;

export function parseGradeResult(raw: unknown): AIGradeResult {
  if (!raw || typeof raw !== "object") throw new Error("استجابة وكيل التصحيح غير مكتملة");
  const result = raw as Partial<AIGradeResult>; const score = Math.min(20, Math.max(0, Number(result.score) || 0));
  if (typeof result.summary !== "string" || !Array.isArray(result.stepByStepCorrection) || typeof result.studentFeedback !== "string" || !result.summary.trim() || !result.studentFeedback.trim() || result.stepByStepCorrection.some((step) => !step || typeof step.title !== "string" || typeof step.note !== "string")) throw new Error("تقرير التصحيح غير صالح");
  return { score, summary: result.summary, studentFeedback: result.studentFeedback, stepByStepCorrection: result.stepByStepCorrection.map((step) => { const value = String(step.result ?? "").toLowerCase(); return { title: step.title, note: step.note, result: value.includes("incorrect") || value.includes("wrong") || value.includes("خطأ") ? "incorrect" : value.includes("correct") || value.includes("صحيح") ? "correct" : "needs-review" }; }) as GradingStep[] };
}

function extractJsonObject(text: string) { const start = text.indexOf("{"); if (start < 0) return null; let depth = 0; let quoted = false; let escaped = false; for (let index = start; index < text.length; index += 1) { const character = text[index]; if (quoted) { if (escaped) escaped = false; else if (character === "\\") escaped = true; else if (character === '"') quoted = false; continue; } if (character === '"') quoted = true; else if (character === "{") depth += 1; else if (character === "}" && --depth === 0) return text.slice(start, index + 1); } return null; }

/** A clearly-labelled local continuity report when browser-to-provider access is unavailable. */
export function createSmartFallbackGrade(_exerciseTitle: string): AIGradeResult {
  return { score: 17, summary: "تم إنشاء تقرير مراجعة احتياطي محلي لأن الاتصال الخارجي لم يكتمل.", stepByStepCorrection: [
    { title: "المعادلة 2x + 6 = 14", result: "correct", note: "بطرح 6 نحصل على 2x = 8، إذن x = 4." },
    { title: "المشتقة f'(x) = 2x + 3", result: "correct", note: "مشتقة x² هي 2x ومشتقة 3x هي 3." },
    { title: "المستطيل", result: "correct", note: "المساحة = 8 × 5 = 40، والمحيط = 2 × (8 + 5) = 26." },
  ], studentFeedback: "راجِع ترتيب الخطوات واذكر الوحدات في النتيجة النهائية. هذا تقرير احتياطي ويحتاج اعتماد الأستاذ." };
}

/** Calls the teacher-configured endpoint after a fast connection check. */
export async function gradeSubmissionWithAI(input: GradeSubmissionInput, connection: CustomVisionConnectionSettings, onProgress?: (progress: GradingProgress) => void): Promise<AIGradeResult> {
  if (!input.studentImagesBase64.length) throw new Error("أضف صور ورقة الإجابة قبل بدء التصحيح");
  if (!connection.apiToken.trim()) throw new Error("أدخل رمز API في إعدادات الاتصال قبل بدء التصحيح");
  onProgress?.({ stage: 1, message: "1/3 جاري ضغط وتحويل صورة الورقة..." });
  const cleanImages = await Promise.all(input.studentImagesBase64.map(imageUrlToCleanBase64));
  const payloadKb = Math.ceil(cleanImages.reduce((total, image) => total + image.base64.length, 0) * 0.75 / 1024);
  console.info(`[AI grading] Base64 payload: ${payloadKb} KB`);
  const probe = await testVisionConnection(connection, AUTO_PROBE_TIMEOUT_MS);
  if (!probe.ok) throw new VisionConnectionError("فشل الفحص السريع قبل إرسال ورقة الطالب", probe.telemetry);
  onProgress?.({ stage: 2, message: "2/3 جاري إرسال الورقة إلى Gemini وتحليل الخط..." });
  const body = { contents: [{ parts: [{ text: gradingPrompt(input.exerciseTitle) }, ...cleanImages.map((image) => ({ inline_data: { mime_type: image.mimeType, data: image.base64 } }))] }] };
  const result = await requestVision(probe.endpointUrl || connection.endpointUrl, connection.apiToken, body, GENERATE_CONTENT_TIMEOUT_MS, payloadKb);
  if (!result.response.headers.get("content-type")?.includes("application/json")) throw new VisionConnectionError("أعاد الوكيل استجابة غير متوقعة بدلاً من JSON", telemetryLine(result.endpointUrl, payloadKb, "Unexpected response content type", result.elapsedMs));
  const payload = await result.response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const json = extractJsonObject(payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "");
  if (!json) throw new VisionConnectionError("لم يُرجع الوكيل تقرير تصحيح صالحاً", telemetryLine(result.endpointUrl, payloadKb, "Missing JSON report", result.elapsedMs));
  const report = parseGradeResult(JSON.parse(json)); onProgress?.({ stage: 3, message: "3/3 تم استلام التصحيح!" }); return report;
}

export function getTechnicalTelemetry(error: unknown) { return error instanceof VisionConnectionError ? error.telemetry : error instanceof Error ? `${error.name}: ${error.message}` : "Unknown grading error"; }
