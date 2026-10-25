import { useState } from "react";
import { BarChart3, CreditCard, GraduationCap, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const stats = [{ label: "طلاب نشطون", value: "248", icon: Users }, { label: "ساعات مستهلكة هذا الشهر", value: "1,386", icon: BarChart3 }, { label: "أساتذة نشطون", value: "18", icon: GraduationCap }];
const initialStudents = [{ name: "كريم علي", group: "بكالوريا علمية", physics: 8, math: 4 }, { name: "سارة محمد", group: "بكالوريا علمية", physics: 5, math: 10 }, { name: "ياسين عمر", group: "الثالثة إعدادي", physics: 6, math: 7 }];

export function AdminDashboard() {
  const [hours, setHours] = useState("");
  const [students, setStudents] = useState(initialStudents);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [subject, setSubject] = useState<"physics" | "math" | "">("");
  const recharge = () => {
    const amount = Number(hours);
    if (!selectedStudent || !subject || !amount || amount <= 0) {
      toast.error("اختر الطالب والمادة وأدخل عدد ساعات صحيح");
      return;
    }
    setStudents((current) => current.map((student) => student.name === selectedStudent ? { ...student, [subject]: student[subject] + amount } : student));
    toast.success(`تمت إضافة ${amount} ساعة إلى الرصيد التجريبي`);
    setHours("");
  };
  return <div className="space-y-8"><section><p className="text-sm font-semibold text-accent-foreground">إدارة المركز</p><h1 className="mt-1 text-3xl font-bold">نظرة عامة على المركز</h1><p className="mt-2 text-muted-foreground">إدارة الرصيد والمجموعات وفريق التدريس.</p></section><section className="grid gap-4 md:grid-cols-3">{stats.map(({ label, value, icon: Icon }) => <article key={label} className="border border-border bg-card p-5 shadow-sm"><Icon className="size-5 text-primary" /><p className="mt-6 text-3xl font-bold">{value}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p></article>)}</section><section className="border border-border bg-card shadow-sm"><div className="border-b border-border p-5"><div className="flex items-center gap-2"><CreditCard className="size-5 text-primary" /><h2 className="text-xl font-bold">شحن رصيد الساعات للطالب</h2></div><p className="mt-1 text-sm text-muted-foreground">التغييرات تجريبية إلى حين ربط قاعدة البيانات الخارجية.</p></div><div className="grid gap-3 border-b border-border p-5 md:grid-cols-[1fr_1fr_1fr_auto]"><Select value={selectedStudent} onValueChange={setSelectedStudent}><SelectTrigger><SelectValue placeholder="اختر الطالب" /></SelectTrigger><SelectContent>{students.map((student) => <SelectItem value={student.name} key={student.name}>{student.name}</SelectItem>)}</SelectContent></Select><Select value={subject} onValueChange={(value) => setSubject(value as "physics" | "math")}><SelectTrigger><SelectValue placeholder="المادة" /></SelectTrigger><SelectContent><SelectItem value="physics">الفيزياء</SelectItem><SelectItem value="math">الرياضيات</SelectItem></SelectContent></Select><Input value={hours} onChange={(event) => setHours(event.target.value)} placeholder="عدد الساعات" inputMode="numeric" /><Button onClick={recharge}><Plus />شحن الرصيد</Button></div><Table><TableHeader><TableRow><TableHead className="text-right">الطالب</TableHead><TableHead className="text-right">المجموعة</TableHead><TableHead className="text-right">رصيد الفيزياء</TableHead><TableHead className="text-right">رصيد الرياضيات</TableHead></TableRow></TableHeader><TableBody>{students.map((student) => <TableRow key={student.name}><TableCell className="font-semibold">{student.name}</TableCell><TableCell>{student.group}</TableCell><TableCell>{student.physics} ساعات</TableCell><TableCell>{student.math} ساعات</TableCell></TableRow>)}</TableBody></Table></section></div>;
}