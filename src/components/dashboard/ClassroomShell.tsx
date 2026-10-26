import { useEffect, useState } from "react";
import { Hand, Mic, MonitorUp, PhoneOff, Timer, Users, Video } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { InteractiveWhiteboard } from "@/components/classroom/InteractiveWhiteboard";
import type { WhiteboardSnapshot } from "@/components/classroom/whiteboard-types";

const attendees = ["كريم علي", "سارة محمد", "ياسين عمر", "ليلى سمير", "آدم رامي"];

export function ClassroomShell({
  onLeave,
  sessionId = "physics-newton-01",
  role = "teacher",
}: {
  onLeave: () => void;
  sessionId?: string;
  role?: "teacher" | "student";
}) {
  const [elapsed, setElapsed] = useState(0);
  const [handRaised, setHandRaised] = useState(false);
  const [writerIds, setWriterIds] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<WhiteboardSnapshot | null>(null);
  useEffect(() => {
    const interval = window.setInterval(() => setElapsed((time) => time + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  const toggleWriter = (student: string) =>
    setWriterIds((current) =>
      current.includes(student) ? current.filter((id) => id !== student) : [...current, student],
    );
  const finishSession = async () => {
    if (role !== "teacher") {
      onLeave();
      return;
    }
    try {
      if (supabase) {
        const { error: updateError } = await supabase
          .from("live_sessions")
          .update({ whiteboard_snapshot: snapshot, status: "completed" })
          .eq("id", sessionId);
        if (updateError) throw updateError;
        const { error: deductError } = await supabase.rpc("deduct_group_hours", {
          session_id: sessionId,
        });
        if (deductError) throw deductError;
      }
      toast.success(supabase ? "تم حفظ السبورة وخصم الساعات" : "تم إنهاء الحصة التجريبية");
      onLeave();
    } catch {
      toast.error("تعذر إنهاء الحصة. تحقق من إعدادات قاعدة البيانات وصلاحياتها.");
    }
  };
  return (
    <div className="min-h-screen bg-muted/40 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-col gap-4 border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">مباشر الآن</Badge>
              <span className="text-sm text-muted-foreground">مجموعة البكالوريا العلمية</span>
            </div>
            <h1 className="mt-2 text-xl font-bold">الفيزياء · قوانين نيوتن والحركة</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Timer className="size-4 text-primary" />
              {minutes}:{seconds}
            </span>
            {role === "teacher" && (
              <Button variant="destructive" onClick={() => void finishSession()}>
                <PhoneOff />
                إنهاء الحصة وخصم الساعات
              </Button>
            )}
          </div>
        </header>
        <main className="grid gap-5 lg:grid-cols-4">
          <section className="min-h-[560px] border border-border bg-card lg:col-span-3">
            <div className="flex items-center gap-2 border-b border-border p-4 font-semibold">
              <MonitorUp className="size-5 text-primary" />
              اللوح التفاعلي
            </div>
            <InteractiveWhiteboard
              sessionId={sessionId}
              role={role}
              canWrite={role === "teacher" || writerIds.includes("كريم علي")}
              onSnapshotChange={setSnapshot}
            />
          </section>
          <aside className="border border-border bg-card">
            <section className="border-b border-border p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">البث المباشر</h2>
                <Video className="size-4 text-accent-foreground" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="aspect-video bg-primary p-2 text-xs text-primary-foreground">
                  الأستاذ أحمد
                </div>
                <div className="aspect-video bg-secondary p-2 text-xs text-secondary-foreground">
                  كريم علي
                </div>
              </div>
              <Button className="mt-3 w-full" variant="outline">
                <Mic />
                كتم الصوت
              </Button>
            </section>
            <section className="p-4">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-bold">
                  <Users className="size-4 text-primary" />
                  الحضور ({attendees.length})
                </h2>
                {role === "student" && (
                  <Button
                    size="sm"
                    variant={handRaised ? "secondary" : "outline"}
                    onClick={() => {
                      setHandRaised(!handRaised);
                      toast.message(handRaised ? "تم خفض اليد" : "تم رفع اليد للأستاذ");
                    }}
                  >
                    <Hand />
                    رفع اليد
                  </Button>
                )}
              </div>
              <ul className="mt-3 divide-y divide-border">
                {attendees.map((attendee, index) => (
                  <li
                    className="flex items-center justify-between gap-2 py-3 text-sm"
                    key={attendee}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-2 rounded-full ${index < 2 ? "bg-accent" : "bg-muted-foreground/40"}`}
                      />
                      <span>{attendee}</span>
                    </div>
                    {role === "teacher" && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>منح القلم</span>
                        <Switch
                          checked={writerIds.includes(attendee)}
                          onCheckedChange={() => toggleWriter(attendee)}
                        />
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </main>
      </div>
    </div>
  );
}
