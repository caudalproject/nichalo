"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalysisRow, Veredicto } from "@/lib/supabase";

interface Props {
  analysis: Pick<
    AnalysisRow,
    "id" | "producto" | "pais" | "score" | "veredicto" | "created_at"
  >;
  onDelete?: (id: string) => void;
}

const PAIS_LABEL: Record<string, string> = {
  AR: "Argentina",
  MX: "México",
  CO: "Colombia",
};

function veredictoVariant(v: Veredicto): "success" | "warning" | "destructive" {
  if (v === "VIABLE") return "success";
  if (v === "MARGINAL") return "warning";
  return "destructive";
}

export function AnalysisCard({ analysis, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className="relative">
        <Link href={`/resultado/${analysis.id}`} className="block">
          <Card className="border-[#E5E7EB] rounded-lg shadow-sm hover:shadow-md hover:border-[#E5E7EB] transition-all duration-150 cursor-pointer">
            <CardContent className={`flex items-center justify-between gap-4 p-4 ${onDelete ? "pr-12" : ""}`}>
              <div className="min-w-0">
                <div className="truncate font-medium text-[#0A0A0A]">
                  {analysis.producto}
                </div>
                <div className="text-xs text-[#6B7280] mt-0.5" suppressHydrationWarning>
                  {PAIS_LABEL[analysis.pais] ?? analysis.pais} ·{" "}
                  {new Date(analysis.created_at).toLocaleString("es-AR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-xs text-[#6B7280]">Score</div>
                  <div className="text-lg font-semibold text-[#0A0A0A]">
                    {analysis.score}
                  </div>
                </div>
                <Badge variant={veredictoVariant(analysis.veredicto)}>
                  {analysis.veredicto}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </Link>

        {onDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#6B7280] hover:text-red-600 transition-colors rounded"
            aria-label="Eliminar análisis"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="bg-white rounded-lg p-6 shadow-xl max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[#0A0A0A]">
              ¿Eliminar este análisis?
            </h3>
            <p className="mt-2 text-sm text-[#6B7280]">
              Esta acción no se puede deshacer.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm border border-[#E5E7EB] rounded-md text-[#0A0A0A] hover:bg-[#F9FAFB] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete?.(analysis.id);
                }}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
