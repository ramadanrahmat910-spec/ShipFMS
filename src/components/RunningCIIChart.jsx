"use client"

import { useEffect, useRef } from 'react'
import { formatCII } from '@/lib/ciiCalculation'

/**
 * RunningCIIChart — grafik utama Running Annual CII vs Required CII
 *
 * Props:
 *   monthlyData   {array}  — dari getRunningCIIMonthly(), 12 elemen max
 *   ciiRequired   {number} — garis horizontal merah putus-putus
 *   year          {number} — tahun (default 2025)
 *   height        {number} — tinggi chart dalam px (default 220)
 */
export default function RunningCIIChart({ monthlyData = [], ciiRequired, year = 2025, height = 220 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    // ── Setup dimensi ──
    const dpr = window.devicePixelRatio || 1
    const W   = canvas.offsetWidth
    const H   = height
    canvas.width  = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    const PAD = { top: 16, right: 24, bottom: 36, left: 48 }
    const chartW = W - PAD.left - PAD.right
    const chartH = H - PAD.top  - PAD.bottom

    // ── Data ──
    const months      = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des']
    const ciiValues   = months.map((_, i) => {
      const row = monthlyData.find(d => d.month === i + 1)
      return row?.running_cii ?? null
    })
    const hasData     = ciiValues.some(v => v !== null)
    const validValues = ciiValues.filter(v => v !== null)
    const allValues   = ciiRequired ? [...validValues, ciiRequired] : validValues
    const minVal      = allValues.length ? Math.min(...allValues) * 0.92 : 0
    const maxVal      = allValues.length ? Math.max(...allValues) * 1.08 : 30

    const toX = i  => PAD.left + (i / 11) * chartW
    const toY = v  => PAD.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH

    // ── Grid & Y axis ──
    const yTicks = 5
    ctx.strokeStyle = '#f3f4f6'
    ctx.lineWidth   = 1
    ctx.fillStyle   = '#9ca3af'
    ctx.font        = '10px system-ui'
    ctx.textAlign   = 'right'
    for (let i = 0; i <= yTicks; i++) {
      const val = minVal + (i / yTicks) * (maxVal - minVal)
      const y   = toY(val)
      ctx.beginPath()
      ctx.moveTo(PAD.left, y)
      ctx.lineTo(PAD.left + chartW, y)
      ctx.stroke()
      ctx.fillText(val.toFixed(1), PAD.left - 6, y + 3)
    }

    // ── X axis labels ──
    ctx.fillStyle = '#9ca3af'
    ctx.textAlign = 'center'
    months.forEach((m, i) => {
      ctx.fillText(m, toX(i), H - PAD.bottom + 16)
    })

    // ── Garis Required CII (merah putus-putus) ──
    if (ciiRequired) {
      const y = toY(ciiRequired)
      ctx.save()
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth   = 1.5
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(PAD.left, y)
      ctx.lineTo(PAD.left + chartW, y)
      ctx.stroke()
      // Label
      ctx.fillStyle   = '#ef4444'
      ctx.font        = '10px system-ui'
      ctx.textAlign   = 'left'
      ctx.fillText(`Required ${formatCII(ciiRequired)}`, PAD.left + 4, y - 4)
      ctx.restore()
    }

    if (!hasData) {
      ctx.fillStyle = '#d1d5db'
      ctx.font      = '12px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('Data belum tersedia', W / 2, H / 2)
      return
    }

    // ── Area fill (gradient biru) ──
    const firstIdx = ciiValues.findIndex(v => v !== null)
    const lastIdx  = ciiValues.map((v, i) => v !== null ? i : -1).filter(i => i >= 0).pop()

    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH)
    grad.addColorStop(0,   'rgba(59,130,246,0.15)')
    grad.addColorStop(1,   'rgba(59,130,246,0.01)')

    ctx.beginPath()
    ctx.moveTo(toX(firstIdx), toY(ciiValues[firstIdx]))
    for (let i = firstIdx + 1; i <= lastIdx; i++) {
      if (ciiValues[i] !== null) {
        ctx.lineTo(toX(i), toY(ciiValues[i]))
      }
    }
    ctx.lineTo(toX(lastIdx), PAD.top + chartH)
    ctx.lineTo(toX(firstIdx), PAD.top + chartH)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // ── Garis CII (biru solid) ──
    ctx.save()
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth   = 2.5
    ctx.lineJoin    = 'round'
    ctx.lineCap     = 'round'
    ctx.beginPath()
    let started = false
    ciiValues.forEach((v, i) => {
      if (v === null) return
      if (!started) { ctx.moveTo(toX(i), toY(v)); started = true }
      else            ctx.lineTo(toX(i), toY(v))
    })
    ctx.stroke()
    ctx.restore()

    // ── Titik data ──
    ciiValues.forEach((v, i) => {
      if (v === null) return
      const x = toX(i)
      const y = toY(v)
      // Outer circle
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle   = '#fff'
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth   = 2
      ctx.fill()
      ctx.stroke()
    })

    // ── Titik terakhir — highlight ──
    const lastVal = ciiValues[lastIdx]
    if (lastVal !== null) {
      const x = toX(lastIdx)
      const y = toY(lastVal)
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fillStyle = '#3b82f6'
      ctx.fill()
      // Label nilai
      ctx.fillStyle = '#1d4ed8'
      ctx.font      = 'bold 11px system-ui'
      ctx.textAlign = x > W - 60 ? 'right' : 'left'
      ctx.fillText(formatCII(lastVal), x + (x > W - 60 ? -10 : 10), y - 8)
    }

  }, [monthlyData, ciiRequired, year, height])

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="text-sm font-semibold text-gray-900">Running Annual CII {year}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            Perkembangan nilai CII kumulatif Jan–Des dibanding batas IMO
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-blue-500 rounded" />
            <span className="text-xs text-gray-500">CII Attained</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="24" height="6">
              <line x1="0" y1="3" x2="24" y2="3" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="5,3" />
            </svg>
            <span className="text-xs text-gray-500">Required CII</span>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ height: `${height}px` }} className="w-full mt-2">
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>

    </div>
  )
}


