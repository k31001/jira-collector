import {
  listDashboardIdsByRatio,
  listRatioConfigs,
  listResolutionDashboardsBrief,
} from "@/lib/db/queries";
import { PageHeader } from "@/components/page-header";
import { RatioAnalysisClient } from "./RatioAnalysisClient";

export const dynamic = "force-dynamic";

export default async function RatioAnalysisSettingsPage() {
  const configs = listRatioConfigs();
  const allDashboards = listResolutionDashboardsBrief();
  const selectionByRatio = listDashboardIdsByRatio();
  return (
    <>
      <PageHeader
        title="비율 분석"
        description="분자와 분모를 JQL로 정의해 '전체 중 특정 조건의 비중'을 추세로 봅니다. 예: 분자 issuetype = Bug, 분모 비움(전체) → 버그 유입 비율. 각 비율마다 표시할 Resolution Time 대시보드를 선택하면 해당 대시보드의 비율 분석 카드에 노출됩니다."
      />
      <div className="p-6">
        <RatioAnalysisClient
          initialConfigs={configs}
          allDashboards={allDashboards}
          selectionByRatio={selectionByRatio}
        />
      </div>
    </>
  );
}
