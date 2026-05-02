import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  LineChart as LineIcon,
  AreaChart as AreaIcon,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { useUmsatz } from "@/hooks/useApi";
import { formatEUR } from "@/lib/format";

type ChartZeitraum = "6m" | "12m" | "jahr" | "letztesJahr" | "quartal";
type ChartTyp = "bar" | "line" | "area";
type Wert = "brutto" | "netto";

interface State {
  zeitraum: ChartZeitraum;
  typ: ChartTyp;
  wert: Wert;
}

const STORAGE_KEY = "dashboard.umsatzChart";
const DEFAULT_STATE: State = { zeitraum: "6m", typ: "bar", wert: "brutto" };

function loadState(): State {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const p = JSON.parse(raw) as Partial<State>;
    return {
      zeitraum: p.zeitraum ?? DEFAULT_STATE.zeitraum,
      typ: p.typ ?? DEFAULT_STATE.typ,
      wert: p.wert ?? DEFAULT_STATE.wert,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function monatLabelKurz(monatKey: string) {
  return new Date(monatKey + "-01").toLocaleDateString("de-DE", { month: "short" });
}
function monatLabelLang(monatKey: string) {
  return new Date(monatKey + "-01").toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
}

interface Props {
  /** Klick auf einen Monatspunkt → globaler Dashboard-Filter wird gesetzt. */
  onMonatKlick?: (jahr: string, monat: string) => void;
}

export function UmsatzChartCard({ onMonatKlick }: Props) {
  const [state, setState] = useState<State>(() => loadState());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* noop */
    }
  }, [state]);

  const heute = new Date();
  const aktJahr = String(heute.getFullYear());
  const letztesJahr = String(heute.getFullYear() - 1);

  // Datenquelle je nach Zeitraum
  const istJahr =
    state.zeitraum === "jahr" ||
    state.zeitraum === "letztesJahr" ||
    state.zeitraum === "quartal";
  const jahrParam =
    state.zeitraum === "letztesJahr" ? letztesJahr : aktJahr;

  const aktuell = useUmsatz(istJahr ? { jahr: jahrParam, monat: "alle" } : undefined);
  // Vorperiode für Δ-Berechnung
  const vorperiode = useUmsatz(
    istJahr
      ? { jahr: String(parseInt(jahrParam) - 1), monat: "alle" }
      : undefined,
  );
  // Für 6m/12m: dieselben „letzten 12 Monate" — Vorperiode = clientseitig zerlegen
  const datenAlle = aktuell.data ?? [];

  // Sichtbare Daten + Vorperiode-Daten zusammenstellen
  const { sichtbar, vorperiodeWerte } = useMemo(() => {
    if (state.zeitraum === "6m") {
      const last12 = datenAlle;
      return {
        sichtbar: last12.slice(-6),
        vorperiodeWerte: last12.slice(-12, -6),
      };
    }
    if (state.zeitraum === "12m") {
      // Für 12m gibt es keine direkte Vorperiode aus diesem Aufruf —
      // Vorperiode bleibt leer, Δ wird ausgeblendet.
      return { sichtbar: datenAlle, vorperiodeWerte: [] };
    }
    if (state.zeitraum === "jahr" || state.zeitraum === "letztesJahr") {
      return { sichtbar: datenAlle, vorperiodeWerte: vorperiode.data ?? [] };
    }
    // quartal
    const quartale = [0, 0, 0, 0].map((_, i) => ({
      monat: `Q${i + 1}`,
      brutto: 0,
      netto: 0,
    }));
    for (const u of datenAlle) {
      const m = parseInt(u.monat.slice(5, 7), 10);
      const q = Math.floor((m - 1) / 3);
      quartale[q].brutto += u.brutto;
      quartale[q].netto += u.netto;
    }
    const vp = (vorperiode.data ?? []).reduce(
      (acc, u) => {
        const m = parseInt(u.monat.slice(5, 7), 10);
        const q = Math.floor((m - 1) / 3);
        acc[q].brutto += u.brutto;
        acc[q].netto += u.netto;
        return acc;
      },
      [0, 1, 2, 3].map((i) => ({ monat: `Q${i + 1}`, brutto: 0, netto: 0 })),
    );
    return { sichtbar: quartale, vorperiodeWerte: vp };
  }, [state.zeitraum, datenAlle, vorperiode.data]);

  // Chart-Daten mit Label
  const chartData = useMemo(() => {
    return sichtbar.map((u) => ({
      ...u,
      label: u.monat.startsWith("Q") ? u.monat : monatLabelKurz(u.monat),
      labelLang: u.monat.startsWith("Q") ? u.monat : monatLabelLang(u.monat),
    }));
  }, [sichtbar]);

  // Kennzahlen
  const summe = sichtbar.reduce((s, u) => s + u[state.wert], 0);
  const summeVor = vorperiodeWerte.reduce((s, u) => s + u[state.wert], 0);
  const mittel = sichtbar.length > 0 ? summe / sichtbar.length : 0;
  const deltaPct =
    summeVor > 0 ? ((summe - summeVor) / summeVor) * 100 : null;

  const mittelLabel = state.zeitraum === "quartal" ? "Ø / Quartal" : "Ø / Monat";

  // Klick-Handler nur sinnvoll für Monatsdaten
  const klickFaehig = state.zeitraum !== "quartal" && !!onMonatKlick;
  function handleKlick(payload: { monat?: string }) {
    if (!klickFaehig || !payload?.monat || payload.monat.startsWith("Q")) return;
    const [j, m] = payload.monat.split("-");
    onMonatKlick?.(j, m);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Umsatz</h2>
          <p className="text-xs text-muted-foreground">{zeitraumLabel(state.zeitraum)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ZeitraumToggle
            value={state.zeitraum}
            onChange={(zeitraum) => setState((s) => ({ ...s, zeitraum }))}
          />
          <TypToggle
            value={state.typ}
            onChange={(typ) => setState((s) => ({ ...s, typ }))}
          />
          <WertToggle
            value={state.wert}
            onChange={(wert) => setState((s) => ({ ...s, wert }))}
          />
        </div>
      </div>

      {/* Kennzahlen-Zeile */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-xs text-muted-foreground">Summe </span>
          <span className="font-semibold">{formatEUR(summe)}</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">{mittelLabel} </span>
          <span className="font-semibold">{formatEUR(mittel)}</span>
        </div>
        {deltaPct !== null && (
          <DeltaPill pct={deltaPct} />
        )}
      </div>

      {/* Chart */}
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(state, chartData, handleKlick, klickFaehig)}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- Sub-Komponenten ----------

function zeitraumLabel(z: ChartZeitraum) {
  switch (z) {
    case "6m":
      return "Letzte 6 Monate";
    case "12m":
      return "Letzte 12 Monate";
    case "jahr":
      return "Aktuelles Jahr";
    case "letztesJahr":
      return "Letztes Jahr";
    case "quartal":
      return "Quartalsweise — aktuelles Jahr";
  }
}

function ZeitraumToggle({
  value,
  onChange,
}: {
  value: ChartZeitraum;
  onChange: (v: ChartZeitraum) => void;
}) {
  const opts: { v: ChartZeitraum; l: string }[] = [
    { v: "6m", l: "6 M" },
    { v: "12m", l: "12 M" },
    { v: "jahr", l: "Jahr" },
    { v: "letztesJahr", l: "Vorjahr" },
    { v: "quartal", l: "Quartal" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
            value === o.v
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function TypToggle({
  value,
  onChange,
}: {
  value: ChartTyp;
  onChange: (v: ChartTyp) => void;
}) {
  const opts: { v: ChartTyp; Icon: typeof BarChart3; title: string }[] = [
    { v: "bar", Icon: BarChart3, title: "Balken" },
    { v: "line", Icon: LineIcon, title: "Linie" },
    { v: "area", Icon: AreaIcon, title: "Fläche" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {opts.map(({ v, Icon, title }) => (
        <button
          key={v}
          type="button"
          title={title}
          aria-label={title}
          onClick={() => onChange(v)}
          className={`rounded-md px-1.5 py-1 transition ${
            value === v
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

function WertToggle({
  value,
  onChange,
}: {
  value: Wert;
  onChange: (v: Wert) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {(["brutto", "netto"] as Wert[]).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-md px-2 py-1 text-[11px] font-medium capitalize transition ${
            value === v
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function DeltaPill({ pct }: { pct: number }) {
  const istNull = Math.abs(pct) < 0.05;
  const Icon = istNull ? Minus : pct >= 0 ? TrendingUp : TrendingDown;
  const color = istNull
    ? "text-muted-foreground"
    : pct >= 0
      ? "text-success"
      : "text-destructive";
  return (
    <div className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon className="h-3.5 w-3.5" />
      <span>
        {pct >= 0 ? "+" : ""}
        {pct.toFixed(1)} %
      </span>
      <span className="text-muted-foreground font-normal">vs. Vorperiode</span>
    </div>
  );
}

// ---------- Chart-Renderer ----------

interface PunktDaten {
  monat: string;
  brutto: number;
  netto: number;
  label: string;
  labelLang: string;
}

function renderChart(
  state: State,
  data: PunktDaten[],
  onKlick: (p: { monat?: string }) => void,
  klickFaehig: boolean,
) {
  const tooltip = (
    <Tooltip
      contentStyle={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        fontSize: 12,
      }}
      labelFormatter={(_label, payload) => {
        const p = payload?.[0]?.payload as PunktDaten | undefined;
        return p?.labelLang ?? String(_label);
      }}
      formatter={(value: number, name: string) => [
        formatEUR(Number(value)),
        name === "brutto" ? "Brutto" : "Netto",
      ]}
    />
  );
  const grid = (
    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
  );
  const xAxis = (
    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
  );
  const yAxis = (
    <YAxis
      tick={{ fontSize: 11 }}
      axisLine={false}
      tickLine={false}
      tickFormatter={(v) => `${Math.round(Number(v))} €`}
    />
  );

  // Damit der Tooltip bei Brutto+Netto beides zeigt, nehmen wir beide dataKeys auf,
  // blenden aber den nicht-aktiven optisch aus (transparent).
  const aktiv = state.wert;
  const inaktiv: Wert = aktiv === "brutto" ? "netto" : "brutto";
  const farbeAktiv = "var(--primary)";
  const farbeInaktiv = "transparent";

  const cursorStyle = klickFaehig ? { cursor: "pointer" as const } : undefined;

  if (state.typ === "bar") {
    return (
      <BarChart data={data} onClick={(e) => onKlick(e?.activePayload?.[0]?.payload ?? {})}>
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        <Bar
          dataKey={aktiv}
          fill={farbeAktiv}
          radius={[8, 8, 0, 0]}
          style={cursorStyle}
        />
        {/* unsichtbar — nur für Tooltip */}
        <Bar dataKey={inaktiv} fill={farbeInaktiv} />
      </BarChart>
    );
  }
  if (state.typ === "line") {
    return (
      <LineChart data={data} onClick={(e) => onKlick(e?.activePayload?.[0]?.payload ?? {})}>
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        <Line
          type="monotone"
          dataKey={aktiv}
          stroke={farbeAktiv}
          strokeWidth={2}
          dot={{ r: 3, fill: farbeAktiv }}
          activeDot={{ r: 5, style: cursorStyle }}
        />
        <Line type="monotone" dataKey={inaktiv} stroke="transparent" dot={false} />
      </LineChart>
    );
  }
  // area
  return (
    <AreaChart data={data} onClick={(e) => onKlick(e?.activePayload?.[0]?.payload ?? {})}>
      <defs>
        <linearGradient id="umsatzFlaeche" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {grid}
      {xAxis}
      {yAxis}
      {tooltip}
      <Area
        type="monotone"
        dataKey={aktiv}
        stroke={farbeAktiv}
        strokeWidth={2}
        fill="url(#umsatzFlaeche)"
        activeDot={{ r: 5, style: cursorStyle }}
      />
      <Area
        type="monotone"
        dataKey={inaktiv}
        stroke="transparent"
        fill="transparent"
      />
    </AreaChart>
  );
}
