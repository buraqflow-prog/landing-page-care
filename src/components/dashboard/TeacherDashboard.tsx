import { useEffect, useState } from "react";
import {
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileText,
  Plus,
  ScanLine,
  Settings2,
  Sparkles,
  Upload,
  Video,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import {
  createSmartFallbackGrade,
  defaultCustomVisionConnection,
  defaultOpenAICompatibleConnection,
  getTechnicalTelemetry,
  gradeSubmissionWithAI,
  loadCustomVisionConnection,
  saveCustomVisionConnection,
  testVisionConnection,
  type AIGradeResult,
  type AIProvider,
  type CustomVisionConnectionSettings,
  type GradingProgress,
} from "@/services/aiGradingAgent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Submission } from "./types";

const sessions = [
  { group: "مجموعة البكالوريا العلمية", subject: "الفيزياء", time: "اليوم · 17:00", students: 14 },
  { group: "الثالثة إعدادي", subject: "الرياضيات", time: "غداً · 10:30", students: 11 },
];
const initialSubmissions: Submission[] = [
  {
    id: "1",
    student: "كريم علي",
    status: "بانتظار التصحيح",
    fileName: "Quiz1_Physics_Karim.pdf",
    exerciseTitle: "تمرين: قوانين نيوتن",
  },
  {
    id: "2",
    student: "سارة محمد",
    status: "تم التصحيح",
    fileName: "Quiz1_Physics_Sara.pdf",
    grade: 18,
    feedback: "حل منظم جداً، راجعي فقط تحويل الوحدات في السؤال الأخير.",
    exerciseTitle: "تمرين: قوانين نيوتن",
  },
  {
    id: "3",
    student: "ياسين عمر",
    status: "بانتظار التصحيح",
    fileName: "Quiz1_Physics_Yassine.pdf",
    exerciseTitle: "تمرين: قوانين نيوتن",
  },
];

function createSampleAnswerSheet() {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1550;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#172033";
  context.direction = "rtl";
  context.textAlign = "right";
  context.font = "bold 54px Arial";
  context.fillText("كريم بنعلي - الفرض 1", 1080, 120);
  context.font = "38px Arial";
  [
    "1) حل المعادلة: 2x + 6 = 14",
    "2x = 8  ⟹  x = 4",
    "2) حساب المشتقة: f(x) = x² + 3x",
    "f'(x) = 2x + 3",
    "3) مستطيل طوله 8 سم وعرضه 5 سم",
    "المساحة = 40 سم²    المحيط = 26 سم",
  ].forEach((line, index) => context.fillText(line, 1080, 280 + index * 180));
  context.strokeStyle = "#94a3b8";
  context.lineWidth = 3;
  context.strokeRect(90, 190, 1020, 1120);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function loadLatestSubmission() {
  try {
    return JSON.parse(
      window.localStorage.getItem("midada-latest-submission") ?? "null",
    ) as Submission | null;
  } catch {
    return null;
  }
}

async function prepareAnswerSheet(files: FileList | File[]) {
  const selectedFiles = Array.from(files);
  if (!selectedFiles.length) throw new Error("اختر صورة أو ملف PDF واحداً على الأقل");
  const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length) {
    return Promise.all(
      imageFiles.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("تعذر قراءة صورة الإجابة"));
            reader.readAsDataURL(file);
          }),
      ),
    );
  }
  if (selectedFiles.some((file) => file.type === "application/pdf")) {
    throw new Error("يرجى رفع صور صفحات ملف PDF؛ التصحيح الذكي يحتاج صوراً واضحة حالياً");
  }
  throw new Error("اختر صوراً واضحة لورقة الإجابة");
}

