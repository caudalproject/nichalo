"use client";

import { useEffect, useRef, useState } from "react";
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
import { getCurrencyForCountry, getExchangeRate } from "@/lib/currency";

interface Props {
  creditsLeft: number;
  plan: string;
}

type PerfilVendedor = "principiante" | "intermedio" | "experto";

const PERFIL_OPTIONS: { value: PerfilVendedor; label: string; desc: string }[] = [
  { value: "principiante", label: "Principiante", desc: "Cuenta nueva o menos de 6 meses. Pocas o ninguna venta." },
  { value: "intermedio", label: "Intermedio", desc: "Cuenta activa con ventas. Reputación verde o amarilla." },
  { value: "experto", label: "Experto", desc: "Cuenta consolidada. Reputación naranja o roja." },
];

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB

const PROGRESS: Record<string, number> = {
  pending: 15,
  scraping: 33,
  analyzing: 66,
  done: 100,
};

export function AnalizarForm({ creditsLeft, plan }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [producto, setProducto] = useState("");
  const [pais, setPais] = useState<"AR" | "MX" | "CO">("AR");
  const [perfilVendedor, setPerfilVendedor] = useState<PerfilVendedor>("principiante");
  const [costo, setCosto] = useState("");
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("image/jpeg");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stepMessage, setStepMessage] = useState("Iniciando análisis...");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const noCredits = creditsLeft <= 0;

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Load exchange rate when country changes
  useEffect(() => {
    const currency = getCurrencyForCountry(pais);
    if (currency.code === "USD") {
      setExchangeRate(1);
      return;
    }
    let cancelled = false;
    getExchangeRate(currency.code).then((rate) => {
      if (!cancelled) setExchangeRate(rate);
    });
    return () => { cancelled = true; };
  }, [pais]);

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

  function startPolling(jobId: string) {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/analizar/status?id=${jobId}`);
        if (!res.ok) return;

        const data = await res.json();

        setProgress(PROGRESS[data.status] ?? 15);
        if (data.step_message) setStepMessage(data.step_message);

        if (data.status === "done") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          router.push(`/resultado/${data.analysis_id}`);
        } else if (data.status === "error") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setError(data.error_message || "Ocurrió un error durante el análisis.");
          setLoading(false);
        }
      } catch {
        // Network error — keep polling
      }
    }, 3000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (noCredits) {
      setError("No te quedan análisis en tu plan. Actualizá a Starter o Pro para continuar.");
      return;
    }

    const costoLocalParsed = parseFloat(costo.replace(",", "."));
    const costoUSDSubmit = exchangeRate ? costoLocalParsed / exchangeRate : costoLocalParsed;
    if (!producto.trim() || producto.trim().length < 2) {
      setError("Ingresá un producto válido (mínimo 2 caracteres).");
      return;
    }
    if (!Number.isFinite(costoLocalParsed) || costoLocalParsed <= 0) {
      setError("Ingresá un costo estimado mayor a 0.");
      return;
    }

    setLoading(true);
    setProgress(5);
    setStepMessage(imageBase64 ? "Analizando imagen..." : "Iniciando análisis...");

    try {
      const body: Record<string, unknown> = {
        producto: producto.trim(),
        pais,
        costoEstimado: costoUSDSubmit,
        perfilVendedor,
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

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 402) {
          setError("No te quedan análisis. Actualizá tu plan para seguir.");
        } else if (res.status === 401) {
          setError("Tu sesión expiró. Volvé a ingresar.");
        } else {
          setError(data?.detail || data?.error || "Error desconocido.");
        }
        setLoading(false);
        return;
      }

      // Cache hit or image analysis — redirect immediately
      if (data.id) {
        router.push(`/resultado/${data.id}`);
        return;
      }

      // Background job — start polling
      if (data.job_id) {
        setProgress(PROGRESS.pending);
        setStepMessage("Iniciando análisis...");
        startPolling(data.job_id);
        return;
      }

      setError("Respuesta inesperada del servidor.");
      setLoading(false);
    } catch (err) {
      setError(String(err));
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
            <Label>Perfil de vendedor</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {PERFIL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPerfilVendedor(opt.value)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    perfilVendedor === opt.value
                      ? "border-[#16A34A] bg-[#DCFCE7]"
                      : "border-[#E5E7EB] bg-[#F9FAFB] hover:border-[#D1D5DB]"
                  }`}
                >
                  <span className="block text-sm font-medium text-[#0A0A0A]">{opt.label}</span>
                  <span className="block text-xs text-[#6B7280] mt-0.5">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {(() => {
              const currency = getCurrencyForCountry(pais);
              const costoLocal = parseFloat(costo.replace(",", "."));
              const costoUSD =
                exchangeRate && !isNaN(costoLocal) && costoLocal > 0
                  ? costoLocal / exchangeRate
                  : null;
              return (
                <>
                  <Label htmlFor="costo">Costo estimado ({currency.code})</Label>
                  <Input
                    id="costo"
                    type="text"
                    inputMode="decimal"
                    placeholder={currency.code === "USD" ? "Ej: 35.00" : "Ej: 14.900"}
                    value={costo}
                    onChange={(e) => setCosto(e.target.value)}
                    required
                  />
                  {costoUSD !== null ? (
                    <p className="text-xs text-muted-foreground">
                      ≈ ${costoUSD.toFixed(2)} USD
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {currency.code === "USD"
                        ? "Ingresá el costo en dólares"
                        : `Ingresá el costo en ${currency.name}`}
                    </p>
                  )}
                </>
              );
            })()}
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

          {loading && (
            <div className="rounded-md border bg-muted/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                {stepMessage}
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-700 ease-in-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Esto puede tardar hasta 5 minutos
              </p>
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
