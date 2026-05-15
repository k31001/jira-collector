"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { setFavorite } from "@/actions/dashboards";
import { useRouter } from "next/navigation";

export function FavoriteButton({
  id,
  favorite,
}: {
  id: string;
  favorite: boolean;
}) {
  const router = useRouter();
  const [opt, setOpt] = React.useState(favorite);

  async function toggle() {
    const next = !opt;
    setOpt(next);
    try {
      await setFavorite(id, next);
      router.refresh();
    } catch {
      setOpt(opt);
    }
  }

  return (
    <button onClick={toggle} className="text-muted-foreground hover:text-amber-400" aria-label="즐겨찾기">
      <Star className={opt ? "h-5 w-5 fill-current text-amber-400" : "h-5 w-5"} />
    </button>
  );
}
