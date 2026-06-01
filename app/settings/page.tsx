import Link from "next/link";
import { Server, Tag, Palette, Sliders } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const items = [
  {
    href: "/settings/servers",
    title: "Jira 서버",
    description: "이슈 출처가 되는 Jira 서버(여러 개 가능)를 등록합니다.",
    icon: Server,
  },
  {
    href: "/settings/custom-statuses",
    title: "커스텀 상태",
    description: "여러 Jira 상태를 하나의 사용자 정의 상태로 묶어 표시합니다.",
    icon: Tag,
  },
  {
    href: "/settings/status-colors",
    title: "상태 컬러 오버라이드",
    description: "원본 Jira 상태의 표시 색상을 사용자 지정합니다.",
    icon: Palette,
  },
  {
    href: "/settings/smart-filters",
    title: "커스텀 스마트 필터",
    description:
      "라벨 조합 같은 커스텀 분류를 직접 정의해 Resolution Time 대시보드 필터로 사용합니다.",
    icon: Sliders,
  },
];

export default function SettingsHubPage() {
  return (
    <>
      <PageHeader
        title="설정"
        description="대시보드 동작을 결정하는 핵심 설정들을 한 곳에서 관리합니다."
      />
      <div className="p-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="group">
              <Card className="transition-shadow hover:shadow-md h-full">
                <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                  <div className="rounded-md bg-accent p-2 text-accent-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-base group-hover:underline">
                      {item.title}
                    </CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent />
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
