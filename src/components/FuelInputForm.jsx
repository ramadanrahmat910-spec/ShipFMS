"use client";
import { useState, useEffect } from "react";
import { calculateCII, getAllShips, getCIIHistory } from "@/lib/api";

// Carbon Factor (Cf) — disamakan persis dengan FUEL_CF di lib/ciiCalculation.js
// supaya info yang ditampilkan ke user konsisten dengan yang dipakai backend.
const CF_FACTORS = {
  B40: 2.390, // berlaku Jan–Jun 2026
  B50: 2.343, // berlaku Jul 2026+
};
const FUEL_OPTIONS = ["B40", "B50"];

// Koordinat pelabuhan (hardcode sementara, nanti sebaiknya diganti fetch
// dari tabel `port` di DB via /api/ports -- supaya 1 sumber data yang sama
// dengan fallback Haversine di backend, bukan 2 daftar terpisah yang bisa
// beda-beda isinya)
const PORT_COORDS = {
  "Gresik (Surabaya), Java [ID]": { lat: -7.15389, lon: 112.65611 },
  "Pantai Camplong [ID]": { lat: -7.242325, lon: 113.2664 },
  "Ampenan [ID]": { lat: -8.5833, lon: 116.0833 },
  "Benoa, Bali [ID]": { lat: -8.7487, lon: 115.215 },
  "Manggis [ID]": { lat: -8.4697, lon: 115.51 },
  "Jakarta, Tanjung Priok [ID]": { lat: -6.1044, lon: 106.8814 },
  "Donggala [ID]": { lat: -0.678, lon: 119.752 },
  "Kendari [ID]": { lat: -3.9742, lon: 122.513 },
  "Banyuwangi (Tg Wangi) [ID]": { lat: -8.217, lon: 114.37 },
  "Bima [ID]": { lat: -8.46, lon: 118.72 },
};

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function FuelInputForm({ onResult }) {
  const [form, setForm] = useState({
    shipKey: "klasogun",
    fuelType: "B40",
    portFrom: "Gresik (Surabaya), Java [ID]",
    portTo: "Pantai Camplong [ID]",
    distance: "181",
    avgSpeed: "10",
    cargo: "6200",
  });
  const [ships, setShips] = useState([]);
  const [portList, setPortList] = useState([]);
  const [allRoutes, setAllRoutes] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getAllShips().then(setShips);
  }, []);

  useEffect(() => {
    getCIIHistory(form.shipKey).then((voyages) => {
      const ports = new Set();
      const routeMap = {};
      voyages.forEach((v) => {
        if (v.from_port) ports.add(v.from_port);
        if (v.to_port) ports.add(v.to_port);
        const key = `${v.from_port}|${v.to_port}`;
        if (!routeMap[key]) {
          routeMap[key] = {
            distance: v.distance_nm,
            days: (v.sea_time_hours / 24).toFixed(1),
          };
        }
      });
      setPortList(Array.from(ports).sort());
      setAllRoutes(routeMap);
    });
  }, [form.shipKey]);

  useEffect(() => {
    const fromCoord = PORT_COORDS[form.portFrom];
    const toCoord = PORT_COORDS[form.portTo];
    if (fromCoord && toCoord) {
      const dist = haversineDistance(fromCoord.lat, fromCoord.lon, toCoord.lat, toCoord.lon);
      setForm((f) => ({ ...f, distance: Math.round(dist).toString() }));
    }
  }, [form.portFrom, form.portTo]);

  useEffect(() => {
    if (portList.length > 0) {
      if (!portList.includes(form.portFrom)) setForm((f) => ({ ...f, portFrom: portList[0] }));
      if (!portList.includes(form.portTo)) setForm((f) => ({ ...f, portTo: portList[0] }));
    }
  }, [portList]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const selectedShip = ships.find((s) => s.ship_key === form.shipKey);

  const distNum = parseFloat(form.distance);
  const speedNum = parseFloat(form.avgSpeed);
  const estimatedDurationHours = distNum > 0 && speedNum > 0 ? distNum / speedNum : null;
  const estimatedDurationDays = estimatedDurationHours != null ? (estimatedDurationHours / 24).toFixed(1) : null;

  const handleSubmit = async () => {
    if (!form.distance) {
      setError("Lengkapi jarak.");
      return;
    }
    if (!form.avgSpeed || parseFloat(form.avgSpeed) <= 0) {
      setError("Average speed harus diisi dan lebih dari 0 knot.");
      return;
    }
    if (form.portFrom === form.portTo) {
      setError("Pelabuhan asal dan tujuan tidak boleh sama.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const payload = {
        shipKey: form.shipKey,
        fuelType: form.fuelType,
        portFrom: form.portFrom,
        portTo: form.portTo,
        distance: parseFloat(form.distance),
        avgSpeed: parseFloat(form.avgSpeed),
        cargo: parseFloat(form.cargo),
      };
      const result = await calculateCII(payload);
      onResult && onResult(result);
    } catch {
      setError("Gagal menghitung CII.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-sm font-medium text-gray-800 mb-3">Pilih Kapal</div>
        <div className="grid grid-cols-2 gap-3">
          {ships.map((ship) => (
            <button
              key={ship.ship_key}
              onClick={() => set("shipKey", ship.ship_key)}
              className={`text-left p-3 rounded-lg border transition-all ${
                form.shipKey === ship.ship_key
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-md bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                  {ship.ship_key[0]?.toUpperCase()}
                </div>
                <span className="text-xs font-medium text-gray-800">{ship.name}</span>
              </div>
              <div className="text-xs text-gray-400">
                {ship.vessel_type} · DWT {ship.dwt?.toLocaleString()}
              </div>
            </button>
          ))}
        </div>
        {selectedShip && (
          <div className="mt-3 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
            Kapal dipilih: <span className="font-medium text-gray-600">{selectedShip.name}</span>
            {" · "}Konsumsi bahan bakar akan dihitung otomatis dari model regresi kapal ini.
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-sm font-medium text-gray-800 mb-3">Jenis Bahan Bakar</div>
        <Field label="Fuel Type" required>
          <select value={form.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
            {FUEL_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <div className="mt-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800">
          Carbon Factor {form.fuelType}: {CF_FACTORS[form.fuelType]} g CO₂/g fuel
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-sm font-medium text-gray-800 mb-3">
          Rute Pelayaran (khusus {selectedShip?.name || "kapal"})
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Pelabuhan Asal (Origin)" required>
            <select value={form.portFrom} onChange={(e) => set("portFrom", e.target.value)}>
              {portList.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Pelabuhan Tujuan (Destination)" required>
            <select value={form.portTo} onChange={(e) => set("portTo", e.target.value)}>
              {portList.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Jarak (nm) – dihitung otomatis (Haversine)">
            <input
              type="number"
              value={form.distance}
              min="0"
              onChange={(e) => set("distance", e.target.value)}
              placeholder="Jarak"
            />
          </Field>
          <Field label="Average Speed (knot)" required>
            <input
              type="number"
              value={form.avgSpeed}
              min="0.1"
              step="0.1"
              onChange={(e) => set("avgSpeed", e.target.value)}
              placeholder="Kecepatan rata-rata"
            />
          </Field>
        </div>
        {estimatedDurationDays && (
          <div className="mt-2 text-xs text-gray-400">
            Estimasi durasi voyage: <span className="font-medium text-gray-600">{estimatedDurationDays} hari</span>{" "}
            (dihitung dari jarak ÷ average speed)
          </div>
        )}
        <div className="mt-1 text-xs text-gray-400">
          * Jarak dihitung dengan rumus Haversine berdasarkan koordinat pelabuhan. Anda tetap bisa mengubahnya.
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-sm font-medium text-gray-800 mb-3">Data Operasional</div>
        <Field label="Muatan / Cargo (ton)" required>
          <input type="number" value={form.cargo} min="0" onChange={(e) => set("cargo", e.target.value)} />
        </Field>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>
      )}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {loading ? "Menghitung..." : "Hitung CII & Dapatkan Rekomendasi →"}
      </button>
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-gray-500">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="[&>select]:w-full [&>select]:text-sm [&>select]:px-3 [&>select]:py-2 [&>select]:border [&>select]:border-gray-200 [&>select]:rounded-lg [&>select]:bg-white [&>select]:text-gray-900 [&>input]:w-full [&>input]:text-sm [&>input]:px-3 [&>input]:py-2 [&>input]:border [&>input]:border-gray-200 [&>input]:rounded-lg [&>input]:bg-white [&>input]:text-gray-900 [&>input:focus]:outline-none [&>input:focus]:border-blue-400 [&>select:focus]:outline-none [&>select:focus]:border-blue-400">
        {children}
      </div>
    </div>
  );
}