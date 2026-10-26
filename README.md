# Extra Hours Hub

Proceed and write all the frontend code, components, and UI views now using mock data and a standalone `src/lib/supabase.ts` file. Do not create a Lovable Cloud backend project—just generate the React files directly.

### ⚠️ CRITICAL ARCHITECTURAL RULE - READ FIRST:

DO NOT use or trigger "Lovable Cloud" or Lovable's native/managed Supabase integration. DO NOT prompt me to connect Supabase via the Lovable UI button.
We will connect an **EXTERNAL, self-managed Supabase project** manually.
Instead, create a standard `src/lib/supabase.ts` client configuration file that reads from `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY` (with a safe fallback to mock data if the keys are not yet provided so the app renders without crashing).

---

### Project Overview:

Build a modern, clean, RTL (Right-to-Left) Arabic SaaS web application for "Tutoring & Extra Hours Centers" (منصة مراكز الساعات الإضافية والدعم عن بعد). Use a professional color palette (Deep Indigo `#1e1b4b`, Emerald Green `#10b981` for active states/credits, and Slate white/gray backgrounds) with the 'Cairo' or 'Tajawal' Google Font.

### 1. Core Architecture & Roles

We have 3 main user roles (create a simple role-switcher in the top navbar for now so we can test all views easily before connecting external Supabase Auth):

1. **Center Admin (مدير المركز):** Manages teachers, students, study groups, and hour packages (باقات الساعات).
2. **Teacher (الأستاذ):** Manages live sessions, uploads PDF exercises, and grades student submissions using the "Gemini Bridge".
3. **Student (الطالب):** Sees remaining credit hours, joins live interactive classes, and submits photographed handwritten exercises.

### 2. Main Views & Features to Build Now

#### A. Teacher Dashboard (لوحة تحكم الأستاذ)

- **Upcoming Live Sessions (الحصص المباشرة القادمة):** Cards showing group name, subject, time, and a "Start Live Class (بدء الحصة المباشرة)" button.
- **Exercises & Gemini Grading Hub (مركز التمارين والتصحيح الذكي):**
  - Ability to create a new Exercise (Title, Group, and upload Questions PDF).
  - A table of "Student Submissions (إجابات الطلاب)" showing: Student Name, Submission Status, Merged File Name (e.g., `Quiz1_Physics_Karim.pdf`), Grade (out of 20), and Feedback.
  - **Crucial Feature - The "Correct with Gemini" Action:** Next to each student submission, add a prominent button called "تصحيح عبر Gemini ✨". When clicked, it must:
    1. Automatically copy this exact formatted prompt to the clipboard (dynamically inserting the file name):
       `@Google Drive افتح الملف المسمى [FILENAME]. الصفحة الأولى تحتوي على أسئلة التمرين، والصفحات التالية تحتوي على إجابات الطالب بخط اليد. بصفتك أستاذاً خبيراً في المادة، قم بحل الأسئلة بنفسك أولاً، ثم صحح إجابات الطالب بناءً على ذلك خطوة بخطوة، ووضح أين أخطأ، وامنحه تقييماً نهائياً من 20 مع نصيحة مختصرة لتطوير مستواه.`
    2. Show a toast notification: "تم نسخ أمر التصحيح! الصقه الآن في Gemini".
    3. Open `https://gemini.google.com` in a new tab.
    4. Open a quick modal/drawer in our app where the teacher can paste Gemini's feedback and enter the final score (e.g., 17/20) to save it.

#### B. Student Dashboard (لوحة تحكم الطالب)

- **Wallet / Hour Balance Header (رصيد الساعات):** Visual cards showing remaining hours per subject (e.g., "الفيزياء: 8 ساعات متبقية", "الرياضيات: 4 ساعات متبقية") with a progress bar.
- **Join Live Class Banner:** Active alert when a class is live with a "دخول الفصل الافتراضي" button.
- **Pending Exercises (التمارين المطلوبة):** List of exercises assigned by the teacher. Each card has:
  - "معاينة الأسئلة (View PDF)" button.
  - "تصوير وإرسال الحل (Submit Solution)" button: Opens a clean modal with a camera/image upload dropzone (`accept="image/*" capture="environment"`) ready for our future `pdf-lib` auto-merge logic.
  - Section to view completed grades and teacher's detailed feedback once graded.

#### C. Virtual Classroom Shell (غرفة الدراسة عن بعد - `/classroom/:id`)

Build the layout shell for the live session (75% main stage, 25% sidebar):

- **Main Stage (75% width):** A clean container reserved for the Interactive Whiteboard (Excalidraw placeholder for now) with a top toolbar showing session timer, subject title, and "End Session & Deduct Hours (إنهاء الحصة وخصم الساعات)" button for the teacher.
- **Sidebar (25% width):**
  - Top half: Compact video grid placeholder for Teacher & Active Student (LiveKit/Jitsi shell).
  - Bottom half: Live attendance list showing students in the room and a "Raise Hand (رفع اليد)" interaction button.

#### D. Center Admin View (لوحة إدارة المركز)

- Quick stats: Active Students, Total Hours Consumed This Month, Active Teachers.
- Simple table to add/recharge student hour credits (شحن رصيد الساعات للطالب).

### 3. Technical Guidelines:

- Keep the code modular, clean, and well-structured in separate components (`TeacherDashboard`, `StudentDashboard`, `ClassroomShell`, `AdminDashboard`).
- **Reminder:** Do not invoke the native Lovable Cloud/Supabase integration plugin. Prepare `src/lib/supabase.ts` using standard `@supabase/supabase-js` so I can manually inject my own external URL and Anon Key later.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8fb4cdb2-d099-4c23-a088-6b5c11facbb9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
