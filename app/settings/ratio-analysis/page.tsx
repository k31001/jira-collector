import { countDashboardsByRatio, listRatioConfigs } from "@/lib/db/queries";
import { PageHeader } from "@/components/page-header";
import { RatioAnalysisClient } from "./RatioAnalysisClient";

export const dynamic = "force-dynamic";

export default async function RatioAnalysisSettingsPage() {
  const configs = listRatioConfigs();
  const usage = Object.fromEntries(countDashboardsByRatio());
  return (
    <>
      <PageHeader
        title="비율 분석"
        description="분자와 분모를 JQL로 정의해 '전체 중 특정 조건의 비중'을 추세로 봅니다. 예: 분자 issuetype = Bug, 분모 비움(전체) → 버그 유입 비율. 여기서 정의한 비율은 공유 라이브러리이며, 각 Resolution Time 대시보드 편집 화면에서 표시할 비율을 선택합니다."
      />
      <div className="p-6">
        <RatioAnalysisClient initialConfigs={configs} usage={usage} />
      </div>
    </>
  );
}
