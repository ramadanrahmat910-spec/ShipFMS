"use client"
// src/app/dashboard/input/page.js — REVISI
// ==========================================
// [FIX] Jarak tidak lagi diinput manual di form — sekarang HANYA
// ditampilkan di panel hasil (dihitung otomatis via Haversine, tetap
// dari lib/FuelInputForm.jsx, cuma tidak ditampilkan sebagai input).
// [FIX] Panel hasil dirombak jadi 3 blok yang jelas:
//   1. Hasil CII       — kartu rating + ringkasan angka voyage
//   2. Rekomendasi     — RecommendationPanel (dengan "Dasar perhitungan")
//   3. Cara Mendapatkan Hasil Ini — walkthrough transparan tahap demi
//      tahap (Haversine → durasi → MLR fuel → CO2 → CII), memakai
//      angka asli dari hasil simulasi, bukan rumus abstrak saja.

import { useState, useMemo } from "react"
import FuelInputForm from "@/components/FuelInputForm"
import CIIRatingCard from "@/components/CIIRatingCard"
import DSSPanel from "@/components/DSSPanel"
import { MLR_COEF, FUEL_CF, formatDuration, formatDistanceNM } from "@/lib/ciiCalculation"
import { runDSS } from "@/lib/dss"
import { SIM_YEAR } from "@/lib/simulationClock"
import Link from "next/link"

function handleResult(setResult) {
  return (data) => {
    setResult(data)
    try {
      localStorage.setItem("lastCIIResult", JSON.stringify(data))
    } catch (e) {
      console.error("Gagal simpan hasil ke localStorage:", e)
    }
  }
}

function StepRow({ n, title, formula, resultLine }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-800">{title}</div>
        <div className="text-[11px] text-gray-400 font-mono mt-0.5 break-words">{formula}</div>
        <div className="text-xs text-blue-700 font-medium mt-1">{resultLine}</div>
      </div>
    </div>
  )
}

