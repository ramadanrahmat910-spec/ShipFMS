"use client"
// src/app/dashboard/kapal/page.js — REVISI
// ==========================================
// [FIX #1] Badge rating: dulu `s.rating || "C"` hardcode fallback ke "C".
//          Sekarang badge netral "–" kalau rating tidak ada. (Kolom
//          `rating` memang tidak pernah di-SELECT di getAllShips() —
//          itu memang benar apa adanya karena rating per kapal berubah
//          harian, bukan atribut statis kapal. Badge di grid kartu atas
//          sekarang mengambil dari useShipCIIStatus() yang sama seperti
//          kartu detail, bukan dari field ship yang tidak ada.)
// [FIX #2] Field dari endpoint mode=status DIKONFIRMASI: getShipCurrentStatus()
//          membaca view v_ship_current, field aslinya adalah
//          running_cii / cii_required / running_grade (lihat ciiCalculation.js
//          & db.js) — BUKAN actualCII/refCII yang ditebak versi sebelumnya.
//          ship.cii_req juga tidak pernah ada di tabel ship; dihapus.

import { useEffect, useState } from "react"
import { getAllShips } from "@/lib/api"
import { CIIBadge } from "@/components/CIIRatingCard"

function InfoRow({ label, value }) {
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="py-2.5 text-sm text-gray-400">{label}</td>
      <td className="py-2.5 text-sm text-gray-900 text-right font-medium">{value ?? "—"}</td>
    </tr>
  )
}

// Parameter CII untuk kapal tanker (konstan dari Excel)
const TANKER_CII_PARAMS = { a: 5247, c: 0.61, d1: 0.82, d2: 0.93, d3: 1.08, d4: 1.28 }

function RatingBadge({ rating }) {
  if (!rating) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-400 text-xs font-medium">
        –
      </span>
    )
  }
  return <CIIBadge rating={rating} size="sm" />
}

function useShipCIIStatus(shipKey) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!shipKey) return
    setLoading(true)
    fetch(`/api/ships/${shipKey}/cii?mode=status`)
      .then((res) => res.json())
      .then(setStatus)
      .catch((e) => {
        console.error("Gagal ambil status CII:", e)
        setStatus(null)
      })
      .finally(() => setLoading(false))
  }, [shipKey])

  return { status, loading }
}

