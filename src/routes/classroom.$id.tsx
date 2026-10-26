import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ClassroomShell } from "@/components/dashboard/ClassroomShell";

export const Route = createFileRoute("/classroom/$id")({
  head: () => ({
    meta: [
      { title: "الفصل الافتراضي | منصة الساعات الإضافية" },
      { name: "description", content: "فصل افتراضي للحصص المباشرة واللوح التفاعلي." },
      { property: "og:title", content: "الفصل الافتراضي | منصة الساعات الإضافية" },
      { property: "og:description", content: "فصل افتراضي للحصص المباشرة واللوح التفاعلي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClassroomRoute,
});

function ClassroomRoute() {
  const navigate = useNavigate();
  const { id } = Route.useParams();
  return <ClassroomShell sessionId={id} onLeave={() => navigate({ to: "/" })} />;
}
