import { useEffect, useState } from "react";
import { CalendarClock, Camera, CheckCircle2, ClipboardCheck, Eye, FileText, Plus, ScanLine, Settings2, Sparkles, Upload, Video, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

import { defaultCustomVisionConnection, gradeSubmissionWithAI, loadCustomVisionConnection, saveCustomVisionConnection, type AIGradeResult, type CustomVisionConnectionSettings } from "@/services/aiGradingAgent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Submission } from "./types";

const sessions = [{ group: "مجموعة البكالوريا العلمية", subject: "الفيزياء", time: "اليوم · 17:00", students: 14 }, { group: "الثالثة إعدادي", subject: "الرياضيات", time: "غداً · 10:30", students: 11 }];
const initialSubmissions: Submission[] = [
  { id: "1", student: "كريم علي", status: "بانتظار التصحيح", fileName: "Quiz1_Physics_Karim.pdf", exerciseTitle: "تمرين: قوانين نيوتن" },
  { id: "2", student: "سارة محمد", status: "تم التصحيح", fileName: "Quiz1_Physics_Sara.pdf", grade: 18, feedback: "حل منظم جداً، راجعي فقط تحويل الوحدات في السؤال الأخير.", exerciseTitle: "تمرين: قوانين نيوتن" },
  { id: "3", student: "ياسين عمر", status: "بانتظار التصحيح", fileName: "Quiz1_Physics_Yassine.pdf", exerciseTitle: "تمرين: قوانين نيوتن" },
];

function loadLatestSubmission() {
  try { return JSON.parse(window.localStorage.getItem("midada-latest-submission") ?? "null") as Submission | null; } catch { return null; }
}

async function prepareAnswerSheet(files: FileList | File[]) {
  const selectedFiles = Array.from(files);
  if (!selectedFiles.length) throw new Error("اختر صورة أو ملف PDF واحداً على الأقل");
  const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length) {
    return Promise.all(imageFiles.map(async (file) => {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("تعذر تجهيز صورة الإجابة");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const compressed = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("تعذر ضغط صورة الإجابة")), "image/jpeg", 0.82));
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("تعذر قراءة صورة الإجابة"));
        reader.readAsDataURL(compressed);
      });
    }));
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
  const [connectionSettings, setConnectionSettings] = useState<CustomVisionConnectionSettings>(defaultCustomVisionConnection);
  const [isGrading, setIsGrading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [exerciseDialogOpen, setExerciseDialogOpen] = useState(false);
  const [quickUploadOpen, setQuickUploadOpen] = useState(false);
  const [quickExerciseTitle, setQuickExerciseTitle] = useState("تمرين: قوانين نيوتن");
  const [quickStudentName, setQuickStudentName] = useState("كريم علي");
  const [isPreparingAnswerSheet, setIsPreparingAnswerSheet] = useState(false);

  useEffect(() => {
    const syncSubmission = () => {
      const latest = loadLatestSubmission();
      if (latest) setSubmissions((current) => current.some((item) => item.id === latest.id) ? current : [latest, ...current]);
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

  const openStudio = (submission: Submission) => {
    setActiveSubmission(submission);
    setScore(submission.grade?.toString() ?? "");
    setFeedback(submission.feedback ?? "");
    setAiReport(null);
    setGradingError(null);
    setZoom(1);
  };
  const createTeacherSubmission = async (files: FileList | null) => {
    if (!files?.length) { toast.error("ارفع صور ورقة الإجابة أولاً"); return; }
    if (!quickExerciseTitle.trim() || !quickStudentName.trim()) { toast.error("أدخل عنوان التمرين واسم الطالب"); return; }
    setIsPreparingAnswerSheet(true);
    try {
      const images = await prepareAnswerSheet(files);
      const submission: Submission = { id: crypto.randomUUID(), student: quickStudentName.trim(), status: "بانتظار التصحيح", fileName: `AnswerSheet_${quickStudentName.trim().replaceAll(" ", "_")}.jpg`, images, exerciseTitle: quickExerciseTitle.trim() };
      setSubmissions((current) => [submission, ...current]);
      setQuickUploadOpen(false);
      openStudio(submission);
      toast.success("تم إدراج ورقة الطالب وفتح استوديو التصحيح");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تجهيز ورقة الإجابة"); }
    finally { setIsPreparingAnswerSheet(false); }
  };
  const replaceAnswerSheet = async (files: FileList | null) => {
    if (!activeSubmission || !files?.length) return;
    setIsPreparingAnswerSheet(true);
    try {
      const images = await prepareAnswerSheet(files);
      const updatedSubmission = { ...activeSubmission, images, fileName: `AnswerSheet_${activeSubmission.student.replaceAll(" ", "_")}.jpg` };
      setActiveSubmission(updatedSubmission);
      setSubmissions((current) => current.map((entry) => entry.id === updatedSubmission.id ? updatedSubmission : entry));
      setAiReport(null);
      toast.success("تم استبدال ورقة الإجابة وتجهيزها للتصحيح");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تجهيز ورقة الإجابة"); }
    finally { setIsPreparingAnswerSheet(false); }
  };
  const autoGrade = async () => {
    if (!activeSubmission) return;
    setIsGrading(true);
    setGradingError(null);
    try {
      const report = await gradeSubmissionWithAI({ exerciseTitle: activeSubmission.exerciseTitle ?? "التمرين", studentImagesBase64: activeSubmission.images ?? [] }, connectionSettings);
      setAiReport(report);
      setScore(String(report.score));
      setFeedback(report.studentFeedback);
      toast.success("اكتمل تقرير وكيل التصحيح الذكي");
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر تنفيذ التصحيح الذكي";
      setGradingError(message);
      toast.error(message);
    }
    finally { setIsGrading(false); }
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
    setSubmissions((current) => current.map((entry) => entry.id === activeSubmission.id ? { ...entry, status: "تم التصحيح", grade: parsedScore, feedback } : entry));
    setActiveSubmission(null);
    toast.success("تم اعتماد النتيجة وإرسالها للطالب");
  };

  return <div className="space-y-8">
    <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-accent-foreground">مساحة الأستاذ</p><h1 className="mt-1 text-3xl font-bold text-foreground">مرحباً أستاذ أحمد</h1><p className="mt-2 text-muted-foreground">تابع حصصك وتمارين طلابك من مكان واحد.</p></div><div className="flex gap-2"><Button onClick={() => setExerciseDialogOpen(true)}><Plus />إنشاء تمرين جديد</Button></div></section>
    <section><div className="mb-4 flex items-center gap-2"><CalendarClock className="size-5 text-primary" /><h2 className="text-xl font-bold">الحصص المباشرة القادمة</h2></div><div className="grid gap-4 lg:grid-cols-2">{sessions.map((session) => <article key={session.group} className="border border-border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{session.group}</p><p className="mt-1 text-sm text-muted-foreground">{session.subject} · {session.students} طالباً</p></div><Badge variant="secondary">{session.time}</Badge></div><Button className="mt-5 w-full sm:w-auto" onClick={onStartClass}><Video />بدء الحصة المباشرة</Button></article>)}</div></section>
    <section className="border border-border bg-card shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-border p-5 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><ClipboardCheck className="size-5 text-primary" /><h2 className="text-xl font-bold">مركز التمارين والتصحيح الذكي</h2></div><p className="mt-1 text-sm text-muted-foreground">اختر إجابة لفتح استوديو التصحيح والاعتماد.</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{submissions.length} إجابات</Badge><Button onClick={() => setQuickUploadOpen(true)}><Upload />رفع ورقة طالب وتصحيحها بالوكيل</Button></div></div><Table><TableHeader><TableRow><TableHead className="text-right">الطالب</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">الملف</TableHead><TableHead className="text-right">العلامة</TableHead><TableHead className="text-right">الملاحظات</TableHead><TableHead className="text-right">إجراء</TableHead></TableRow></TableHeader><TableBody>{submissions.map((submission) => <TableRow key={submission.id}><TableCell className="font-semibold">{submission.student}</TableCell><TableCell><Badge variant={submission.status === "تم التصحيح" ? "secondary" : "outline"}>{submission.status}</Badge></TableCell><TableCell dir="ltr" className="text-xs text-muted-foreground">{submission.fileName}</TableCell><TableCell>{submission.grade !== undefined ? `${submission.grade}/20` : "—"}</TableCell><TableCell className="max-w-48 text-xs text-muted-foreground">{submission.feedback ?? "بانتظار المراجعة"}</TableCell><TableCell><Button size="sm" onClick={() => openStudio(submission)}><Sparkles />استوديو التصحيح</Button></TableCell></TableRow>)}</TableBody></Table></section>
    <Dialog open={quickUploadOpen} onOpenChange={setQuickUploadOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>رفع ورقة طالب للتصحيح الفوري</DialogTitle><DialogDescription>أدخل بيانات الطالب ثم أضف صور أوراق إجابته لفتح الاستوديو مباشرة.</DialogDescription></DialogHeader><div className="space-y-4"><Input value={quickExerciseTitle} onChange={(event) => setQuickExerciseTitle(event.target.value)} placeholder="عنوان التمرين أو الموضوع" /><Input value={quickStudentName} onChange={(event) => setQuickStudentName(event.target.value)} placeholder="اسم الطالب" /><label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-input bg-muted/30 p-5 text-center text-sm text-muted-foreground"><Camera className="size-7 text-primary" />اضغط لإضافة صور ورقة الإجابة أو التقاطها<input className="sr-only" type="file" accept="image/*" capture="environment" multiple onChange={(event) => void createTeacherSubmission(event.target.files)} /></label></div><DialogFooter><Button variant="outline" onClick={() => setQuickUploadOpen(false)}>إلغاء</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={exerciseDialogOpen} onOpenChange={setExerciseDialogOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>إنشاء تمرين جديد</DialogTitle><DialogDescription>يُحفظ كمسودة تجريبية إلى حين ربط قاعدة البيانات الخارجية.</DialogDescription></DialogHeader><div className="space-y-4"><Input placeholder="عنوان التمرين" /><Select><SelectTrigger><SelectValue placeholder="اختر المجموعة" /></SelectTrigger><SelectContent><SelectItem value="science">مجموعة البكالوريا العلمية</SelectItem><SelectItem value="middle">الثالثة إعدادي</SelectItem></SelectContent></Select><label className="flex cursor-pointer flex-col items-center gap-2 border border-dashed border-input p-6 text-sm text-muted-foreground"><FileText className="size-6" />رفع ملف أسئلة PDF<input className="sr-only" type="file" accept="application/pdf" /></label></div><DialogFooter><Button onClick={() => { setExerciseDialogOpen(false); toast.success("تم إنشاء مسودة التمرين"); }}>حفظ المسودة</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(activeSubmission)} onOpenChange={(open) => !open && setActiveSubmission(null)}><DialogContent dir="rtl" className="max-h-[90vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>استوديو التصحيح الذكي</DialogTitle><DialogDescription>{activeSubmission?.student} · <span dir="ltr">{activeSubmission?.fileName}</span></DialogDescription></DialogHeader><div className="grid gap-6 lg:grid-cols-2"><section className="border border-border bg-muted/20 p-4"><div className="mb-3 flex items-center justify-between"><p className="font-bold">معاينة أوراق الطالب</p><div className="flex gap-1"><Button size="icon" variant="outline" aria-label="تصغير المعاينة" onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))}><ZoomOut /></Button><Button size="icon" variant="outline" aria-label="تكبير المعاينة" onClick={() => setZoom((value) => Math.min(2, value + 0.2))}><ZoomIn /></Button></div></div><label className="mb-3 flex cursor-pointer items-center justify-center gap-2 border border-dashed border-input bg-background p-3 text-sm font-semibold text-primary"><Camera className="size-4" />إدراج / استبدال ورقة الإجابة<input className="sr-only" type="file" accept="image/*" capture="environment" multiple disabled={isPreparingAnswerSheet} onChange={(event) => void replaceAnswerSheet(event.target.files)} /></label><div className="flex min-h-80 items-center justify-center overflow-auto border border-dashed border-border bg-background p-4">{activeSubmission?.images?.length ? <div className="space-y-4" style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>{activeSubmission.images.map((image, index) => <img key={image} src={image} alt={`صفحة الحل ${index + 1}`} className="max-w-full border border-border" />)}</div> : <div className="text-center text-sm text-muted-foreground"><Eye className="mx-auto mb-3 size-8" />أضف صور ورقة الإجابة لتبدأ التصحيح.</div>}</div><p className="mt-3 text-sm text-muted-foreground">التمرين: {activeSubmission?.exerciseTitle ?? "تمرين: قوانين نيوتن"}</p></section><section className="space-y-4"><details open className="border border-border bg-muted/30"><summary className="flex cursor-pointer items-center gap-2 p-3 text-sm font-semibold"><Settings2 className="size-4 text-primary" />إعدادات اتصال الوكيل (Connection Settings) ⚙️</summary><div className="space-y-3 border-t border-border p-3"><label className="block space-y-1 text-sm font-medium">API Token<Input type="password" autoComplete="off" value={connectionSettings.apiToken} onChange={(event) => updateConnectionSettings({ ...connectionSettings, apiToken: event.target.value })} placeholder="ألصق الرمز الخاص بك" /></label><label className="block space-y-1 text-sm font-medium">Vision Endpoint URL<Input dir="ltr" type="url" value={connectionSettings.endpointUrl} onChange={(event) => updateConnectionSettings({ ...connectionSettings, endpointUrl: event.target.value })} placeholder={defaultCustomVisionConnection.endpointUrl} /></label><p className="text-xs text-muted-foreground">يُحفظ الرمز والرابط لهذه الجلسة فقط على هذا المتصفح.</p></div></details><Button className="w-full" disabled={isGrading || isPreparingAnswerSheet || !activeSubmission?.images?.length} onClick={() => void autoGrade()}>{isGrading ? <ScanLine className="animate-pulse" /> : <Sparkles />} {isGrading ? "يجري فحص أوراق الطالب…" : "تصحيح تلقائي بالوكيل الذكي"}</Button>{gradingError && <div role="alert" className="border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><p className="font-semibold">تعذر إكمال التصحيح</p><p className="mt-1" dir="auto">{gradingError}</p></div>}{aiReport && <div className="border border-accent/35 bg-accent/10 p-4"><p className="font-semibold">{aiReport.summary}</p><div className="mt-3 space-y-2">{aiReport.stepByStepCorrection.map((step) => <div key={step.title} className="border-r-2 border-primary pr-3 text-sm"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{step.title}</p><Badge variant={step.result === "correct" ? "secondary" : "outline"}>{step.result === "correct" ? "صحيح" : step.result === "incorrect" ? "يحتاج تصحيحاً" : "مراجعة"}</Badge></div><p className="mt-1 text-muted-foreground">{step.note}</p></div>)}</div></div>}<Input value={score} onChange={(event) => setScore(event.target.value)} inputMode="decimal" placeholder="النقطة النهائية / 20" /><Textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="ملاحظات الأستاذ للطالب" rows={6} /></section></div><DialogFooter><Button variant="outline" onClick={() => setActiveSubmission(null)}>إلغاء</Button><Button onClick={saveGrade}><CheckCircle2 />اعتماد النتيجة وإرسالها للطالب</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}