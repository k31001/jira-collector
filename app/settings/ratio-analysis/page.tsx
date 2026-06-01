import { listRatioConfigs } from "@/lib/db/queries";
import { PageHeader } from "@/components/page-header";
import { RatioAnalysisClient } from "./RatioAnalysisClient";

export const dynamic = "force-dynamic";

export default async function RatioAnalysisSettingsPage() {
  const configs = listRatioConfigs();
  return (
    <>
      <PageHeader
        title="비율 분석"
        description="분자와 분모를 JQL로 정의해 '전체 중 특정 조건의 비중'을 추세로 봅니다. 예: 분자 issuetype = Bug, 분모 비움(전체) → 버그 유입 비율. Resolution Time 대시보드에 비율 분석 카드로 노출됩니다."
      />
      <div className="p-6">
        <RatioAnalysisClient initialConfigs={configs} />
      </div>
    </>
  );
}
