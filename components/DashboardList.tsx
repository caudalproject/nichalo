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
}

export function DashboardList({ initialList, userId }: Props) {
  const [list, setList] = useState(initialList);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(id: string) {
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
  }

  useEffect(() => {
    if (!deleteError) return;
    const t = setTimeout(() => setDeleteError(null), 4000);
    return () => clearTimeout(t);
  }, [deleteError]);

  if (list.length === 0) {
    return (
      <Card className="border-[#E5E7EB] rounded-lg">
        <CardContent className="p-10 text-center">
          <p className="text-lg font-medium text-[#0A0A0A]">
            Todavía no hiciste ningún análisis
          </p>
          <p className="mt-1 text-sm text-[#6B7280]">
            Validá tu primer producto — te lleva menos de un minuto.
          </p>
          <div className="mt-6">
            <Link href="/analizar">
              <Button className="rounded-md">Analizar un producto</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {deleteError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-2">
          {deleteError}
        </p>
      )}
      {list.map((a) => (
        <AnalysisCard key={a.id} analysis={a} onDelete={handleDelete} />
      ))}
    </div>
  );
}
