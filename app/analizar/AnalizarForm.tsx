"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  creditsLeft: number;
  plan: string;
}

type StepId = "cache" | "scraping" | "analyzing" | "topseller" | "ai" | "verdict" | "done";

interface ProgressStep {
  id: StepId | "error";
  msg: string;
  done: boolean;
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB

export function AnalizarForm({ creditsLeft, plan }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [producto, setProducto] = useState("");
  const [pais, setPais] = useState<"AR" | "MX" | "CO">("AR");
  const [costo, setCosto] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("image/jpeg");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<ProgressStep[]>([]);

  const noCredits = creditsLeft <= 0;

  function addStep(id: StepId | "error", msg: string) {
    setSteps((prev) => {
      const updated = prev.map((s) => (s.done ? s : { ...s, done: true }));
      return [...updated, { id, msg, done: false }];
    });
  }

  function handleFile(file: File) {
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`La imagen supera el límite de 4 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
      return;
    }
    setError(null);
    setSelectedFileName(file.name);
    setImageMimeType(file.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      // Strip the "data:image/xxx;base64," prefix — Gemini wants raw base64
      const base64 = dataUrl.split(",")[1] ?? "";
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function removeImage() {
    setImageBase64(null);
    setSelectedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSteps([]);

    if (noCredits) {
      setError("No te quedan análisis en tu plan. Actualizá a Starter o Pro para continuar.");
      return;
    }

    const costoNum = Number(costo);
    if (!producto.trim() || producto.trim().length < 2) {
      setError("Ingresá un producto válido (mínimo 2 caracteres).");
      return;
    }
    if (!Number.isFinite(costoNum) || costoNum <= 0) {
      setError("Ingresá un costo estimado mayor a 0.");
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        producto: producto.trim(),
        pais,
        costoEstimado: costoNum,
      };
      if (imageBase64) {
        body.imagenBase64 = imageBase64;
        body.imagenMimeType = imageMimeType;
      }

      const res = await fetch("/api/analizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Handle non-streaming error responses (401, 402, 422, 500)
      if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json();
        if (res.status === 402) {
          setError("No te quedan análisis. Actualizá tu plan para seguir.");
        } else if (res.status === 401) {
          setError("Tu sesión expiró. Volvé a ingresar.");
        } else {
          setError(data?.detail || data?.error || "Error desconocido.");
        }
        return;
      }

      if (!res.body) {
        setError("No se recibió respuesta del servidor.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue;
          }

          const step = event.step as string;
          const msg = event.msg as string | undefined;

          if (step === "done") {
            addStep("done", "✅ ¡Análisis completado!");
            router.push(`/resultado/${event.id as string}`);
            return;
          } else if (step === "error") {
            setError((event.error as string) || "Error inesperado.");
            setLoading(false);
            return;
          } else if (msg) {
            addStep(step as StepId, msg);
          }
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="producto">Producto a validar</Label>
            <Input
              id="producto"
              placeholder="Ej: cafetera moka inducción 6 tazas"
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              required
              minLength={2}
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground">
              Cuanto más específico, mejor el análisis.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pais">País</Label>
              <Select
                value={pais}
                onValueChange={(v) => setPais(v as "AR" | "MX" | "CO")}
              >
                <SelectTrigger id="pais">
                  <SelectValue placeholder="Elegí un país" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AR">Argentina (MLA)</SelectItem>
                  <SelectItem value="MX">México (MLM)</SelectItem>
                  <SelectItem value="CO">Colombia (MCO)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="costo">Costo estimado (USD)</Label>
              <Input
                id="costo"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                placeholder="35.00"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Image upload */}
          <div className="space-y-2">
            <Label>Foto del producto (opcional)</Label>
            {selectedFileName ? (
              <div className="flex items-center gap-3 p-3 border border-[#E5E7EB] rounded-lg bg-[#F9FAFB]">
                <CheckCircle className="h-5 w-5 text-[#16A34A] shrink-0" />
                <span className="text-sm text-[#0A0A0A] flex-1 truncate">
                  {selectedFileName}
                </span>
                <button
                  type="button"
                  onClick={removeImage}
                  className="text-[#6B7280] hover:text-[#0A0A0A] transition-colors"
                  aria-label="Quitar imagen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer bg-[#F9FAFB] transition-colors ${
                  isDragOver
                    ? "border-[#16A34A] bg-[#DCFCE7]"
                    : "border-[#E5E7EB]"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mx-auto h-8 w-8 text-[#6B7280]" />
                <p className="mt-2 text-sm font-medium text-[#0A0A0A]">
                  Arrastrá tu imagen acá
                </p>
                <p className="text-xs text-[#6B7280]">
                  o clickeá para seleccionar
                </p>
                <p className="mt-2 text-xs text-[#6B7280]">
                  JPG, PNG o WebP · máx. 4 MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {steps.length > 0 && (
            <div className="rounded-md border bg-muted/40 p-4 space-y-2">
              {steps.map((s, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-sm transition-opacity ${
                    s.done ? "opacity-50" : "opacity-100 font-medium"
                  }`}
                >
                  {!s.done && (
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                  )}
                  {s.done && (
                    <span className="inline-block h-3 w-3 rounded-full bg-primary/40 shrink-0" />
                  )}
                  {s.msg}
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Plan {plan} · {creditsLeft} análisis restantes
            </p>
            <Button type="submit" size="lg" disabled={loading || noCredits}>
              {loading ? "Analizando…" : "Analizar producto"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
