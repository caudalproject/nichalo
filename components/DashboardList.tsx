"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { AnalysisCard } from "./AnalysisCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AnalysisRow } from "@/lib/supabase";

type AnalysisItem = Pick<
  AnalysisRow,
  "id" | "producto" | "pais" | "score" | "veredicto" | "created_at"
>;

interface Props {
  initialList: AnalysisItem[];
  userId: string;
  queryFailed?: boolean;
}

export function DashboardList({ initialList, userId, queryFailed }: Props) {
  const [list, setList] = useState(initialList);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (deleting) return;
    setDeleting(id);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error, count } = await supabase
        .from("analyses")
        .delete({ count: "exact" })
        .eq("id", id)
        .eq("user_id", userId);

      if (error) {
        console.error("[delete] Supabase error:", error);
        setDeleteError("No se pudo eliminar el análisis. Intentá de nuevo.");
        return;
      }

      if (count === 0) {
        console.warn("[delete] 0 rows deleted — likely missing RLS DELETE policy");
        setDeleteError("No se pudo eliminar el análisis. Intentá de nuevo.");
        return;
      }

      setDeleteError(null);
      setList((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  useEffect(() => {
    if (!deleteError) return;
    const t = setTimeout(() => setDeleteError(null), 4000);
    return () => clearTimeout(t);
  }, [deleteError]);

  if (list.length === 0) {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-8 text-center">
        {queryFailed ? (
          <>
            <p className="text-sm font-medium text-gray-900">Error al cargar tus análisis</p>
            <p className="text-xs text-gray-500 mt-1">Recargá la página para intentar de nuevo.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-900">Todavía no hiciste ningún análisis</p>
            <p className="text-xs text-gray-500 mt-2">
              <a href="/analizar" className="text-[#16A34A] hover:underline">Hacé tu primer análisis →</a>
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((a) => (
        <AnalysisCard key={a.id} analysis={a} onDelete={handleDelete} />
      ))}

      {deleteError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-full shadow-md">
          {deleteError}
        </div>
      )}
    </div>
  );
}
