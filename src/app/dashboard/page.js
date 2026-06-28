"use client"
import { useEffect, useState } from "react"
import { getAllShips, getAISData, getCIIHistory, getShipCII } from "@/lib/api"
import CIIRatingCard, { CIIBadge } from "@/components/CIIRatingCard"
import dynamic from 'next/dynamic';

const ShipMap = dynamic(() => import('@/components/ShipMap'), {
  ssr: false,
});
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"

function MetricCard({ label, value, sub, subColor, children }) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      {children ? children : <div className="text-xl font-semibold text-gray-900">{value}</div>}
      {sub && <div className={`text-xs mt-1 ${subColor || "text-gray-400"}`}>{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const [ships, setShips] = useState([])
  const [selectedKey, setSelectedKey] = useState("klasogun")
  const [livePosition, setLivePosition] = useState(null)
  const [gpsTrack, setGPSTrack] = useState([])
  const [ciiTimeline, setCiiTimeline] = useState([])
  const [allVoyages, setAllVoyages] = useState([])

  const [selectedVoyageId, setSelectedVoyageId] = useState(null)
  const [voyageDetail, setVoyageDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    getAllShips().then(setShips)
  }, [])

  useEffect(() => {
    if (selectedVoyageId === null) {
      getAISData(selectedKey, "latest").then(data => setLivePosition(data.position))
      getAISData(selectedKey, "track").then(data => setGPSTrack(data.track || []))
    }
  }, [selectedKey, selectedVoyageId])

  useEffect(() => {
    getShipCII(selectedKey).then(data => {
      if (data && data.ciiByYear) setCiiTimeline(data.ciiByYear)
    })
  }, [selectedKey])

  useEffect(() => {
    getCIIHistory(selectedKey).then(voyages => setAllVoyages(voyages || []))
  }, [selectedKey])

  useEffect(() => {
    if (!selectedVoyageId) {
      setVoyageDetail(null)
      return
    }
    setLoadingDetail(true)
    fetch(`/api/ships/${selectedKey}/voyages/${selectedVoyageId}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          console.error(data.error)
          setVoyageDetail(null)
        } else {
          setVoyageDetail(data.voyage)
          setGPSTrack(data.track || [])
          if (data.track && data.track.length > 0) {
            const last = data.track[data.track.length - 1]
            setLivePosition({
              lat: last.lat,
              lon: last.lon,
              sog: last.sog || 0,
              weather: last.weather || "",
              from_port: data.voyage.from_port,
              to_port: data.voyage.to_port,
            })
          }
        }
        setLoadingDetail(false)
      })
      .catch(() => setLoadingDetail(false))
  }, [selectedVoyageId, selectedKey])

  const ship = ships.find(s => s.ship_key === selectedKey) || ships[0]
  if (!ship) return <div className="p-6 text-sm text-gray-400">Memuat data kapal...</div>

  const isRealTime = selectedKey === "klasogun"
  const latestGPS = livePosition

  // ==================== DATA METRIC ====================
  let displayData;
  if (voyageDetail) {
    const dist = parseFloat(voyageDetail.distance_nm) || 0
    const seaDays = parseFloat(voyageDetail.sea_time_days) || (parseFloat(voyageDetail.sea_time_hours) / 24)
    const fuelPerNm = ship.fuel_cons_2025 ? (ship.fuel_cons_2025 / ship.distance_2025) : 0
    const estFuel = (dist * fuelPerNm).toFixed(1)
    displayData = {
      cii: voyageDetail.cii_attained ? parseFloat(voyageDetail.cii_attained).toFixed(2) : "—",
      rating: voyageDetail.rating || "C",
      fuelME: estFuel,
      fuelAE: "—",
      distance: Math.round(dist).toLocaleString(),
      speed: voyageDetail.avg_speed_knots ? parseFloat(voyageDetail.avg_speed_knots).toFixed(1) : "10.0",
      seaDays: seaDays.toFixed(1),
      weather: latestGPS?.weather || "",
    }
  } else {
    // Mode ringkasan
    let fuelMeValue = "—";
    // Cek apakah kapal Balongan dan model tersedia
    if (ship.ship_key === 'balongan' && ship.fuel_coef_speed != null && ship.fuel_intercept != null) {
      // Gunakan model regresi pada kecepatan 10 knot
      const speedKnot = 10;
      const fuelPerHour = ship.fuel_coef_speed * Math.pow(speedKnot, 3) + ship.fuel_intercept;
      fuelMeValue = (fuelPerHour * 24).toFixed(1);
    } else if (ship.fuel_cons_2025) {
      // Fallback rata‑rata tahunan
      fuelMeValue = (ship.fuel_cons_2025 / 365).toFixed(1);
    }

    displayData = {
      cii: ship.cii_attained ? parseFloat(ship.cii_attained).toFixed(2) : "—",
      rating: ship.rating || "C",
      fuelME: fuelMeValue,
      fuelAE: "—",
      distance: ship.distance_2025 ? parseInt(ship.distance_2025).toLocaleString() : "—",
      speed: "10.0",
      seaDays: null,
      weather: latestGPS?.weather || "",
    }
  }

  const ciiChartData = ciiTimeline.length > 0
    ? ciiTimeline.map(d => ({ label: d.year, cii: parseFloat(d.cii_attained) }))
    : [
        { label: "2023", cii: 15.3 }, { label: "2024", cii: 15.1 },
        { label: "2025", cii: 14.9 }, { label: "2026", cii: 14.7 },
        { label: "2027", cii: 14.5 }, { label: "2028", cii: 14.3 },
      ]

  const sortedVoyages = [...allVoyages].sort((a, b) => {
    if (!a.date_departure) return 1
    if (!b.date_departure) return -1
    return new Date(b.date_departure) - new Date(a.date_departure)
  })

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Dashboard CII</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {ship.name} — {isRealTime ? "Live GPS Tracking" : "Data Operasional"}
            {voyageDetail && ` — Detail Voyage`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isRealTime && latestGPS && !voyageDetail && (
            <span className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-full border border-green-200">
              🟢 Live GPS
            </span>
          )}
        </div>
      </div>

      {/* Pilih Kapal */}
      <div className="flex gap-3">
        {ships.map((s) => {
          const r = s.rating || "C"
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
              onClick={() => {
                setSelectedKey(s.ship_key)
                setSelectedVoyageId(null)
              }}
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
                <div className="text-xs text-gray-400">{s.vessel_type} · DWT {s.dwt?.toLocaleString()}</div>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${rColor[r] || rColor["C"]}`}>{r}</span>
            </button>
          )
        })}
      </div>

      {/* Dropdown Voyage */}
      <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
        <label htmlFor="voyageSelect" className="text-sm font-medium text-gray-700 whitespace-nowrap">
          Riwayat Perjalanan:
        </label>
        <select
          id="voyageSelect"
          value={selectedVoyageId || ""}
          onChange={(e) => {
            const val = e.target.value
            setSelectedVoyageId(val ? parseInt(val) : null)
          }}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:border-blue-400"
        >
          <option value="">📊 Semua Data (Ringkasan)</option>
          {sortedVoyages.map(v => {
            const depDate = v.date_departure
              ? new Date(v.date_departure).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
              : '?'
            return (
              <option key={v.id} value={v.id}>
                {v.from_port?.split(',')[0] || '?'} → {v.to_port?.split(',')[0] || '?'} — {depDate}
              </option>
            )
          })}
        </select>
        {loadingDetail && <span className="text-xs text-gray-400">Memuat...</span>}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label={voyageDetail ? "CII Voyage Ini" : "Nilai CII Saat Ini"}
          sub={voyageDetail ? `Rating: ${displayData.rating}` : `Target: < ${ship.cii_ref_value || "—"}`}
        >
          <span className="flex items-baseline gap-2">
            <span className="text-xl font-semibold text-gray-900">{displayData.cii}</span>
            <CIIBadge rating={displayData.rating} size="sm" />
          </span>
        </MetricCard>
        <MetricCard
          label={voyageDetail ? "Jarak Voyage" : "Konsumsi BBM"}
          value={voyageDetail ? `${displayData.distance} nm` : `${displayData.fuelME} t/hari`}
          sub={voyageDetail ? (displayData.seaDays ? `${displayData.seaDays} hari` : "") : (ship.ship_key === 'balongan' && ship.fuel_coef_speed ? "estimasi model regresi" : "rata-rata tahun 2025")}
        />
        <MetricCard
          label="Kecepatan"
          value={`${displayData.speed} kn`}
          sub="rata‑rata operasi"
        />
        <MetricCard
          label={voyageDetail ? "Konsumsi BBM (Est.)" : "Total Jarak 2025"}
          value={voyageDetail ? `${displayData.fuelME} ton` : `${displayData.distance} nm`}
          sub={!voyageDetail && latestGPS?.weather ? latestGPS.weather : ""}
        />
      </div>

      {/* Charts – hanya tampil di mode ringkasan */}
      {!voyageDetail && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-sm font-medium text-gray-700 mb-3">Tren CII — Per Tahun</div>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={ciiChartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="ciiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [Number(v).toFixed(2), "CII"]} />
                <Area type="monotone" dataKey="cii" stroke="#3B82F6" strokeWidth={2} fill="url(#ciiGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-sm font-medium text-gray-700 mb-3">Total Konsumsi BBM — Tahunan</div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={[
                { t: "2023", v: ship.fuel_cons_2023 || 0 },
                { t: "2024", v: ship.fuel_cons_2024 || 0 },
                { t: "2025", v: ship.fuel_cons_2025 || 0 },
              ]} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} MT`, "Total BBM"]} />
                <Line type="monotone" dataKey="v" stroke="#F59E0B" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Peta & Rating */}
      <div className="grid grid-cols-2 gap-4">
        <ShipMap
          from={voyageDetail?.from_port || latestGPS?.from_port || ship.from_port || "Gresik (Surabaya)"}
          to={voyageDetail?.to_port || latestGPS?.to_port || ship.to_port || "Pantai Camplong"}
          shipLabel={ship.name}
          gpsTrack={gpsTrack}
          isRealTime={isRealTime && !voyageDetail}
        />
        <CIIRatingCard
          cii={displayData.cii}
          rating={displayData.rating}
          target={ship.cii_req}
          refValue={ship.cii_ref_value}
        />
      </div>
    </div>
  )
}