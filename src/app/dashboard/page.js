"use client"
// src/app/dashboard/page.js — REVISI
// ===================================
// Perubahan besar:
//   1. Mode "LIVE (Simulasi Data 2025)": seluruh dashboard digerakkan
//      jam virtual (SimulationProvider) — angka CII, BBM, jarak, dan
//      posisi kapal berjalan mengikuti data 2025 secara realtime,
//      bisa dipercepat lewat SimClockBar.
//
//   2. Peta baru (ShipMap rewrite): semua jalur voyage tampil,
//      voyage aktif di-highlight, kedua kapal bergerak dengan ikon
//      panah berotasi. Peta sekarang full-width sebagai elemen utama.
//   3. [FIX] RecommendationPanel duplikat dihapus — pakai satu
//      komponen dari @/components dengan format {priority,title,description}.

import { useEffect, useState, useCallback, useMemo } from "react"
import dynamic from "next/dynamic"
import CIIRatingCard, { CIIBadge } from "@/components/CIIRatingCard"
import ShipOperationalCard          from "@/components/ShipOperationalCard"
import CIIDataCard                  from "@/components/CIIDataCard"
import DSSPanel                     from "@/components/DSSPanel"
import RunningCIIChart, {
  CumulativeDistanceChart,
  CumulativeFuelChart,
}                                   from "@/components/RunningCIIChart"
import SimulationProvider, { SimClockBar, useSimulation } from "@/components/SimulationProvider"
import { calcPctOfRequired, calcCIIRequired } from "@/lib/ciiCalculation"
import { runDSS } from "@/lib/dss"
import { fractionOfDay } from "@/lib/simulationClock"

// Leaflet tidak support SSR
const ShipMap = dynamic(() => import("@/components/ShipMap"), { ssr: false })

// ─── HELPERS ─────────────────────────────────────────────────
function MetricCard({ label, value, sub, subColor, children }) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      {children ?? <div className="text-xl font-semibold text-gray-900 tabular-nums">{value}</div>}
      {sub && <div className={`text-xs mt-1 ${subColor ?? "text-gray-400"}`}>{sub}</div>}
    </div>
  )
}

