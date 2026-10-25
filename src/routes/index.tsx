import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, ChevronDown, GraduationCap, LayoutDashboard, Wifi } from "lucide-react";

import { AdminDashboard } from "@/components/dashboard/AdminDashboard";
import { ClassroomShell } from "@/components/dashboard/ClassroomShell";
import { StudentDashboard } from "@/components/dashboard/StudentDashboard";
import { TeacherDashboard } from "@/components/dashboard/TeacherDashboard";
import type { UserRole } from "@/components/dashboard/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isSupabaseConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "منصة الساعات الإضافية | لوحة التحكم" },
      { name: "description", content: "لوحات لإدارة مركز الدعم، الحصص المباشرة، الرصيد والتمارين." },
      { property: "og:title", content: "منصة الساعات الإضافية | لوحة التحكم" },
      { property: "og:description", content: "لوحات لإدارة مركز الدعم، الحصص المباشرة، الرصيد والتمارين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const roleDetails: Record<UserRole, { label: string; name: string }> = {
  teacher: { label: "الأستاذ", name: "أحمد بن سالم" },
  student: { label: "الطالب", name: "كريم علي" },
  admin: { label: "مدير المركز", name: "مركز النور" },
};

function Index() {
  const [role, setRole] = useState<UserRole>("teacher");
  const [inClassroom, setInClassroom] = useState(false);

  if (inClassroom) return <ClassroomShell role={role === "student" ? "student" : "teacher"} onLeave={() => setInClassroom(false)} />;

  const details = roleDetails[role];
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-18 max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground"><GraduationCap className="size-6" /></span><div><p className="text-lg font-bold leading-none">مِداد</p><p className="mt-1 text-xs text-muted-foreground">مراكز الساعات الإضافية</p></div></div>
          <div className="flex flex-wrap items-center gap-3"><Badge variant={isSupabaseConfigured ? "secondary" : "outline"}><Wifi className="size-3" />{isSupabaseConfigured ? "متصل بالبيانات" : "وضع تجريبي"}</Badge><Button aria-label="الإشعارات" variant="ghost" size="icon"><Bell /></Button><div className="hidden h-7 w-px bg-border sm:block" /><div className="min-w-48"><Select value={role} onValueChange={(value) => setRole(value as UserRole)}><SelectTrigger className="bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="teacher">تجربة دور الأستاذ</SelectItem><SelectItem value="student">تجربة دور الطالب</SelectItem><SelectItem value="admin">تجربة دور مدير المركز</SelectItem></SelectContent></Select></div><div className="hidden text-right sm:block"><p className="text-sm font-bold">{details.name}</p><p className="text-xs text-muted-foreground">{details.label}</p></div><ChevronDown className="size-4 text-muted-foreground" /></div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl lg:grid-cols-[13rem_1fr] lg:px-6">
        <aside className="hidden border-l border-border bg-card p-4 lg:block"><nav className="space-y-1"><div className="flex items-center gap-3 bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground"><LayoutDashboard className="size-4" />لوحة التحكم</div><div className="px-3 py-2 text-sm text-muted-foreground">{role === "teacher" ? "الحصص والتمارين" : role === "student" ? "حسابي وتماريني" : "الرصيد والطلاب"}</div></nav></aside>
        <main className="px-4 py-8 lg:px-8">{role === "teacher" && <TeacherDashboard onStartClass={() => setInClassroom(true)} />}{role === "student" && <StudentDashboard onJoinClass={() => setInClassroom(true)} />}{role === "admin" && <AdminDashboard />}</main>
      </div>
    </div>
  );
}
