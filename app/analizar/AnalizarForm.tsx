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

const STATUS_PROGRESS: Record<string, number> = {
  pending: 10,
  scraping: 25,
  analyzing: 80,
  done: 100,
};

const MESSAGE_PROGRESS: Record<string, number> = {
  "Iniciando análisis...": 10,
  "Analizando imagen...": 15,
  "Buscando productos en Mercado Libre...": 25,
  "Scrapeando publicaciones de Mercado Libre...": 40,
  "Buscando con keywords alternativas...": 45,
  "Obteniendo más publicaciones...": 50,
  "Analizando tendencias del mercado...": 60,
  "Calculando tamaño del mercado...": 70,
  "Analizando competencia con IA...": 80,
  "¡Análisis completado!": 100,
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
  const [origenProducto, setOrigenProducto] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [tieneVariantes, setTieneVariantes] = useState('');
  const [detalleVariantes, setDetalleVariantes] = useState('');
  const [canalDistribucion, setCanalDistribucion] = useState('');
  const [loading, setLoading] = useState(false);
  const [stepMessage, setStepMessage] = useState("Iniciando análisis...");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const noCredits = creditsLeft <= 0;

  // Pre-fill from query params (e.g. coming from "Analizar este producto →")
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const productoParam = params.get("producto");
    const paisParam = params.get("pais");
    if (productoParam) setProducto(productoParam);
    if (paisParam && ["AR", "MX", "CO"].includes(paisParam)) setPais(paisParam as "AR" | "MX" | "CO");
  }, []);

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

        if (data.step_message) {
          setStepMessage(data.step_message);
          setProgress(MESSAGE_PROGRESS[data.step_message] ?? STATUS_PROGRESS[data.status] ?? 10);
        } else {
          setProgress(STATUS_PROGRESS[data.status] ?? 10);
        }

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
        datos_pro: plan === 'pro' ? {
          origen_producto: origenProducto || null,
          presupuesto_inicial: presupuesto ? parseFloat(presupuesto.replace(',', '.')) / (exchangeRate ?? 1) : null,
          tiene_variantes: tieneVariantes || null,
          detalle_variantes: tieneVariantes === 'si' ? detalleVariantes : null,
          canal_distribucion: canalDistribucion || null,
        } : null,
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
        setProgress(STATUS_PROGRESS.pending);
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

          {/* Sección Pro */}
          {plan === 'pro' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">Análisis avanzado</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">Pro</span>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Origen del producto</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Importado (China/Asia)', 'Nacional', 'Dropshipping'].map(origen => (
                    <button key={origen} type="button"
                      onClick={() => setOrigenProducto(origen)}
                      className={`text-xs py-2 px-3 rounded-lg border text-center transition-all ${
                        origenProducto === origen
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      {origen}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                {(() => {
                  const currency = getCurrencyForCountry(pais);
                  const presupuestoLocal = parseFloat(presupuesto.replace(',', '.'));
                  const presupuestoUSD = exchangeRate && !isNaN(presupuestoLocal) && presupuestoLocal > 0
                    ? presupuestoLocal / exchangeRate
                    : null;
                  return (
                    <>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Presupuesto inicial ({currency.code})
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder={currency.code === 'USD' ? 'Ej: 500' : 'Ej: 500.000'}
                        value={presupuesto}
                        onChange={e => setPresupuesto(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      {presupuestoUSD !== null ? (
                        <p className="text-xs text-gray-400 mt-1">≈ ${presupuestoUSD.toFixed(2)} USD</p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1">Cuánto tenés disponible para invertir en stock</p>
                      )}
                    </>
                  );
                })()}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">¿El producto tiene variantes?</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{label: 'Sí (talle, color, modelo)', value: 'si'}, {label: 'No', value: 'no'}].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setTieneVariantes(opt.value)}
                      className={`text-xs py-2 px-3 rounded-lg border text-center transition-all ${
                        tieneVariantes === opt.value
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                {tieneVariantes === 'si' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="Ej: talle S/M/L/XL, colores negro y blanco"
                      value={detalleVariantes}
                      onChange={e => setDetalleVariantes(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Describí las variantes que vas a ofrecer</p>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">¿Dónde vas a vender?</label>
                <div className="grid grid-cols-1 gap-2">
                  {['Solo Mercado Libre', 'ML + tienda propia', 'ML + otros marketplaces'].map(canal => (
                    <button key={canal} type="button"
                      onClick={() => setCanalDistribucion(canal)}
                      className={`text-xs py-2 px-3 rounded-lg border text-left transition-all ${
                        canalDistribucion === canal
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      {canal}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Análisis avanzado Pro</p>
                <p className="text-xs text-gray-500 mt-0.5">Origen, presupuesto, variantes y canal de distribución</p>
              </div>
              <a href="/#planes" className="text-xs font-semibold text-green-600 hover:text-green-700 whitespace-nowrap ml-4">
                Ver planes →
              </a>
            </div>
          )}

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
                Estamos analizando publicaciones reales de ML en este momento
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
              Plan {plan} · {creditsLeft} análisis restante{creditsLeft !== 1 ? 's' : ''}
              {plan === 'free' && creditsLeft === 1 && (
                <span className="ml-1 text-amber-600 font-medium">— es tu único análisis gratis</span>
              )}
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