// ─── GRAFIK 2: DISTANCE KUMULATIF ────────────────────────────

/**
 * CumulativeDistanceChart — grafik distance kumulatif tahunan
 *
 * Props:
 *   data    {array}  — dari getCumulativeByMonth(), tiap elemen { month, distance_nm_cum }
 *   year    {number}
 *   height  {number}
 */
export function CumulativeDistanceChart({ data = [], year = 2025, height = 160 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const dpr = window.devicePixelRatio || 1
    const W   = canvas.offsetWidth
    const H   = height
    canvas.width  = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    const PAD    = { top: 12, right: 16, bottom: 32, left: 52 }
    const chartW = W - PAD.left - PAD.right
    const chartH = H - PAD.top  - PAD.bottom
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des']

    const values = months.map((_, i) => {
      const row = data.find(d => d.month === i + 1)
      return row?.distance_nm_cum ?? null
    })

    const maxVal  = Math.max(...values.filter(v => v !== null), 1) * 1.1
    const toX     = i => PAD.left + (i / 11) * chartW
    const toY     = v => PAD.top + chartH - (v / maxVal) * chartH

    // Grid
    ctx.strokeStyle = '#f3f4f6'
    ctx.lineWidth   = 1
    ctx.fillStyle   = '#9ca3af'
    ctx.font        = '9px system-ui'
    ctx.textAlign   = 'right'
    for (let i = 0; i <= 4; i++) {
      const val = (i / 4) * maxVal
      const y   = toY(val)
      ctx.beginPath()
      ctx.moveTo(PAD.left, y)
      ctx.lineTo(PAD.left + chartW, y)
      ctx.stroke()
      ctx.fillText(val >= 1000 ? `${(val/1000).toFixed(0)}k` : val.toFixed(0), PAD.left - 4, y + 3)
    }

    // X labels
    ctx.fillStyle = '#9ca3af'
    ctx.textAlign = 'center'
    months.forEach((m, i) => ctx.fillText(m, toX(i), H - PAD.bottom + 14))

    // Area
    const firstIdx = values.findIndex(v => v !== null)
    const lastIdx  = values.map((v,i) => v !== null ? i : -1).filter(i => i >= 0).pop() ?? -1
    if (firstIdx < 0) return

    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH)
    grad.addColorStop(0, 'rgba(16,185,129,0.15)')
    grad.addColorStop(1, 'rgba(16,185,129,0.01)')
    ctx.beginPath()
    ctx.moveTo(toX(firstIdx), toY(values[firstIdx]))
    for (let i = firstIdx + 1; i <= lastIdx; i++) {
      if (values[i] !== null) ctx.lineTo(toX(i), toY(values[i]))
    }
    ctx.lineTo(toX(lastIdx), PAD.top + chartH)
    ctx.lineTo(toX(firstIdx), PAD.top + chartH)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // Line
    ctx.strokeStyle = '#10b981'
    ctx.lineWidth   = 2
    ctx.lineJoin    = 'round'
    ctx.beginPath()
    let started = false
    values.forEach((v, i) => {
      if (v === null) return
      if (!started) { ctx.moveTo(toX(i), toY(v)); started = true }
      else            ctx.lineTo(toX(i), toY(v))
    })
    ctx.stroke()

  }, [data, year, height])

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="text-sm font-semibold text-gray-900 mb-0.5">Distance Kumulatif {year}</div>
      <div className="text-xs text-gray-400 mb-2">Total jarak tempuh Jan–Des (NM)</div>
      <div style={{ height: `${height}px` }} className="w-full">
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}


