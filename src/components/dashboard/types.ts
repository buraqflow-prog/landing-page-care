export type UserRole = "teacher" | "student" | "admin";

export type Submission = {
  id: string;
  student: string;
  status: "بانتظار التصحيح" | "تم التصحيح";
  fileName: string;
  fileUrl?: string;
  grade?: number;
  feedback?: string;
  images?: string[];
  exerciseTitle?: string;
};
