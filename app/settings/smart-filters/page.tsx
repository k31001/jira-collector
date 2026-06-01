import { listCustomFacetsWithValues } from "@/lib/db/queries";
import { PageHeader } from "@/components/page-header";
import { SmartFiltersClient } from "./SmartFiltersClient";

export const dynamic = "force-dynamic";

export default async function SmartFiltersSettingsPage() {
  const facets = listCustomFacetsWithValues();
  return (
    <>
      <PageHeader
        title="커스텀 스마트 필터"
        description="이슈 필드를 그대로 facet으로 쓸 수 없을 때(예: 라벨 조합) 직접 정의합니다. 항목과 값을 만들고 각 값에 JQL 표현을 붙이세요. Resolution Time 대시보드의 스마트 필터에 자동으로 노출됩니다."
      />
      <div className="p-6">
        <SmartFiltersClient initialFacets={facets} />
      </div>
    </>
  );
}
