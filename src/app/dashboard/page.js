"use client"
import { useEffect, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import CIIRatingCard, { CIIBadge }          from "@/components/CIIRatingCard"
import ShipOperationalCard                   from "@/components/ShipOperationalCard"
import CIIDataCard                           from "@/components/CIIDataCard"
import RunningCIIChart, {
  CumulativeDistanceChart,
  CumulativeFuelChart,
}                                            from "@/components/RunningCIIChart"
import { generateDashboardRecommendation, recommendationColor } from "@/lib/ciiCalculation"
// ShipMap tetap dynamic (Leaflet tidak support SSR)
const ShipMap = dynamic(() => import("@/components/ShipMap"), { ssr: false })

// ─── HELPERS ─────────────────────────────────────────────────
function MetricCard({ label, value, sub, subColor, children }) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      {children ?? <div className="text-xl font-semibold text-gray-900">{value}</div>}
      {sub && <div className={`text-xs mt-1 ${subColor ?? "text-gray-400"}`}>{sub}</div>}
    </div>
  )
}

function RecommendationPanel({ recommendations = [] }) {
  if (!recommendations.length) return null
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-semibold text-gray-900">Rekomendasi Otomatis</div>
      {recommendations.map((rec, i) => (
        <div key={i} className={`border rounded-xl px-4 py-3 text-sm ${recommendationColor(rec.type)}`}>
          {rec.title && <div className="font-semibold mb-0.5">{rec.title}</div>}
          <div className="leading-relaxed">{rec.message}</div>
        </div>
      ))}
    </div>
  )
}