// ─── GRAFIK 3: FUEL KUMULATIF ─────────────────────────────────

/**
 * CumulativeFuelChart — grafik fuel consumption kumulatif tahunan
 *
 * Props:
 *   data    {array}  — dari getCumulativeByMonth(), tiap elemen { month, fuel_cons_mt_cum }
 *   year    {number}
 *   height  {number}
 */
export function CumulativeFuelChart({ data = [], year = 2025, height = 160 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const dpr = window.devicePixelRatio || 1
    const W   = canvas.offsetWidth
    const H   = height
    canvas.width  = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    const PAD    = { top: 12, right: 16, bottom: 32, left: 52 }
    const chartW = W - PAD.left - PAD.right
    const chartH = H - PAD.top  - PAD.bottom
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des']

    const values = months.map((_, i) => {
      const row = data.find(d => d.month === i + 1)
      return row?.fuel_cons_mt_cum ?? null
    })

    const maxVal  = Math.max(...values.filter(v => v !== null), 1) * 1.1
    const toX     = i => PAD.left + (i / 11) * chartW
    const toY     = v => PAD.top + chartH - (v / maxVal) * chartH

    // Grid
    ctx.strokeStyle = '#f3f4f6'
    ctx.lineWidth   = 1
    ctx.fillStyle   = '#9ca3af'
    ctx.font        = '9px system-ui'
    ctx.textAlign   = 'right'
    for (let i = 0; i <= 4; i++) {
      const val = (i / 4) * maxVal
      const y   = toY(val)
      ctx.beginPath()
      ctx.moveTo(PAD.left, y)
      ctx.lineTo(PAD.left + chartW, y)
      ctx.stroke()
      ctx.fillText(val.toFixed(1), PAD.left - 4, y + 3)
    }

    // X labels
    ctx.fillStyle = '#9ca3af'
    ctx.textAlign = 'center'
    months.forEach((m, i) => ctx.fillText(m, toX(i), H - PAD.bottom + 14))

    const firstIdx = values.findIndex(v => v !== null)
    const lastIdx  = values.map((v,i) => v !== null ? i : -1).filter(i => i >= 0).pop() ?? -1
    if (firstIdx < 0) return

    // Area
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH)
    grad.addColorStop(0, 'rgba(245,158,11,0.15)')
    grad.addColorStop(1, 'rgba(245,158,11,0.01)')
    ctx.beginPath()
    ctx.moveTo(toX(firstIdx), toY(values[firstIdx]))
    for (let i = firstIdx + 1; i <= lastIdx; i++) {
      if (values[i] !== null) ctx.lineTo(toX(i), toY(values[i]))
    }
    ctx.lineTo(toX(lastIdx), PAD.top + chartH)
    ctx.lineTo(toX(firstIdx), PAD.top + chartH)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // Line
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth   = 2
    ctx.lineJoin    = 'round'
    ctx.beginPath()
    let started = false
    values.forEach((v, i) => {
      if (v === null) return
      if (!started) { ctx.moveTo(toX(i), toY(v)); started = true }
      else            ctx.lineTo(toX(i), toY(v))
    })
    ctx.stroke()

  }, [data, year, height])

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="text-sm font-semibold text-gray-900 mb-0.5">Fuel Consumption Kumulatif {year}</div>
      <div className="text-xs text-gray-400 mb-2">Total konsumsi BBM Jan–Des (MT)</div>
      <div style={{ height: `${height}px` }} className="w-full">
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}