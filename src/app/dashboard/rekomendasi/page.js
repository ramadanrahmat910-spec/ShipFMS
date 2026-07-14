// src/app/dashboard/rekomendasi/page.js — REVISI
// =================================================
// [FIX] Sekarang pakai DSS ENGINE penuh (AHP+SAW, lib/dss.js) — dua
// panel konsisten dengan halaman Input: berbasis CII akumulasi resmi
// IMO, dan berbasis CII voyage terisolasi.

"use client"
import { useEffect, useState, useMemo } from "react"
import DSSPanel from "@/components/DSSPanel"
import { runDSS } from "@/lib/dss"
import { SIM_YEAR } from "@/lib/simulationClock"
import Link from "next/link"

export default function RekomendasiPage() {
  const [result, setResult] = useState(null)

  useEffect(() => {
    const saved = localStorage.getItem("lastCIIResult")
    if (saved) {
      try {
        setResult(JSON.parse(saved))
      } catch (e) {
        console.error("Gagal parse lastCIIResult dari localStorage:", e)
      }
    }
  }, [])

  const dssAccumulated = useMemo(() => {
    if (!result) return null
    const status = {
      running_cii:      result.estimatedCII,
      cii_required:     result.ciiRequired,
      running_grade:    result.estimatedGrade,
      distance_nm_ytd:  (result.baselineDistanceNM ?? 0) + result.distanceNM,
      fuel_cons_mt_ytd: result.baselineFuelMT != null ? result.baselineFuelMT + result.fuelTon : null,
    }
    return runDSS({ shipKey: result.shipKey, status, avgSpeedKnot: result.avgSpeedKnot, year: SIM_YEAR })
  }, [result])

  const dssIsolated = useMemo(() => {
    if (!result) return null
    const status = {
      running_cii:      result.isolatedCII,
      cii_required:     result.ciiRequired,
      running_grade:    result.isolatedGrade,
      distance_nm_ytd:  result.distanceNM,
      fuel_cons_mt_ytd: result.fuelTon,
    }
    return runDSS({ shipKey: result.shipKey, status, avgSpeedKnot: result.avgSpeedKnot, year: SIM_YEAR })
  }, [result])

  return (
    <div className="p-6 w-full">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Rekomendasi Perbaikan CII</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Berdasarkan hasil perhitungan CII{result ? ` untuk voyage ${result.originPort} → ${result.destPort}` : ""}.
          </p>
        </div>
        <Link
          href="/dashboard/input"
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Hitung CII baru →
        </Link>
      </div>

      {!result ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-8 text-center">
          <div className="text-3xl mb-2 text-gray-300">📋</div>
          <div className="text-sm text-gray-400 mb-3">Belum ada data kalkulasi CII.</div>
          <Link
            href="/dashboard/input"
            className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-block"
          >
            Mulai Kalkulasi CII →
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {result.fuelComparison?.delta && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs text-emerald-700 font-semibold mb-0.5">
                  💰 Perbandingan Biaya BBM vs Baseline B35
                </div>
                <div className="text-lg font-semibold text-emerald-800">
                  {result.fuelComparison.delta.costDiffIDR >= 0 ? "+" : "-"}Rp{" "}
                  {Math.abs(result.fuelComparison.delta.costDiffIDR).toLocaleString("id-ID")}
                </div>
              </div>
              <div className="text-[11px] text-emerald-600 max-w-xs text-right">
                Emisi CO₂ {result.fuelComparison.delta.co2PctReduced}% lebih rendah dibanding B35
                ({result.fuelComparison.delta.co2TonSaved} ton CO₂ dihemat).
              </div>
            </div>
          )}

          {/* Dua panel DSS — konsisten dengan halaman Input */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-sm font-semibold text-gray-900">DSS — Perhitungan IMO (Akumulasi Tahunan)</div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2 py-0.5">
                Grade {result.estimatedGrade}
              </span>
            </div>
            <DSSPanel dss={dssAccumulated} loading={false} />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-sm font-semibold text-gray-900">DSS — CII Voyage Terisolasi</div>
              <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100 rounded-full px-2 py-0.5">
                Grade {result.isolatedGrade}
              </span>
            </div>
            <DSSPanel dss={dssIsolated} loading={false} />
          </div>
        </div>
      )}
    </div>
  )
}