// ─── MAIN PAGE ───────────────────────────────────────────────
export default function DashboardPage() {
  const [ships,           setShips]           = useState([])
  const [shipGrades,      setShipGrades]      = useState({}) // { klasogun: 'A', balongan: 'C' } — rating asli per kapal utk switcher
  const [selectedKey,     setSelectedKey]     = useState("klasogun")
  const [selectedVoyageId,setSelectedVoyageId]= useState(null)
  // Data dari API
  const [dashData,        setDashData]        = useState(null)   // getDashboardData
  const [voyages,         setVoyages]         = useState([])
  const [voyageDetail,    setVoyageDetail]    = useState(null)
  const [dailyData,       setDailyData]       = useState(null)   // ShipOperationalCard
  // AIS
  const [livePosition,    setLivePosition]    = useState(null)
  const [gpsTrack,        setGPSTrack]        = useState([])
  const [loading,         setLoading]         = useState(true)
  const [loadingVoyage,   setLoadingVoyage]   = useState(false)
  const year = 2025

  // ── Fetch ships (sekali) ──
  useEffect(() => {
    fetch("/api/ships")
      .then(r => r.json())
      .then(d => setShips(d.ships ?? []))
  }, [])

  // ── Fetch rating asli semua kapal (untuk badge di switcher atas) ──
  // Dilakukan terpisah dari fetchDashboard, karena fetchDashboard hanya
  // ambil detail lengkap utk kapal yang aktif dipilih. Tanpa ini, badge
  // rating kapal lain di switcher tidak ada sumber datanya sama sekali
  // dan akan selalu fallback ke nilai statis yang salah.
  useEffect(() => {
    if (ships.length === 0) return
    Promise.all(
      ships.map((s) =>
        fetch(`/api/ships/${s.ship_key}/cii?mode=dashboard&year=${year}`)
          .then((r) => r.json())
          .then((d) => [s.ship_key, d?.currentStatus?.running_grade ?? null])
          .catch(() => [s.ship_key, null])
      )
    ).then((entries) => {
      setShipGrades(Object.fromEntries(entries))
    })
  }, [ships, year])

  // ── Fetch semua data dashboard saat kapal berubah ──
  const fetchDashboard = useCallback(async (shipKey) => {
    setLoading(true)
    try {
      const [dashRes, voyageRes, aisLatest, aisTrack] = await Promise.all([
        fetch(`/api/ships/${shipKey}/cii?mode=dashboard&year=${year}`).then(r => r.json()),
        fetch(`/api/ships/${shipKey}/voyage?mode=list&limit=100`).then(r => r.json()),
        fetch(`/api/ships/${shipKey}/ais?mode=latest`).then(r => r.json()),
        fetch(`/api/ships/${shipKey}/ais?mode=track&date=${new Date().toISOString().split("T")[0]}`).then(r => r.json()),
      ])
      setDashData(dashRes)
      setVoyages(voyageRes.voyages ?? [])
      setLivePosition(aisLatest.position ?? null)
      setGPSTrack(aisTrack.track ?? [])
      // Daily data untuk hari terakhir yang ada di cii_daily
      const lastDate = dashRes?.currentStatus?.last_data_date
      if (lastDate) {
        const dailyRes = await fetch(
          `/api/ships/${shipKey}/ais?mode=daily&date=${lastDate}`
        ).then(r => r.json()).catch(() => null)
        setDailyData(dailyRes ?? null)
      }
    } catch (err) {
      console.error("fetchDashboard error:", err)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    setSelectedVoyageId(null)
    setVoyageDetail(null)
    fetchDashboard(selectedKey)
  }, [selectedKey, fetchDashboard])

  // ── Fetch voyage detail saat pilih voyage ──
  useEffect(() => {
    if (!selectedVoyageId) {
      setVoyageDetail(null)
      return
    }
    setLoadingVoyage(true)
    fetch(`/api/ships/voyages/${selectedVoyageId}`)
      .then(r => r.json())
      .then(d => setVoyageDetail(d ?? null))
      .catch(() => setVoyageDetail(null))
      .finally(() => setLoadingVoyage(false))
  }, [selectedVoyageId])

  // ── Derived values ──
  const ship          = ships.find(s => s.ship_key === selectedKey)
  const currentStatus = dashData?.currentStatus   ?? null
  const monthlyChart  = dashData?.monthlyChart    ?? []
  const cumulative    = dashData?.cumulativeChart ?? []
  const voyageCount   = dashData?.voyageCount     ?? []
  // Nilai CII yang ditampilkan
  const displayCII    = currentStatus?.running_cii    ?? null
  const displayGrade  = currentStatus?.running_grade  ?? "—"
  const ciiRequired   = currentStatus?.cii_required   ?? null
  const ciiRef        = ship?.cii_ref_value            ?? null
  const lastDate      = currentStatus?.last_data_date  ?? null
  const dateLimitReached = currentStatus?.date_limit_reached ?? null
  // Metric ringkasan
  const distYTD       = currentStatus?.distance_nm_ytd   ?? null
  const fuelYTD       = currentStatus?.fuel_cons_mt_ytd  ?? null
  const co2YTD        = currentStatus?.co2_emission_g_ytd ?? null
  // Speed rata-rata dari monthlyChart (bulan terakhir yang ada data)
  const lastMonthData = [...monthlyChart].reverse().find(m => m.running_cii != null)
  const avgSpeedDisplay = dailyData?.avg_speed_knot
    ? `${dailyData.avg_speed_knot} kn`
    : "—"
  // Rekomendasi otomatis
  const recommendations = currentStatus
    ? generateDashboardRecommendation(currentStatus, selectedKey, year)
    : []
  // Sort voyages terbaru dulu
  const sortedVoyages = [...voyages].sort((a, b) =>
    new Date(b.date_departure ?? 0) - new Date(a.date_departure ?? 0)
  )

  // ─────────────────────────────────────────────────────────
  if (!ship && !loading) return (
    <div className="p-6 text-sm text-gray-400">Memuat data kapal...</div>
  )

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Dashboard CII</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {ship?.name ?? "..."} —{" "}
            {selectedVoyageId ? "Detail Voyage" : "Live GPS Tracking"}
          </p>
        </div>
        {!selectedVoyageId && livePosition && (
          <span className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-full border border-green-200">
            🟢 Live GPS
          </span>
        )}
      </div>

      {/* ── Pilih Kapal ── */}
      <div className="flex gap-3">
        {ships.map(s => {
          // Rating asli diambil dari shipGrades (hasil fetch cii dashboard
          // per kapal), BUKAN dari s.rating -- field itu tidak pernah ada
          // di data ships (lihat getAllShips() di lib/db.js) dan dulu
          // selalu fallback ke "C" secara keliru untuk semua kapal.
          const r = shipGrades[s.ship_key] ?? "—"
          const rColor = {
            A: "text-teal-700 bg-teal-50 border-teal-200",
            B: "text-green-700 bg-green-50 border-green-200",
            C: "text-amber-700 bg-amber-50 border-amber-200",
            D: "text-orange-700 bg-orange-50 border-orange-200",
            E: "text-red-700 bg-red-50 border-red-200",
          }
          return (
            <button
              key={s.ship_key}
              onClick={() => setSelectedKey(s.ship_key)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm transition-all ${
                selectedKey === s.ship_key
                  ? "bg-white border-blue-400 shadow-sm text-gray-900"
                  : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-white"
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                {s.ship_key?.[0]?.toUpperCase()}
              </div>
              <div className="text-left">
                <div className="font-medium text-xs">{s.name}</div>
                <div className="text-xs text-gray-400">DWT {s.dwt?.toLocaleString()}</div>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${rColor[r] ?? "text-gray-500 bg-gray-50 border-gray-200"}`}>
                {r}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Dropdown Voyage ── */}
      <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
          Riwayat Perjalanan:
        </label>
        <select
          value={selectedVoyageId ?? ""}
          onChange={e => setSelectedVoyageId(e.target.value ? parseInt(e.target.value) : null)}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:border-blue-400"
        >
          <option value="">📊 Semua Data (Ringkasan)</option>
          {sortedVoyages.map(v => {
            const dep = v.date_departure
              ? new Date(v.date_departure).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
              : "?"
            return (
              <option key={v.id} value={v.id}>
                {v.from_port?.split(",")[0] ?? "?"} → {v.to_port?.split(",")[0] ?? "?"} — {dep}
              </option>
            )
          })}
        </select>
        {loadingVoyage && <span className="text-xs text-gray-400">Memuat...</span>}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 text-center py-8">Memuat data dashboard...</div>
      ) : (
        <>
          {/* ── Metric Cards ── */}
          <div className="grid grid-cols-4 gap-3">
            <MetricCard
              label="Nilai CII Saat Ini"
              sub={`Target: < ${ciiRequired ? Number(ciiRequired).toFixed(2) : "—"}`}
            >
              <span className="flex items-baseline gap-2">
                <span className="text-xl font-semibold text-gray-900">
                  {displayCII ? Number(displayCII).toFixed(2) : "—"}
                </span>
                {displayGrade !== "—" && <CIIBadge rating={displayGrade} size="sm" />}
              </span>
            </MetricCard>
            <MetricCard
              label="Konsumsi BBM"
              value={fuelYTD ? `${Number(fuelYTD).toFixed(1)} MT` : "—"}
              sub="akumulasi tahun 2025"
            />
            <MetricCard
              label="Kecepatan"
              value={avgSpeedDisplay}
              sub="rata-rata harian dari AIS"
            />
            <MetricCard
              label="Total Jarak 2025"
              value={distYTD ? `${Math.round(distYTD).toLocaleString("id-ID")} NM` : "—"}
              sub={lastDate ? `Data per ${new Date(lastDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}` : ""}
            />
          </div>

          {/* ── Grafik Utama: Running Annual CII ── */}
          <RunningCIIChart
            monthlyData={monthlyChart}
            ciiRequired={ciiRequired}
            year={year}
            height={220}
          />

          {/* ── Grafik Kumulatif: Distance + Fuel ── */}
          <div className="grid grid-cols-2 gap-4">
            <CumulativeDistanceChart data={cumulative} year={year} height={160} />
            <CumulativeFuelChart     data={cumulative} year={year} height={160} />
          </div>

          {/* ── Peta + Rating CII ── */}
          <div className="grid grid-cols-2 gap-4">
            <ShipMap
              from={voyageDetail?.from_port ?? livePosition?.from_port ?? ""}
              to={voyageDetail?.to_port     ?? livePosition?.to_port   ?? ""}
              shipLabel={ship?.name ?? ""}
              gpsTrack={gpsTrack}
              isRealTime={!selectedVoyageId}
            />
            <CIIRatingCard
              cii={displayCII}
              rating={displayGrade}
              ciiRequired={ciiRequired}
              refValue={ciiRef}
              lastDate={lastDate}
              shipKey={selectedKey}
              year={year}
              dateLimitReached={dateLimitReached}
            />
          </div>

          {/* ── 2 Kotak Baru: Ship Operational + CII Data ── */}
          <div className="grid grid-cols-2 gap-4">
            <ShipOperationalCard
              data={dailyData}
              date={lastDate}
            />
            <CIIDataCard
              data={currentStatus ? {
                distance_nm_annual:    currentStatus.distance_nm_ytd,
                fuel_cons_mt_annual:   currentStatus.fuel_cons_mt_ytd,
                co2_emission_g_annual: currentStatus.co2_emission_g_ytd,
                transport_work_annual: currentStatus.transport_work_ytd,
              } : null}
              year={year}
            />
          </div>

          {/* ── Rekomendasi Otomatis ── */}
          <RecommendationPanel recommendations={recommendations} />
        </>
      )}
    </div>
  )
}