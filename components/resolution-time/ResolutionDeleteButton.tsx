"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteResolutionDashboard } from "@/actions/resolution-dashboards";

export function ResolutionDeleteButton({
  id,
  name,
  children,
}: {
  id: string;
  name: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onDelete() {
    if (!confirm(`"${name}" 대시보드를 삭제할까요?`)) return;
    setPending(true);
    try {
      await deleteResolutionDashboard(id);
      toast.success("삭제했습니다");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="삭제"
      disabled={pending}
      onClick={onDelete}
    >
      {children}
    </Button>
  );
}
