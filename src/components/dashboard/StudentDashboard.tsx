import { useEffect, useState } from "react";
import { BookOpen, Camera, CheckCircle2, Clock3, Download, FileText, Video } from "lucide-react";
import { toast } from "sonner";

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
import { Progress } from "@/components/ui/progress";
import { buildMergedSubmission, type MergedSubmission } from "@/lib/pdf-submission";

const balances = [
  { subject: "الفيزياء", hours: 8, total: 12 },
  { subject: "الرياضيات", hours: 4, total: 10 },
  { subject: "علوم الحياة", hours: 6, total: 8 },
];

export function StudentDashboard({ onJoinClass }: { onJoinClass: () => void }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [mergedPdf, setMergedPdf] = useState<MergedSubmission | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  useEffect(
    () => () => {
      if (mergedPdf) URL.revokeObjectURL(mergedPdf.url);
    },
    [mergedPdf],
  );
  const createMergedPdf = async () => {
    if (!selectedFiles?.length) {
      toast.error("اختر صورة واحدة على الأقل للحل");
      return;
    }
    setIsMerging(true);
    try {
      const merged = await buildMergedSubmission({
        exerciseId: "newton-01",
        exerciseTitle: "تمرين: قوانين نيوتن",
        studentName: "كريم علي",
        files: Array.from(selectedFiles),
      });
      setMergedPdf((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return merged;
      });
      toast.success("تم تجهيز ملف PDF المدمج");
    } catch {
      toast.error("تعذر إنشاء ملف PDF. تأكد من أن الصور قابلة للقراءة.");
    } finally {
      setIsMerging(false);
    }
  };
  const sendSubmission = async () => {
    if (!mergedPdf || !selectedFiles?.length) return;
    try {
      const images = await Promise.all(
        Array.from(selectedFiles).map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error("تعذر قراءة الصورة"));
              reader.readAsDataURL(file);
            }),
        ),
      );
      window.localStorage.setItem(
        "midada-latest-submission",
        JSON.stringify({
          id: crypto.randomUUID(),
          student: "كريم علي",
          status: "بانتظار التصحيح",
          fileName: mergedPdf.fileName,
          images,
          exerciseTitle: "تمرين: قوانين نيوتن",
        }),
      );
      window.dispatchEvent(new Event("midada-submission-updated"));
      setUploadOpen(false);
      setSubmitted(true);
      toast.success("تم استلام الحل وهو جاهز للتصحيح الذكي");
    } catch {
      toast.error("تعذر تجهيز صور الحل للإرسال");
    }
  };
  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-semibold text-accent-foreground">مساحة الطالب</p>
        <h1 className="mt-1 text-3xl font-bold">صباح التعلّم يا كريم</h1>
        <p className="mt-2 text-muted-foreground">لديك حصة مباشرة وتمرين يحتاج إلى حل.</p>
      </section>
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Clock3 className="size-5 text-primary" />
          <h2 className="text-xl font-bold">رصيد الساعات</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {balances.map((balance) => (
            <article key={balance.subject} className="border border-border bg-card p-5 shadow-sm">
              <div className="flex justify-between">
                <p className="font-bold">{balance.subject}</p>
                <span className="text-sm font-semibold text-accent-foreground">
                  {balance.hours} ساعات
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">متبقية من {balance.total} ساعة</p>
              <Progress className="mt-4" value={(balance.hours / balance.total) * 100} />
            </article>
          ))}
        </div>
      </section>
      <section className="border border-accent/35 bg-accent/20 p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center bg-accent text-accent-foreground">
              <Video className="size-5" />
            </span>
            <div>
              <p className="font-bold">حصة الفيزياء بدأت الآن</p>
              <p className="text-sm text-muted-foreground">قوانين نيوتن · مع الأستاذ أحمد</p>
            </div>
          </div>
          <Button onClick={onJoinClass}>دخول الفصل الافتراضي</Button>
        </div>
      </section>
      <section>
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="size-5 text-primary" />
          <h2 className="text-xl font-bold">التمارين المطلوبة</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold">تمرين: قوانين نيوتن</p>
                <p className="mt-1 text-sm text-muted-foreground">الفيزياء · التسليم غداً</p>
              </div>
              <Badge variant="outline">قيد الانتظار</Badge>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              حل المسائل بخط اليد ثم صوّر صفحات الإجابة وأرسلها.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => toast.message("ستتوفر معاينة ملف الأسئلة بعد ربط التخزين الخارجي")}
              >
                <FileText />
                معاينة الأسئلة
              </Button>
              <Button onClick={() => setUploadOpen(true)}>
                <Camera />
                تصوير وإرسال الحل
              </Button>
            </div>
          </article>
          <article className="border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold">اختبار الحركة</p>
                <p className="mt-1 text-sm text-muted-foreground">الفيزياء · تم التقييم</p>
              </div>
              <Badge variant="secondary">18/20</Badge>
            </div>
            <div className="mt-4 border-r-2 border-accent pr-3 text-sm text-muted-foreground">
              إجابات ممتازة. راجع تحويل الوحدات في السؤال الأخير لتصل إلى العلامة الكاملة.
            </div>
          </article>
        </div>
      </section>
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إرسال حل التمرين</DialogTitle>
            <DialogDescription>
              تُضغط الصور وتُدمج مع صفحة التمرين في ملف PDF واحد.
            </DialogDescription>
          </DialogHeader>
          <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-input bg-muted/40 p-6 text-center text-sm text-muted-foreground">
            <Camera className="size-8 text-primary" />
            <span>
              {selectedFiles?.length
                ? `تم اختيار ${selectedFiles.length} صورة`
                : "اضغط لالتقاط الصور أو اختيارها من جهازك"}
            </span>
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(event) => {
                setSelectedFiles(event.target.files);
                setMergedPdf(null);
              }}
            />
          </label>
          {mergedPdf && (
            <a
              className="flex items-center justify-center gap-2 border border-border bg-muted/30 p-3 text-sm font-semibold text-primary"
              href={mergedPdf.url}
              download={mergedPdf.fileName}
            >
              <Download className="size-4" />
              معاينة أو تنزيل الملف المدمج
            </a>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              إلغاء
            </Button>
            <Button variant="outline" disabled={isMerging} onClick={createMergedPdf}>
              <FileText />
              {isMerging ? "جارٍ الدمج…" : "إنشاء ملف مدمج"}
            </Button>
            <Button disabled={!mergedPdf} onClick={() => void sendSubmission()}>
              <CheckCircle2 />
              إرسال الحل
            </Button>
          </DialogFooter>
          {submitted && (
            <p className="text-center text-sm text-accent-foreground">
              تم الإرسال، بانتظار تقييم الأستاذ.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
