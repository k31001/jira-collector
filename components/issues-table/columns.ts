export type ColumnKey =
  | "key"
  | "status"
  | "summary"
  | "latestComment"
  | "note"
  | "assignee"
  | "reporter"
  | "created"
  | "updated"
  | "resolved"
  | "priority"
  | "issueType"
  | "labels"
  | "serverName";

export const REQUIRED_COLUMNS: ColumnKey[] = ["key", "status", "summary", "note"];

export const ALL_COLUMNS: { key: ColumnKey; label: string; required?: boolean }[] = [
  { key: "key", label: "Key", required: true },
  { key: "status", label: "상태", required: true },
  { key: "summary", label: "Summary", required: true },
  { key: "latestComment", label: "최근 코멘트" },
  { key: "note", label: "내 메모", required: true },
  { key: "assignee", label: "담당자" },
  { key: "reporter", label: "보고자" },
  { key: "created", label: "생성일" },
  { key: "updated", label: "수정일" },
  { key: "resolved", label: "해결일" },
  { key: "priority", label: "우선순위" },
  { key: "issueType", label: "이슈 타입" },
  { key: "labels", label: "Labels" },
  { key: "serverName", label: "서버" },
];

export function columnLabel(key: ColumnKey): string {
  return ALL_COLUMNS.find((c) => c.key === key)?.label ?? key;
}

/**
 * Merge a persisted column order with the canonical ALL_COLUMNS list.
 * Stored columns come first (in stored order), any columns added later in
 * ALL_COLUMNS are appended at the end.
 */
export function reconcileColumnOrder(stored: string[] | undefined): ColumnKey[] {
  const allKeys = ALL_COLUMNS.map((c) => c.key);
  const validStored = (stored ?? []).filter((k): k is ColumnKey =>
    allKeys.includes(k as ColumnKey),
  );
  const seen = new Set<ColumnKey>(validStored);
  for (const k of allKeys) if (!seen.has(k)) validStored.push(k);
  return validStored as ColumnKey[];
}
