"use client";

import * as React from "react";
import { useTransition } from "react";
import { CheckCircle2, AlertCircle, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { parseIssueList, type RegisteredServer } from "@/lib/jira/url-parser";
import { testJql } from "@/actions/jql";

export type SourceItem = {
  serverId: string;
  sourceType: "jql" | "urls";
  jql?: string;
  issueUrls?: string[];
};

type Props = {
  servers: RegisteredServer[];
  value: SourceItem[];
  onChange: (next: SourceItem[]) => void;
};

export function SourceEditor({ servers, value, onChange }: Props) {
  function update(idx: number, patch: Partial<SourceItem>) {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  function remove(idx: number) {
    const next = [...value];
    next.splice(idx, 1);
    onChange(next);
  }

  function add() {
    onChange([
      ...value,
      {
        serverId: servers[0]?.id ?? "",
        sourceType: "jql",
        jql: "",
        issueUrls: [],
      },
    ]);
  }

  if (servers.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          먼저 <a className="underline" href="/settings/servers">Jira 서버</a>를 등록하세요.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {value.map((src, idx) => (
        <SourceCard
          key={idx}
          source={src}
          servers={servers}
          onChange={(p) => update(idx, p)}
          onRemove={() => remove(idx)}
        />
      ))}
      <Button type="button" variant="outline" onClick={add}>
        <Plus className="h-4 w-4" />
        소스 추가
      </Button>
    </div>
  );
}

function SourceCard({
  source,
  servers,
  onChange,
  onRemove,
}: {
  source: SourceItem;
  servers: RegisteredServer[];
  onChange: (patch: Partial<SourceItem>) => void;
  onRemove: () => void;
}) {
  const [testResult, setTestResult] = React.useState<
    null | { ok: true; count: number } | { ok: false; error: string }
  >(null);
  const [testing, startTesting] = useTransition();

  async function runTest() {
    if (!source.jql || !source.jql.trim()) {
      setTestResult({ ok: false, error: "JQL을 입력하세요" });
      return;
    }
    if (!source.serverId) {
      setTestResult({ ok: false, error: "서버를 먼저 선택하세요" });
      return;
    }
    setTestResult(null);
    startTesting(async () => {
      try {
        const r = await testJql({ serverId: source.serverId, jql: source.jql ?? "" });
        setTestResult(r);
      } catch (err) {
        setTestResult({
          ok: false,
          error: err instanceof Error ? err.message : "쿼리 테스트 실패",
        });
      }
    });
  }

  const urlsText = (source.issueUrls ?? []).join("\n");
  const { parsed: parsedUrls, errors: urlErrors } = React.useMemo(
    () => parseIssueList(urlsText, servers, source.serverId),
    [urlsText, servers, source.serverId],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm">소스</CardTitle>
        <Button variant="ghost" size="icon" type="button" aria-label="소스 삭제" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Jira 서버</Label>
            <Select
              value={source.serverId}
              onValueChange={(v) => onChange({ serverId: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {servers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>소스 타입</Label>
            <Select
              value={source.sourceType}
              onValueChange={(v) => onChange({ sourceType: v as "jql" | "urls" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="jql">JQL 쿼리</SelectItem>
                <SelectItem value="urls">이슈 URL 목록</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {source.sourceType === "jql" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>JQL</Label>
              <div className="flex items-center gap-2">
                {testResult?.ok && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {testResult.count}개 매칭
                  </span>
                )}
                {testResult && !testResult.ok && (
                  <span className="flex items-center gap-1 text-xs text-destructive truncate max-w-[40ch]">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {testResult.error}
                  </span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={runTest}
                  disabled={testing}
                >
                  {testing ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : null}
                  쿼리 테스트
                </Button>
              </div>
            </div>
            <Textarea
              value={source.jql ?? ""}
              onChange={(e) => onChange({ jql: e.target.value })}
              placeholder="assignee = currentUser() AND status != Done ORDER BY updated DESC"
              className="font-mono text-xs min-h-[100px]"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label>이슈 URL (한 줄에 하나)</Label>
            <Textarea
              value={urlsText}
              onChange={(e) =>
                onChange({
                  issueUrls: e.target.value
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter(Boolean),
                })
              }
              placeholder={"https://jira.example.com/browse/PROJ-123\nhttps://jira.example.com/browse/PROJ-124"}
              className="font-mono text-xs min-h-[120px]"
            />
            {parsedUrls.length > 0 && (
              <p className="text-xs text-emerald-600">
                <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
                {parsedUrls.length}개 URL 파싱 성공
              </p>
            )}
            {urlErrors.length > 0 && (
              <ul className="text-xs text-destructive space-y-0.5">
                {urlErrors.map((e, i) => (
                  <li key={i} className="truncate">
                    <AlertCircle className="inline h-3.5 w-3.5 mr-1" />
                    {e.input}: {e.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
