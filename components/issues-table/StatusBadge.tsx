import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getContrastColor } from "@/lib/utils";

export function StatusBadge({
  label,
  color,
  rawLabel,
  groupedFrom,
}: {
  label: string;
  color: string;
  rawLabel?: string;
  groupedFrom?: string[];
}) {
  const fg = getContrastColor(color);
  const hasGroup = groupedFrom && groupedFrom.length > 0;

  const badge = (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: color, color: fg }}
    >
      {label}
    </span>
  );

  if (!hasGroup && !rawLabel) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="right">
        {hasGroup ? (
          <div>
            원본 상태:&nbsp;
            <span className="font-medium">{groupedFrom!.join(", ")}</span>
          </div>
        ) : (
          <div>원본: {rawLabel}</div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
