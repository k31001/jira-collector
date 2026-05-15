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

export const REQUIRED_COLUMNS: ColumnKey[] = [
  "key",
  "status",
  "summary",
  "latestComment",
  "note",
];

export const ALL_COLUMNS: { key: ColumnKey; label: string; required?: boolean }[] = [
  { key: "key", label: "Key", required: true },
  { key: "status", label: "상태", required: true },
  { key: "summary", label: "Summary", required: true },
  { key: "latestComment", label: "최근 코멘트", required: true },
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