export default function KapalPage() {
  const [ships, setShips] = useState([])
  const [selectedKey, setSelectedKey] = useState("klasogun")
  // [FIX #1] rating tiap kartu diambil live per-kapal, bukan dari s.rating yang tidak ada
  const [gradeByShip, setGradeByShip] = useState({})

  useEffect(() => {
    getAllShips().then(setShips)
  }, [])

  useEffect(() => {
    if (ships.length === 0) return
    Promise.all(
      ships.map((s) =>
        fetch(`/api/ships/${s.ship_key}/cii?mode=status`)
          .then((r) => r.json())
          .then((d) => [s.ship_key, d?.running_grade ?? null])
          .catch(() => [s.ship_key, null])
      )
    ).then((entries) => setGradeByShip(Object.fromEntries(entries)))
  }, [ships])

  const ship = ships.find((s) => s.ship_key === selectedKey)
  const { status: ciiStatus, loading: ciiLoading } = useShipCIIStatus(selectedKey)

  if (!ship) return <div className="p-6 text-sm text-gray-400">Memuat data kapal...</div>

  // [FIX #2] field yang benar dari v_ship_current
  const attainedCII = ciiStatus?.running_cii ?? null
  const requiredCII = ciiStatus?.cii_required ?? ship.cii_ref_value ?? null
  const percentageToLimit =
    attainedCII != null && requiredCII
      ? ((attainedCII / requiredCII) * 100).toFixed(0)
      : null

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Data Kapal</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Spesifikasi teknis sesuai data aktual dan MarineTraffic.
        </p>
      </div>

      {/* Kartu kapal */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {ships.map((s) => {
          const isSelected = selectedKey === s.ship_key
          return (
            <button
              key={s.ship_key}
              onClick={() => setSelectedKey(s.ship_key)}
              className={`text-left p-4 rounded-xl border transition-all ${
                isSelected
                  ? "bg-white border-blue-400 shadow-sm"
                  : "bg-gray-50 border-gray-200 hover:bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-700">
                  {s.ship_key[0]?.toUpperCase()}
                </div>
                <RatingBadge rating={gradeByShip[s.ship_key]} />
              </div>
              <div className="font-medium text-sm text-gray-900 mb-0.5">{s.name}</div>
              <div className="text-xs text-gray-400">
                {s.vessel_type} · IMO: {s.imo}
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs">
                <span className="text-gray-400">DWT</span>
                <span className="font-semibold text-gray-700">{s.dwt?.toLocaleString()}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Detail kapal */}
      <div className="grid grid-cols-2 gap-4">
        {/* Identitas */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-700">
              {ship.ship_key[0]?.toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{ship.name}</div>
              <div className="text-xs text-gray-400">
                IMO: {ship.imo} · Call sign: {ship.call_sign || "—"}
              </div>
            </div>
          </div>
          <table className="w-full">
            <tbody>
              <InfoRow label="Tipe kapal" value={ship.vessel_type} />
              <InfoRow label="Bendera" value={ship.flag} />
              <InfoRow label="Pemilik" value={ship.owner} />
              <InfoRow label="Tahun bangun" value={ship.year_built} />
              <InfoRow label="Gross Tonnage" value={ship.gross_tonnage ? `${ship.gross_tonnage.toLocaleString()} GT` : null} />
              <InfoRow label="DWT" value={ship.dwt ? `${ship.dwt.toLocaleString()} DWT` : null} />
              <InfoRow label="Panjang (LOA)" value={ship.length_m ? `${ship.length_m} m` : null} />
              <InfoRow label="Lebar (B)" value={ship.beam_m ? `${ship.beam_m} m` : null} />
              <InfoRow label="Draft (T)" value={ship.draft_m ? `${ship.draft_m} m` : null} />
            </tbody>
          </table>
        </div>

        {/* Mesin + CII */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-sm font-medium text-gray-800 mb-3">Data Teknis Mesin</div>
            <table className="w-full">
              <tbody>
                <InfoRow label="Model ME" value={ship.main_engine} />
                <InfoRow label="MCR" value={ship.mcr_kw ? `${ship.mcr_kw.toLocaleString()} kW` : null} />
                <InfoRow label="Bahan bakar" value={(ship.fuel_types || []).join(", ") || null} />
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-sm font-medium text-gray-800 mb-3">Parameter CII (Tanker)</div>
            <table className="w-full mb-4">
              <tbody>
                <InfoRow label="Parameter a" value={TANKER_CII_PARAMS.a} />
                <InfoRow label="Parameter c" value={TANKER_CII_PARAMS.c} />
                <InfoRow label="d1 (Superior)" value={TANKER_CII_PARAMS.d1} />
                <InfoRow label="d2 (Lower)" value={TANKER_CII_PARAMS.d2} />
                <InfoRow label="d3 (Upper)" value={TANKER_CII_PARAMS.d3} />
                <InfoRow label="d4 (Inferior)" value={TANKER_CII_PARAMS.d4} />
              </tbody>
            </table>

            {ciiLoading ? (
              <div className="text-xs text-gray-400">Memuat CII terkini...</div>
            ) : attainedCII != null && requiredCII ? (
              <>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-2xl font-semibold text-gray-900">{Number(attainedCII).toFixed(3)}</span>
                  <span className="text-sm text-gray-400">/ required {Number(requiredCII).toFixed(3)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      percentageToLimit <= 100 ? "bg-green-500" : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(100, percentageToLimit)}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {percentageToLimit}% dari CII required
                  {percentageToLimit > 100 ? " (melebihi batas IMO)" : " (memenuhi batas IMO)"}
                </div>
              </>
            ) : (
              <div className="text-xs text-gray-400">Data CII terkini belum tersedia untuk kapal ini.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}