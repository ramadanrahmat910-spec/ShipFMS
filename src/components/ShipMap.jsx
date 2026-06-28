"use client";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import { useState, useEffect } from 'react';

// Koordinat pelabuhan (dari database / data Anda)
const PORTS_COORDS = {
  "Gresik (Surabaya)":       { lat: -7.15389,  lon: 112.65611 },
  "Pantai Camplong":         { lat: -7.242325, lon: 113.2664 },
  "Ampenan":                 { lat: -8.5833,   lon: 116.0833 },
  "Benoa, Bali":             { lat: -8.7487,   lon: 115.215 },
  "Manggis":                 { lat: -8.4697,   lon: 115.51 },
  "Jakarta, Tanjung Priok":  { lat: -6.1044,   lon: 106.8814 },
  "Donggala":                { lat: -0.678,    lon: 119.752 },
  "Kendari":                 { lat: -3.9742,   lon: 122.513 },
  "Banyuwangi (Tg Wangi)":   { lat: -8.217,    lon: 114.37 },
  "Bima":                    { lat: -8.46,     lon: 118.72 },
};

export default function ShipMap({ from, to, shipLabel, gpsTrack = [], isRealTime = false }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const center = [-5.0, 115.0];
  const zoom = 5;

  // Posisi kapal (live / estimasi)
  let shipPos = null;
  if (gpsTrack.length > 0) {
    const latest = gpsTrack[gpsTrack.length - 1];
    shipPos = {
      lat: Number(latest.lat),
      lon: Number(latest.lon),
    };
  } else if (from && to && PORTS_COORDS[from] && PORTS_COORDS[to]) {
    const f = PORTS_COORDS[from];
    const t = PORTS_COORDS[to];
    shipPos = {
      lat: (Number(f.lat) + Number(t.lat)) / 2,
      lon: (Number(f.lon) + Number(t.lon)) / 2,
    };
  }

  // Jika belum mounted, render placeholder saja
  if (!mounted) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ height: '400px' }}>
        <div className="w-full h-full bg-gray-100 flex items-center justify-center text-sm text-gray-400">
          Memuat peta...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <MapContainer center={center} zoom={zoom} style={{ height: '400px', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Pelabuhan: titik biru kecil */}
        {Object.entries(PORTS_COORDS).map(([name, coord]) => (
          <CircleMarker
            key={name}
            center={[Number(coord.lat), Number(coord.lon)]}
            radius={5}
            pathOptions={{ fillColor: 'blue', color: 'white', weight: 2, fillOpacity: 0.8 }}
          >
            <Tooltip direction="top" offset={[0, -10]}>
              {name}
            </Tooltip>
          </CircleMarker>
        ))}

        {/* Rute dari pelabuhan asal ke tujuan */}
        {from && to && PORTS_COORDS[from] && PORTS_COORDS[to] && (
          <Polyline
            positions={[
              [Number(PORTS_COORDS[from].lat), Number(PORTS_COORDS[from].lon)],
              [Number(PORTS_COORDS[to].lat), Number(PORTS_COORDS[to].lon)],
            ]}
            pathOptions={{ color: 'blue', dashArray: '6 4', weight: 2 }}
          />
        )}

        {/* Track GPS (history) */}
        {gpsTrack.length > 1 && (
          <Polyline
            positions={gpsTrack.map(p => [Number(p.lat), Number(p.lon)])}
            pathOptions={{ color: 'green', weight: 2, opacity: 0.6 }}
          />
        )}

        {/* Kapal (posisi real‑time / estimasi) → titik hijau */}
        {shipPos && (
          <CircleMarker
            center={[shipPos.lat, shipPos.lon]}
            radius={7}
            pathOptions={{ fillColor: 'green', color: 'white', weight: 2, fillOpacity: 0.9 }}
          >
            <Tooltip permanent direction="top" offset={[0, -12]}>
              {shipLabel || `${from?.slice(0, 10)} → ${to?.slice(0, 10)}`}
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>

      <div className="px-4 py-2 border-t border-blue-100 flex items-center justify-between">
        <span className="text-xs text-blue-700 font-medium">
          {from} → {to}
        </span>
        <span className="text-xs text-gray-400">
          {isRealTime ? "Live GPS Tracking" : "Posisi via AIS"}
        </span>
      </div>
    </div>
  );
}