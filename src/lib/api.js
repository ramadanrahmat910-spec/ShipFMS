// src/lib/api.js — FETCH DARI DATABASE (via API routes)
const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/api$/, "")

export async function getAllShips() {
  const res = await fetch(`${BASE_URL}/api/ships`)
  if (!res.ok) throw new Error("Gagal fetch ships")
  const data = await res.json()
  return data.ships
}

export async function getShipByKey(shipKey) {
  const ships = await getAllShips()
  return ships.find(s => s.ship_key === shipKey) || ships[0]
}

export async function getCIIHistory(shipKey) {
  const res = await fetch(`${BASE_URL}/api/ships/${shipKey}/voyage`)
  if (!res.ok) throw new Error("Gagal fetch voyages")
  const data = await res.json()
  return data.voyages
}

export async function getShipCII(shipKey) {
  const res = await fetch(`${BASE_URL}/api/ships/${shipKey}/cii`)
  if (!res.ok) throw new Error("Gagal fetch CII")
  return res.json()
}

export async function getAISData(shipKey, mode = "latest") {
  const res = await fetch(`${BASE_URL}/api/ships/${shipKey}/ais?mode=${mode}`)
  if (!res.ok) throw new Error("Gagal fetch AIS")
  return res.json()
}

export async function calculateCII(formData) {
  const res = await fetch(`${BASE_URL}/api/input/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData),
  })
  if (!res.ok) throw new Error("Gagal kalkulasi CII")
  return res.json()
}