export default function InputPage() {
  const [result, setResult] = useState(null)

  // [BARU] DSS berbasis CII AKUMULASI (resmi IMO) — status disusun dari
  // baseline tahunan + voyage ini (baselineDistanceNM/baselineFuelMT
  // dikirim API khusus untuk ini).
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

  // [BARU] DSS berbasis CII TERISOLASI (voyage ini saja) — status
  // memakai jarak/BBM voyage ini sendiri, bukan akumulasi tahunan.
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
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Simulasi Operasional</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Masukkan data voyage (kapal, asal, tujuan, muatan, jenis BBM, kecepatan rata-rata) untuk
          menghitung estimasi CII standar IMO MEPC.352(78) dan potensi penghematan biaya BBM.
          Jarak antar pelabuhan dihitung otomatis dan akan tampil di hasil.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-6 items-start">
        <FuelInputForm onResult={handleResult(setResult)} />

        <div className="flex flex-col gap-5 sticky top-6">
          {!result ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-8 text-center">
              <div className="text-3xl mb-2 text-gray-300">⟳</div>
              <div className="text-sm text-gray-400">Hasil kalkulasi CII muncul di sini setelah submit.</div>
            </div>
          ) : (
            <>
              {/* ══════════ BLOK 1: HASIL CII ══════════ */}
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-3">1. Hasil CII</div>
                <div className="flex flex-col gap-3">
                  {result.isolatedEstimate && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                      ⚠ Data akumulasi tahun berjalan kapal ini tidak ditemukan. Estimasi CII di
                      bawah hanya mencerminkan voyage ini sendiri (belum digabung dengan histori
                      tahunan), sehingga bisa terlihat jauh lebih ekstrem dari kondisi CII kapal
                      yang sebenarnya.
                    </div>
                  )}
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
                    <div>
                      Kapal: <span className="font-medium">{result.shipName}</span> &nbsp;|&nbsp;
                      DWT: <span className="font-medium">{result.dwt?.toLocaleString()}</span>
                    </div>
                    <div>
                      Rute: <span className="font-medium">{result.originPort} → {result.destPort}</span> &nbsp;|&nbsp;
                      Jarak: <span className="font-medium">{formatDistanceNM(result.distanceNM)}</span>
                    </div>
                    <div>
                      Kecepatan: <span className="font-medium">{result.avgSpeedKnot} kn</span> &nbsp;|&nbsp;
                      Estimasi durasi: <span className="font-medium">{formatDuration(result.durationDays)}</span>
                    </div>
                  </div>

                  <CIIRatingCard
                    cii={result.estimatedCII}
                    rating={result.estimatedGrade}
                    ciiRequired={result.ciiRequired}
                    refValue={result.ciiRequired}
                  />

                  {/* [BARU] CII Voyage Ini (Terisolasi) — metrik kedua yang
                      SENSITIF terhadap kecepatan/BBM per voyage, karena
                      dihitung TANPA digabung akumulasi tahunan. Ini menjawab
                      kebutuhan "what-if" — beda dengan CII resmi di atas
                      (yang wajib berbasis akumulasi tahunan sesuai IMO). */}
                  {result.isolatedCII != null && (
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-medium text-gray-700">CII Voyage Ini (Terisolasi)</div>
                        <span className="text-[10px] bg-purple-50 text-purple-600 border border-purple-100 rounded-full px-2 py-0.5">
                          Ilustratif — bukan CII resmi
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-semibold text-gray-900">{result.isolatedCII}</span>
                        <span className="text-xs text-gray-400">Grade {result.isolatedGrade}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                        Dihitung hanya dari voyage ini sendiri (bukan digabung akumulasi setahun) — jadi
                        <span className="font-medium text-gray-600"> sensitif terhadap kecepatan & jenis BBM</span>,
                        cocok untuk membandingkan skenario "bagaimana-jika". Muatan tetap tidak berpengaruh di sini
                        juga — rumus CII IMO memang tidak melibatkan muatan aktual, hanya DWT nominal.
                        Angka CII resmi tahunan tetap yang di kartu atas (wajib akumulasi SUM/SUM sesuai IMO).
                      </div>
                    </div>
                  )}

                  {/* [BARU] CII presisi tinggi + delta dari baseline — kartu di
                      atas cuma tampil 2 desimal, jadi perubahan kecil dari satu
                      voyage (dibanding total ~190 ribu NM setahun) tidak
                      kelihatan di situ. Baris ini membuktikan angkanya memang
                      bergerak setiap kali input diubah, meski pergerakannya
                      wajar sangat kecil untuk satu voyage pendek. */}
                  {result.baselineCII != null && (
                    <div className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2 flex flex-wrap gap-x-3 gap-y-1">
                      <span>CII presisi: <span className="font-mono text-gray-600">{result.estimatedCII?.toFixed(7)}</span></span>
                      <span>Baseline saat ini: <span className="font-mono text-gray-600">{result.baselineCII.toFixed(7)}</span></span>
                      <span>
                        Δ akibat voyage ini:{" "}
                        <span className="font-mono text-gray-600">
                          {result.estimatedCII >= result.baselineCII ? "+" : ""}
                          {(result.estimatedCII - result.baselineCII).toFixed(7)}
                        </span>
                      </span>
                    </div>
                  )}

                  {/* [BARU] Penjelasan kenapa CII/Grade hampir tidak pernah
                      berubah dari satu voyage simulasi — supaya tidak terlihat
                      seperti bug. Voyage ini ditambahkan ke AKUMULASI SETAHUN
                      PENUH, jadi kontribusinya terhadap jarak tahunan biasanya
                      sangat kecil (~0.1–0.5%), sehingga Grade nyaris mustahil
                      berubah kecuali kapal memang sudah dekat batas. */}
                  {result.baselineDistanceNM ? (() => {
                    const contribPct = (result.distanceNM / result.baselineDistanceNM) * 100
                    return (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 leading-relaxed">
                        <span className="font-semibold text-slate-700">Kenapa CII di atas hampir tidak berubah?</span>{" "}
                        Voyage ini ({formatDistanceNM(result.distanceNM)}) ditambahkan ke akumulasi{" "}
                        <span className="font-medium">setahun penuh</span> kapal (
                        {Math.round(result.baselineDistanceNM).toLocaleString("id-ID")} NM) — kontribusinya cuma{" "}
                        <span className="font-semibold text-slate-800">
                          {contribPct < 0.01 ? "< 0.01" : contribPct.toFixed(2)}%
                        </span>{" "}
                        dari total jarak tahunan. Karena itu, Grade praktis tidak akan berubah dari satu voyage
                        kecuali kapal sudah dekat batas IMO. Untuk melihat pengaruh nyata dari pilihan rute/kecepatan/BBM,
                        fokus pada baris <span className="font-medium">Δ akibat voyage ini</span> di atas serta
                        perbandingan BBM, emisi, dan biaya di bawah — angka-angka itu memang murni milik voyage ini.
                      </div>
                    )
                  })() : null}

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
                      <div className="text-[11px] text-gray-400">Konsumsi BBM</div>
                      <div className="text-sm font-semibold text-gray-900">{result.fuelTon} MT</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
                      <div className="text-[11px] text-gray-400">Emisi CO₂</div>
                      <div className="text-sm font-semibold text-gray-900">{result.co2Ton} ton</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
                      <div className="text-[11px] text-gray-400">Biaya BBM</div>
                      <div className="text-sm font-semibold text-gray-900">
                        Rp {result.fuelCostIDR?.toLocaleString("id-ID")}
                      </div>
                    </div>
                  </div>

                  {result.fuelComparison?.delta && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                      <div className="text-xs text-emerald-700 font-semibold mb-1">💰 Perbandingan Biaya BBM vs Baseline B35</div>
                      <div className="text-lg font-semibold text-emerald-800">
                        {result.fuelComparison.delta.costDiffIDR >= 0 ? "+" : "-"}Rp{" "}
                        {Math.abs(result.fuelComparison.delta.costDiffIDR).toLocaleString("id-ID")}
                      </div>
                      <div className="text-xs text-emerald-600 mt-0.5">
                        Emisi CO₂ {result.fuelComparison.delta.co2PctReduced}% lebih rendah
                        ({result.fuelComparison.delta.co2TonSaved} ton CO₂ dihemat) dibanding B35.
                      </div>
                    </div>
                  )}

                  <Link
                    href="/dashboard/rekomendasi"
                    className="text-center py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors"
                  >
                    Lihat Rekomendasi Lengkap →
                  </Link>
                </div>
              </div>

              {/* ══════════ BLOK 2: DECISION SUPPORT SYSTEM (2 PANEL) ══════════ */}
              <div className="flex flex-col gap-5">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="text-sm font-semibold text-gray-900">2a. DSS — Perhitungan IMO (Akumulasi Tahunan)</div>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2 py-0.5">
                      Grade {result.estimatedGrade}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">
                    Berdasarkan CII resmi setelah voyage ini digabung ke akumulasi setahun kapal — angka yang dipakai untuk kepatuhan standar IMO.
                  </p>
                  <DSSPanel dss={dssAccumulated} loading={false} />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="text-sm font-semibold text-gray-900">2b. DSS — CII Voyage Terisolasi</div>
                    <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100 rounded-full px-2 py-0.5">
                      Grade {result.isolatedGrade}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">
                    Berdasarkan CII voyage ini SENDIRI saja (tanpa digabung akumulasi tahunan) — cocok untuk melihat
                    efisiensi voyage ini secara berdiri sendiri, mis. per bulan/per rute, bukan status kepatuhan IMO.
                  </p>
                  <DSSPanel dss={dssIsolated} loading={false} />
                </div>
              </div>

              {/* ══════════ BLOK 3: CARA MENDAPATKAN HASIL INI ══════════ */}
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-3">3. Cara Mendapatkan Hasil Ini</div>
                <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
                  <StepRow
                    n={1}
                    title="Jarak — rumus Haversine antar koordinat pelabuhan"
                    formula="d = R × 2×asin(√(sin²(Δlat/2) + cos(lat1)×cos(lat2)×sin²(Δlon/2))), R = 3440.065 NM"
                    resultLine={`${result.originPort} → ${result.destPort} = ${formatDistanceNM(result.distanceNM)}`}
                  />
                  <StepRow
                    n={2}
                    title="Estimasi durasi voyage"
                    formula="durasi = jarak (NM) ÷ kecepatan (knot) ÷ 24"
                    resultLine={`${result.distanceNM} NM ÷ ${result.avgSpeedKnot} knot ÷ 24 = ${formatDuration(result.durationDays)}`}
                  />
                  <StepRow
                    n={3}
                    title="Estimasi konsumsi BBM — model regresi linear berganda (MLR)"
                    formula={`Fuel (MT/hari) = ${MLR_COEF.b0.toFixed(4)} + ${MLR_COEF.b1.toFixed(6)}×distance − ${Math.abs(MLR_COEF.b2).toFixed(6)}×speed`}
                    resultLine={`Total BBM voyage (fuel/hari × ${result.durationDays} hari) = ${result.fuelTon} MT`}
                  />
                  <StepRow
                    n={4}
                    title="Emisi CO₂ — Carbon Factor (Cf) IMO"
                    formula={`CO2 (ton) = fuel (MT) × Cf(${result.fuelType}) — Cf${result.fuelType} = ${FUEL_CF[result.fuelType] ?? '—'}`}
                    resultLine={`${result.fuelTon} MT × ${FUEL_CF[result.fuelType] ?? '—'} = ${result.co2Ton} ton CO₂`}
                  />
                  <StepRow
                    n={5}
                    title="CII setelah voyage — akumulasi tahun berjalan"
                    formula="CII = (ΣCO2_gram akumulasi) ÷ (DWT × Σdistance akumulasi) × 10⁷"
                    resultLine={`Estimasi CII setelah voyage ini = ${result.estimatedCII} (Grade ${result.estimatedGrade})`}
                  />
                  <StepRow
                    n={6}
                    title="Status kepatuhan IMO"
                    formula="Comply jika CII_attained ≤ CII_Required tahun berjalan"
                    resultLine={`${result.estimatedCII} ${result.estimatedCII <= result.ciiRequired ? "≤" : ">"} ${result.ciiRequired} → ${result.imoStatus}`}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}