export function TeacherDashboard({ onStartClass }: { onStartClass: () => void }) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [aiReport, setAiReport] = useState<AIGradeResult | null>(null);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [fallbackTelemetry, setFallbackTelemetry] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionSettings, setConnectionSettings] = useState<CustomVisionConnectionSettings>(
    defaultCustomVisionConnection,
  );
  const [isGrading, setIsGrading] = useState(false);
  const [gradingProgress, setGradingProgress] = useState<GradingProgress | null>(null);
  const [zoom, setZoom] = useState(1);
  const [exerciseDialogOpen, setExerciseDialogOpen] = useState(false);
  const [quickUploadOpen, setQuickUploadOpen] = useState(false);
  const [quickExerciseTitle, setQuickExerciseTitle] = useState("تمرين: قوانين نيوتن");
  const [quickStudentName, setQuickStudentName] = useState("كريم علي");
  const [isPreparingAnswerSheet, setIsPreparingAnswerSheet] = useState(false);

  useEffect(() => {
    const image = createSampleAnswerSheet();
    if (image)
      setSubmissions((current) =>
        current.map((submission) =>
          submission.id === "1" ? { ...submission, images: [image] } : submission,
        ),
      );
  }, []);

  useEffect(() => {
    const syncSubmission = () => {
      const latest = loadLatestSubmission();
      if (latest)
        setSubmissions((current) =>
          current.some((item) => item.id === latest.id) ? current : [latest, ...current],
        );
    };
    syncSubmission();
    window.addEventListener("midada-submission-updated", syncSubmission);
    return () => window.removeEventListener("midada-submission-updated", syncSubmission);
  }, []);

  useEffect(() => {
    setConnectionSettings(loadCustomVisionConnection());
  }, []);

  const updateConnectionSettings = (next: CustomVisionConnectionSettings) => {
    setConnectionSettings(next);
    saveCustomVisionConnection(next);
  };
  const changeProvider = (provider: AIProvider) => {
    const defaults =
      provider === "openai-compatible"
        ? defaultOpenAICompatibleConnection
        : defaultCustomVisionConnection;
    updateConnectionSettings({ ...defaults, apiToken: connectionSettings.apiToken });
  };

  const openStudio = (submission: Submission) => {
    setActiveSubmission(submission);
    setScore(submission.grade?.toString() ?? "");
    setFeedback(submission.feedback ?? "");
    setAiReport(null);
    setGradingError(null);
    setFallbackTelemetry(null);
    setZoom(1);
  };
  const createTeacherSubmission = async (files: FileList | null) => {
    if (!files?.length) {
      toast.error("ارفع صور ورقة الإجابة أولاً");
      return;
    }
    if (!quickExerciseTitle.trim() || !quickStudentName.trim()) {
      toast.error("أدخل عنوان التمرين واسم الطالب");
      return;
    }
    setIsPreparingAnswerSheet(true);
    try {
      const images = await prepareAnswerSheet(files);
      const submission: Submission = {
        id: crypto.randomUUID(),
        student: quickStudentName.trim(),
        status: "بانتظار التصحيح",
        fileName: `AnswerSheet_${quickStudentName.trim().replaceAll(" ", "_")}.jpg`,
        images,
        exerciseTitle: quickExerciseTitle.trim(),
      };
      setSubmissions((current) => [submission, ...current]);
      setQuickUploadOpen(false);
      openStudio(submission);
      toast.success("تم إدراج ورقة الطالب وفتح استوديو التصحيح");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز ورقة الإجابة");
    } finally {
      setIsPreparingAnswerSheet(false);
    }
  };
  const replaceAnswerSheet = async (files: FileList | null) => {
    if (!activeSubmission || !files?.length) return;
    setIsPreparingAnswerSheet(true);
    try {
      const images = await prepareAnswerSheet(files);
      const updatedSubmission = {
        ...activeSubmission,
        images,
        fileName: `AnswerSheet_${activeSubmission.student.replaceAll(" ", "_")}.jpg`,
      };
      setActiveSubmission(updatedSubmission);
      setSubmissions((current) =>
        current.map((entry) => (entry.id === updatedSubmission.id ? updatedSubmission : entry)),
      );
      setAiReport(null);
      toast.success("تم استبدال ورقة الإجابة وتجهيزها للتصحيح");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز ورقة الإجابة");
    } finally {
      setIsPreparingAnswerSheet(false);
    }
  };
  const autoGrade = async () => {
    if (!activeSubmission) return;
    setIsGrading(true);
    setGradingError(null);
    setFallbackTelemetry(null);
    setGradingProgress({ stage: 1, message: "1/3 جاري ضغط وتحويل صورة الورقة..." });
    try {
      const report = await gradeSubmissionWithAI(
        {
          exerciseTitle: activeSubmission.exerciseTitle ?? "التمرين",
          studentImagesBase64: activeSubmission.images ?? [],
        },
        connectionSettings,
        setGradingProgress,
      );
      setAiReport(report);
      setScore(String(report.score));
      setFeedback(report.studentFeedback);
      toast.success("اكتمل تقرير وكيل التصحيح الذكي");
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تنفيذ التصحيح الذكي";
      const telemetry = getTechnicalTelemetry(error);
      const fallback = createSmartFallbackGrade(activeSubmission.exerciseTitle ?? "التمرين");
      setAiReport(fallback);
      setScore(String(fallback.score));
      setFeedback(fallback.studentFeedback);
      setFallbackTelemetry(telemetry);
      setGradingError(message);
      toast.warning("تم استخدام المحرك الذكي الاحتياطي؛ راجِع التقرير قبل الاعتماد.");
    } finally {
      setIsGrading(false);
    }
  };
  const quickTestConnection = async () => {
    setIsTestingConnection(true);
    setGradingError(null);
    try {
      const result = await testVisionConnection(connectionSettings);
      setGradingError(result.telemetry);
      if (result.ok) toast.success("تم فحص الاتصال بنجاح");
      else toast.error("فشل اختبار الاتصال؛ يظهر السبب أدناه");
    } finally {
      setIsTestingConnection(false);
    }
  };
  const copyTechnicalReport = async () => {
    if (!fallbackTelemetry) return;
    try {
      await navigator.clipboard.writeText(fallbackTelemetry);
      toast.success("تم نسخ التقرير التقني");
    } catch {
      toast.error("تعذر نسخ التقرير التقني");
    }
  };
  const saveGrade = () => {
    if (!activeSubmission || !score) {
      toast.error("أدخل العلامة قبل اعتماد النتيجة");
      return;
    }
    const parsedScore = Number(score);
    if (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 20) {
      toast.error("أدخل علامة بين 0 و20");
      return;
    }
    setSubmissions((current) =>
      current.map((entry) =>
        entry.id === activeSubmission.id
          ? { ...entry, status: "تم التصحيح", grade: parsedScore, feedback }
          : entry,
      ),
    );
    setActiveSubmission(null);
    toast.success("تم اعتماد النتيجة وإرسالها للطالب");
  };

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-accent-foreground">مساحة الأستاذ</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">مرحباً أستاذ أحمد</h1>
          <p className="mt-2 text-muted-foreground">تابع حصصك وتمارين طلابك من مكان واحد.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setExerciseDialogOpen(true)}>
            <Plus />
            إنشاء تمرين جديد
          </Button>
        </div>
      </section>
      <section>
        <div className="mb-4 flex items-center gap-2">
          <CalendarClock className="size-5 text-primary" />
          <h2 className="text-xl font-bold">الحصص المباشرة القادمة</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {sessions.map((session) => (
            <article key={session.group} className="border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{session.group}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {session.subject} · {session.students} طالباً
                  </p>
                </div>
                <Badge variant="secondary">{session.time}</Badge>
              </div>
              <Button className="mt-5 w-full sm:w-auto" onClick={onStartClass}>
                <Video />
                بدء الحصة المباشرة
              </Button>
            </article>
          ))}
        </div>
      </section>
      <section className="border border-border bg-card shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-border p-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="size-5 text-primary" />
              <h2 className="text-xl font-bold">مركز التمارين والتصحيح الذكي</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              اختر إجابة لفتح استوديو التصحيح والاعتماد.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{submissions.length} إجابات</Badge>
            <Button onClick={() => setQuickUploadOpen(true)}>
              <Upload />
              رفع ورقة طالب وتصحيحها بالوكيل
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الطالب</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">الملف</TableHead>
              <TableHead className="text-right">العلامة</TableHead>
              <TableHead className="text-right">الملاحظات</TableHead>
              <TableHead className="text-right">إجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.map((submission) => (
              <TableRow key={submission.id}>
                <TableCell className="font-semibold">{submission.student}</TableCell>
                <TableCell>
                  <Badge variant={submission.status === "تم التصحيح" ? "secondary" : "outline"}>
                    {submission.status}
                  </Badge>
                </TableCell>
                <TableCell dir="ltr" className="text-xs text-muted-foreground">
                  {submission.fileName}
                </TableCell>
                <TableCell>
                  {submission.grade !== undefined ? `${submission.grade}/20` : "—"}
                </TableCell>
                <TableCell className="max-w-48 text-xs text-muted-foreground">
                  {submission.feedback ?? "بانتظار المراجعة"}
                </TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => openStudio(submission)}>
                    <Sparkles />
                    استوديو التصحيح
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <Dialog open={quickUploadOpen} onOpenChange={setQuickUploadOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>رفع ورقة طالب للتصحيح الفوري</DialogTitle>
            <DialogDescription>
              أدخل بيانات الطالب ثم أضف صور أوراق إجابته لفتح الاستوديو مباشرة.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={quickExerciseTitle}
              onChange={(event) => setQuickExerciseTitle(event.target.value)}
              placeholder="عنوان التمرين أو الموضوع"
            />
            <Input
              value={quickStudentName}
              onChange={(event) => setQuickStudentName(event.target.value)}
              placeholder="اسم الطالب"
            />
            <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-input bg-muted/30 p-5 text-center text-sm text-muted-foreground">
              <Camera className="size-7 text-primary" />
              اضغط لإضافة صور ورقة الإجابة أو التقاطها
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(event) => void createTeacherSubmission(event.target.files)}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickUploadOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={exerciseDialogOpen} onOpenChange={setExerciseDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إنشاء تمرين جديد</DialogTitle>
            <DialogDescription>
              يُحفظ كمسودة تجريبية إلى حين ربط قاعدة البيانات الخارجية.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder="عنوان التمرين" />
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="اختر المجموعة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="science">مجموعة البكالوريا العلمية</SelectItem>
                <SelectItem value="middle">الثالثة إعدادي</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex cursor-pointer flex-col items-center gap-2 border border-dashed border-input p-6 text-sm text-muted-foreground">
              <FileText className="size-6" />
              رفع ملف أسئلة PDF
              <input className="sr-only" type="file" accept="application/pdf" />
            </label>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setExerciseDialogOpen(false);
                toast.success("تم إنشاء مسودة التمرين");
              }}
            >
              حفظ المسودة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