// ─── ISI DASHBOARD (di dalam SimulationProvider) ─────────────
function DashboardContent() {
  const { virtualTime, virtualDate } = useSimulation()

  const [ships,            setShips]            = useState([])
  const [shipGrades,       setShipGrades]       = useState({})
  const [selectedKey,      setSelectedKey]      = useState("klasogun")
  const [selectedVoyageId, setSelectedVoyageId] = useState(null)

  const [dashData,  setDashData]  = useState(null)   // chart bulanan, cii_required, dsb (statis per kapal)
  const [voyages,   setVoyages]   = useState([])
  const [simStatus, setSimStatus] = useState(null)   // { today, prev } dari cii_daily pada tanggal virtual
  const [dailyData, setDailyData] = useState(null)   // ShipOperationalCard pada tanggal virtual
  const [loading,   setLoading]   = useState(true)

  // [FIX #1] Detail voyage yang dipilih dari dropdown "Riwayat Perjalanan".
  // Sebelumnya selectedVoyageId hanya dipakai untuk highlight/zoom peta —
  // seluruh kartu CII/BBM/jarak tetap menampilkan data live (jam virtual),
  // jadi terlihat seperti "tidak merespons" saat ganti voyage. Sekarang
  // memilih voyage benar-benar mengambil & menampilkan data voyage itu.
  const [voyageDetail,  setVoyageDetail]  = useState(null)
  const [loadingVoyage, setLoadingVoyage] = useState(false)

  const year = 2025

  // ── Fetch ships (sekali) ──
  useEffect(() => {
    fetch("/api/ships")
      .then(r => r.json())
      .then(d => setShips(d.ships ?? []))
  }, [])

  // ── Rating asli semua kapal untuk badge switcher ──
  useEffect(() => {
    if (ships.length === 0) return
    Promise.all(
      ships.map((s) =>
        fetch(`/api/ships/${s.ship_key}/cii?mode=status`)
          .then((r) => r.json())
          .then((d) => [s.ship_key, d?.running_grade ?? null])
          .catch(() => [s.ship_key, null])
      )
    ).then((entries) => setShipGrades(Object.fromEntries(entries)))
  }, [ships])

  // ── Data statis per kapal: chart & voyages ──
  const fetchStatic = useCallback(async (shipKey) => {
    setLoading(true)
    try {
      const [dashRes, voyageRes] = await Promise.all([
        fetch(`/api/ships/${shipKey}/cii?mode=dashboard&year=${year}`).then(r => r.json()),
        fetch(`/api/ships/${shipKey}/voyage?mode=list&limit=100`).then(r => r.json()),
      ])
      setDashData(dashRes)
      setVoyages(voyageRes.voyages ?? [])
    } catch (err) {
      console.error("fetchStatic error:", err)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    setSelectedVoyageId(null)
    fetchStatic(selectedKey)
  }, [selectedKey, fetchStatic])

  // ── Status CII pada TANGGAL VIRTUAL (di-refetch tiap ganti hari virtual) ──
  useEffect(() => {
    let cancelled = false
    fetch(`/api/ships/${selectedKey}/sim?mode=status&at=${virtualDate}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setSimStatus(d) })
      .catch(() => { if (!cancelled) setSimStatus(null) })

    fetch(`/api/ships/${selectedKey}/ais?mode=daily&date=${virtualDate}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setDailyData(d ?? null) })
      .catch(() => { if (!cancelled) setDailyData(null) })

    return () => { cancelled = true }
  }, [selectedKey, virtualDate])

  // [FIX #1] Fetch detail voyage spesifik saat dipilih dari dropdown.
  useEffect(() => {
    if (!selectedVoyageId) { setVoyageDetail(null); return }
    let cancelled = false
    setLoadingVoyage(true)
    fetch(`/api/ships/${selectedKey}/voyages/${selectedVoyageId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setVoyageDetail(d?.voyage ?? null) })
      .catch(() => { if (!cancelled) setVoyageDetail(null) })
      .finally(() => { if (!cancelled) setLoadingVoyage(false) })
    return () => { cancelled = true }
  }, [selectedKey, selectedVoyageId])

  // ── Interpolasi angka sepanjang hari virtual (jalan tiap detik) ──
  const live = useMemo(() => {
    const t = simStatus?.today
    if (!t) return null

    // Kalau data cii_daily untuk tanggal virtual persis ada → interpolasi
    // dalam hari itu. Kalau baris terakhir < tanggal virtual (gap data),
    // pakai nilai akhir hari (frac = 1).
    const sameDay = t.date === virtualDate
    const frac    = sameDay ? fractionOfDay(virtualTime) : 1

    const baseDist = (t.distance_nm_ytd  ?? 0) - (sameDay ? (t.distance_nm_day  ?? 0) * (1 - frac) : 0)
    const baseFuel = (t.fuel_cons_mt_ytd ?? 0) - (sameDay ? (t.fuel_cons_mt_day ?? 0) * (1 - frac) : 0)
    const baseCO2  = (t.co2_emission_g_ytd ?? 0) - (sameDay ? (t.co2_emission_g_day ?? 0) * (1 - frac) : 0)

    const prevCII = simStatus?.prev?.running_cii
    const cii = (sameDay && prevCII != null && t.running_cii != null)
      ? prevCII + (t.running_cii - prevCII) * frac
      : t.running_cii

    const transportWork = (t.transport_work_ytd ?? 0)

    return {
      running_cii:         cii,
      running_grade:       t.running_grade,
      cii_required:        t.cii_required,
      distance_nm_ytd:     baseDist,
      fuel_cons_mt_ytd:    baseFuel,
      co2_emission_g_ytd:  baseCO2,
      transport_work_ytd:  transportWork,
      date_limit_reached:  t.date_limit_reached,
      last_data_date:      t.date,
      pct_of_required:     calcPctOfRequired(cii, t.cii_required),
    }
  }, [simStatus, virtualTime, virtualDate])

  // ── Filter chart sampai bulan virtual (chart ikut "tumbuh") ──
  // Catatan: grafik ini disembunyikan total saat mode "Detail Voyage"
  // (lihat render di bawah), jadi filter di sini cukup berbasis jam
  // virtual live saja — tidak perlu lagi membeku ke bulan voyage.
  const vMonth = new Date(virtualTime).getMonth() + 1
  const monthlyChart = useMemo(
    () => (dashData?.monthlyChart ?? []).filter(m => m.month <= vMonth),
    [dashData, vMonth]
  )
  const cumulative = useMemo(
    () => (dashData?.cumulativeChart ?? []).filter(m => m.month <= vMonth),
    [dashData, vMonth]
  )

  // [FIX #2] v_ship_operational_daily (sumber `dailyData`) TIDAK punya
  // kolom from_port/to_port — itu informasi per-VOYAGE, bukan per-hari.
  // Makanya ShipOperationalCard selalu jatuh ke "Sedang dideteksi...".
  // Perbaikan: cari voyage yang aktif pada tanggal virtual dari daftar
  // `voyages` yang sudah kita fetch, lalu suntikkan from_port/to_port-nya.
  const activeVoyage = useMemo(() => {
    const vTime = new Date(virtualDate).getTime()
    return voyages.find(v => {
      if (!v.date_departure) return false
      const dep = new Date(v.date_departure).getTime()
      const arr = v.date_arrived ? new Date(v.date_arrived).getTime() + 86399000 : dep + 86399000
      return vTime >= dep && vTime <= arr
    }) ?? null
  }, [voyages, virtualDate])

  const dailyDataWithRoute = dailyData ? {
    ...dailyData,
    from_port: dailyData.from_port ?? activeVoyage?.from_port ?? null,
    to_port:   dailyData.to_port   ?? activeVoyage?.to_port   ?? null,
  } : (activeVoyage ? { from_port: activeVoyage.from_port, to_port: activeVoyage.to_port } : null)

  // ── Derived ──
  const ship        = ships.find(s => s.ship_key === selectedKey)
  const ciiRequired = live?.cii_required ?? dashData?.currentStatus?.cii_required ?? null
  const ciiRef      = ship?.cii_ref_value ?? null

  // [FIX #1] Saat sebuah voyage dipilih, SEMUA kartu (metric, rating,
  // data CII, operasional) beralih menampilkan data voyage tersebut,
  // bukan data live jam virtual lagi.
  const viewingVoyage = Boolean(selectedVoyageId) && Boolean(voyageDetail)
  const staticCIIRequired = useMemo(
    () => calcCIIRequired(selectedKey, year),
    [selectedKey, year]
  )

  const displayCII         = viewingVoyage ? voyageDetail.cii_attained : live?.running_cii
  const displayGrade       = viewingVoyage ? voyageDetail.rating       : live?.running_grade
  const displayCiiRequired = viewingVoyage ? staticCIIRequired         : ciiRequired
  const displayDistance    = viewingVoyage ? voyageDetail.distance_nm  : live?.distance_nm_ytd
  const displayFuel        = viewingVoyage
    ? (
        voyageDetail.fuel_cons_actual ??
        voyageDetail.fuel_cons_mlr ??
        // [FIX] fallback terakhir: kalau fuel_cons_actual & fuel_cons_mlr
        // sama-sama NULL, coba jumlahkan fuel_me_ton + fuel_ae_ton (kolom
        // BBM alternatif yang mungkin justru yang benar-benar terisi).
        ((voyageDetail.fuel_me_ton != null || voyageDetail.fuel_ae_ton != null)
          ? (voyageDetail.fuel_me_ton ?? 0) + (voyageDetail.fuel_ae_ton ?? 0)
          : null)
      )
    : live?.fuel_cons_mt_ytd
  const displaySpeed       = viewingVoyage ? voyageDetail.avg_speed_knots : dailyData?.avg_speed_knot
  const displayLastDate    = viewingVoyage ? voyageDetail.date_arrived    : live?.last_data_date
  const displayCO2Gram     = viewingVoyage
    ? (voyageDetail.co2_emission_ton != null ? voyageDetail.co2_emission_ton * 1_000_000 : null)
    : live?.co2_emission_g_ytd
  const displayTransportWork = viewingVoyage
    ? (voyageDetail.dwt && voyageDetail.distance_nm ? voyageDetail.dwt * voyageDetail.distance_nm : null)
    : live?.transport_work_ytd

  // [FIX] Rekomendasi sekarang pakai DSS ENGINE penuh (AHP + SAW, lihat
  // lib/dss.js) di SEMUA konteks — live maupun voyage historis yang
  // dipilih — bukan cuma live seperti sebelumnya. Untuk voyage historis,
  // "status" yang disuntikkan ke DSS memakai data voyage itu SENDIRI
  // (distance_nm/fuel voyage itu, bukan akumulasi tahunan), supaya
  // diagnosis & skoring alternatif relevan dengan voyage spesifik itu.
  const dss = useMemo(() => {
    if (viewingVoyage && voyageDetail) {
      const cii = voyageDetail.cii_attained != null ? Number(voyageDetail.cii_attained) : null
      if (!cii) return null
      const voyageStatus = {
        running_cii:      cii,
        cii_required:     staticCIIRequired,
        running_grade:    voyageDetail.rating,
        distance_nm_ytd:  voyageDetail.distance_nm,
        fuel_cons_mt_ytd: displayFuel,   // sudah lewat fallback chain di atas
      }
      return runDSS({
        shipKey: selectedKey,
        status: voyageStatus,
        avgSpeedKnot: voyageDetail.avg_speed_knots ?? null,
        year,
      })
    }
    if (!viewingVoyage && live) {
      return runDSS({
        shipKey: selectedKey,
        status: live,
        avgSpeedKnot: dailyData?.avg_speed_knot ?? null,
        year,
      })
    }
    return null
  }, [viewingVoyage, voyageDetail, staticCIIRequired, displayFuel, live, selectedKey, dailyData, year])

  const sortedVoyages = [...voyages].sort((a, b) =>
    new Date(b.date_departure ?? 0) - new Date(a.date_departure ?? 0)
  )

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
            {viewingVoyage
              ? `Detail Voyage: ${voyageDetail.from_port ?? "?"} → ${voyageDetail.to_port ?? "?"}`
              : "Monitoring Realtime (Simulasi Data 2025)"}
          </p>
        </div>
        {viewingVoyage && (
          <button
            onClick={() => setSelectedVoyageId(null)}
            className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors whitespace-nowrap"
          >
            ← Kembali ke Live
          </button>
        )}
      </div>

      {/* ── Jam virtual + kontrol kecepatan ── */}
      <SimClockBar />

      {/* ── Pilih Kapal ── */}
      <div className="flex gap-3">
        {ships.map(s => {
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

      {/* ── Dropdown Voyage (highlight jalur di peta) ── */}
      <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
          Riwayat Perjalanan:
        </label>
        <select
          value={selectedVoyageId ?? ""}
          onChange={e => setSelectedVoyageId(e.target.value ? parseInt(e.target.value) : null)}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:border-blue-400"
        >
          <option value="">🛰 Ikuti pergerakan live (semua jalur)</option>
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
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 text-center py-8">Memuat data dashboard...</div>
      ) : (
        <>
          {/* ── Metric Cards (live: bergerak tiap detik virtual; voyage: statis milik voyage terpilih) ── */}
          <div className="grid grid-cols-4 gap-3">
            <MetricCard
              label={viewingVoyage ? "Nilai CII Voyage Ini" : "Nilai CII Saat Ini"}
              sub={`Target: < ${displayCiiRequired ? Number(displayCiiRequired).toFixed(2) : "—"}`}
            >
              <span className="flex items-baseline gap-2">
                <span className="text-xl font-semibold text-gray-900 tabular-nums">
                  {displayCII != null ? Number(displayCII).toFixed(3) : "—"}
                </span>
                {displayGrade && <CIIBadge rating={displayGrade} size="sm" />}
              </span>
            </MetricCard>
            <MetricCard
              label={viewingVoyage ? "Konsumsi BBM Voyage" : "Konsumsi BBM (YTD)"}
              value={displayFuel != null ? `${Number(displayFuel).toFixed(2)} MT` : "—"}
              sub={viewingVoyage
                ? (voyageDetail.fuel_type ?? "")
                : `akumulasi s/d ${new Date(virtualTime).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} ${year}`}
            />
            <MetricCard
              label={viewingVoyage ? "Kecepatan Voyage" : "Kecepatan"}
              value={displaySpeed ? `${displaySpeed} kn` : "—"}
              sub={viewingVoyage ? "rata-rata voyage ini" : "rata-rata harian dari AIS"}
            />
            <MetricCard
              label={viewingVoyage ? "Jarak Voyage" : "Total Jarak (YTD)"}
              value={displayDistance != null ? `${Math.round(displayDistance).toLocaleString("id-ID")} NM` : "—"}
              sub={
                viewingVoyage
                  ? (voyageDetail.date_departure
                      ? `Berangkat ${new Date(voyageDetail.date_departure).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`
                      : "")
                  : (displayLastDate ? `Data cii_daily per ${new Date(displayLastDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}` : "")
              }
            />
          </div>

          {/* ── PETA (elemen utama, full width) ── */}
          <ShipMap
            ships={ships}
            selectedKey={selectedKey}
            onSelectShip={setSelectedKey}
            focusVoyageId={selectedVoyageId}
          />

          {/* ── Grafik Utama & Kumulatif — HANYA saat mode Live, disembunyikan
               saat sedang melihat voyage historis karena kurang relevan
               (grafik ini bicara akumulasi tahunan, bukan satu voyage). ── */}
          {!viewingVoyage && (
            <>
              <RunningCIIChart
                monthlyData={monthlyChart}
                ciiRequired={displayCiiRequired}
                year={year}
                height={220}
              />
              <div className="grid grid-cols-2 gap-4">
                <CumulativeDistanceChart data={cumulative} year={year} height={160} />
                <CumulativeFuelChart     data={cumulative} year={year} height={160} />
              </div>
            </>
          )}

          {/* ── Rating CII + Operasional + Data CII ── */}
          <div className="grid grid-cols-3 gap-4">
            <CIIRatingCard
              cii={displayCII}
              rating={displayGrade ?? "—"}
              ciiRequired={displayCiiRequired}
              refValue={ciiRef}
              lastDate={displayLastDate}
              shipKey={selectedKey}
              year={year}
              dateLimitReached={viewingVoyage ? null : live?.date_limit_reached}
            />
            <ShipOperationalCard
              data={viewingVoyage ? {
                avg_speed_knot: voyageDetail.avg_speed_knots,
                from_port:      voyageDetail.from_port,
                to_port:        voyageDetail.to_port,
                sail_condition: voyageDetail.sail_condition,
                distance_nm:    voyageDetail.distance_nm,
              } : dailyDataWithRoute}
              date={viewingVoyage ? voyageDetail.date_departure : virtualDate}
            />
            <CIIDataCard
              title={viewingVoyage ? "Data Voyage Terpilih" : undefined}
              badgeLabel={viewingVoyage ? "Per Voyage" : undefined}
              periodText={viewingVoyage
                ? `${voyageDetail.from_port ?? "?"} → ${voyageDetail.to_port ?? "?"}`
                : undefined}
              data={(viewingVoyage || live) ? {
                distance_nm_annual:    displayDistance,
                fuel_cons_mt_annual:   displayFuel,
                co2_emission_g_annual: displayCO2Gram,
                transport_work_annual: displayTransportWork,
              } : null}
              year={year}
            />
          </div>
          {loadingVoyage && (
            <div className="text-xs text-gray-400 -mt-3">Memuat detail voyage...</div>
          )}

          {/* ── Rekomendasi: DSS penuh (AHP+SAW) — live maupun voyage historis ── */}
          <div>
            <div className="text-sm font-semibold text-gray-900 mb-3">
              {viewingVoyage ? "Decision Support System — Voyage Terpilih" : "Decision Support System — Rekomendasi Operasional"}
            </div>
            <DSSPanel dss={dss} loading={viewingVoyage ? loadingVoyage : !live} />
          </div>
        </>
      )}
    </div>
  )
}

// ─── PAGE ────────────────────────────────────────────────────
export default function DashboardPage() {
  return (
    <SimulationProvider initialSpeed={60}>
      <DashboardContent />
    </SimulationProvider>
  )
}