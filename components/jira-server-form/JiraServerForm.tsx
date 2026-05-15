"use client";

import * as React from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  createServer,
  updateServer,
  testConnection,
  type ServerInput,
} from "@/actions/servers";

type Props = {
  mode: "create" | "edit";
  initial?: { id: string; name: string; baseUrl: string; authType: string };
  onDone?: () => void;
};

export function JiraServerForm({ mode, initial, onDone }: Props) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [baseUrl, setBaseUrl] = React.useState(initial?.baseUrl ?? "");
  const [authType, setAuthType] = React.useState<"pat" | "basic">(
    (initial?.authType as "pat" | "basic") ?? "pat",
  );
  const [email, setEmail] = React.useState("");
  const [token, setToken] = React.useState("");
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<
    | { ok: true; user: string }
    | { ok: false; error: string }
    | null
  >(null);
  const [pending, startTransition] = useTransition();

  async function doTest() {
    if (!baseUrl.trim() || !token.trim()) {
      setTestResult({ ok: false, error: "Base URL과 토큰을 입력하세요" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const result = await testConnection({ baseUrl, authType, email, token });
    setTesting(false);
    setTestResult(result);
  }

  async function doSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload: ServerInput = {
          name,
          baseUrl,
          authType,
          email: authType === "basic" ? email : undefined,
          token,
        };
        if (mode === "create") {
          await createServer(payload);
          toast.success("서버를 추가했습니다");
        } else if (initial) {
          await updateServer(initial.id, payload);
          toast.success("서버 설정을 업데이트했습니다");
        }
        onDone?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  return (
    <form onSubmit={doSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">이름</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="회사 Jira"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="baseUrl">Base URL</Label>
        <Input
          id="baseUrl"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://jira.example.com"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>인증 방식</Label>
        <Select value={authType} onValueChange={(v) => setAuthType(v as "pat" | "basic")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pat">Personal Access Token (Server/DC)</SelectItem>
            <SelectItem value="basic">Email + API Token (Cloud)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {authType === "basic" && (
        <div className="space-y-2">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="token">{authType === "pat" ? "PAT" : "API 토큰"}</Label>
        <Input
          id="token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={mode === "edit" ? "변경하려면 새 토큰 입력" : "토큰을 붙여넣으세요"}
          required={mode === "create"}
        />
        <p className="text-xs text-muted-foreground">
          토큰은 AES-256-GCM으로 암호화되어 로컬 DB에 저장됩니다.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={doTest} disabled={testing || pending}>
          {testing ? <Loader2 className="animate-spin" /> : null}
          연결 테스트
        </Button>
        {testResult && testResult.ok && (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            {testResult.user}로 인증됨
          </div>
        )}
        {testResult && !testResult.ok && (
          <div className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="truncate max-w-[40ch]">{testResult.error}</span>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {mode === "create" ? "추가" : "저장"}
        </Button>
      </div>
    </form>
  );
}
