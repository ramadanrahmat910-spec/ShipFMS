#!/usr/bin/env python3
"""
Import raw AIS data dari file Excel multi-sheet (versi robust).
- Sheet 'MT.BALONGAN' dan 'MT.KLASOGUN'
- Kolom diidentifikasi berdasarkan kata kunci, bukan nama persis.
"""

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "ship_cii_database",
    "user": "postgres",
    "password": "112233",
}

EXCEL_FILE = r"C:/Users/N1NRK/Downloads/AIS_2025_BothShips_FullYear.xlsx"
SHEETS = ["MT.BALONGAN", "MT.KLASOGUN"]

conn = psycopg2.connect(**DB_CONFIG)
conn.autocommit = False
cur = conn.cursor()
cur.execute("SELECT id, mmsi FROM ship WHERE mmsi IS NOT NULL")
mmsi_map = {str(row[1]): row[0] for row in cur.fetchall()}

def find_col(df, keywords):
    """Cari kolom yang mengandung salah satu keyword (case-insensitive)."""
    for kw in keywords:
        for col in df.columns:
            if kw.lower() in col.lower():
                return col
    return None

total = 0
for sheet in SHEETS:
    print(f"\nMemproses sheet: {sheet}")
    df = pd.read_excel(EXCEL_FILE, sheet_name=sheet, dtype=str)
    # Cetak kolom untuk debugging (3 pertama saja)
    print(f"  Kolom terdeteksi: {list(df.columns)[:5]}...")

    col_mmsi = find_col(df, ['MMSI'])
    col_ts   = find_col(df, ['Timestamp UTC', 'Timestamp'])
    col_lat  = find_col(df, ['Latitude', 'LAT'])
    col_lon  = find_col(df, ['Longitude', 'LON'])
    col_sog  = find_col(df, ['SOG'])
    col_cog  = find_col(df, ['COG'])
    col_hdg  = find_col(df, ['Heading', 'HDG'])
    col_nav  = find_col(df, ['Nav Status'])

    if not all([col_mmsi, col_ts, col_lat, col_lon]):
        print(f"  ❌ Kolom penting tidak ditemukan. Lewati sheet.")
        continue

    rows = []
    skipped = 0
    for _, row in df.iterrows():
        mmsi = str(row[col_mmsi]).strip()
        if mmsi.endswith('.0'):
            mmsi = mmsi[:-2]   # bersihkan format float
        ship_id = mmsi_map.get(mmsi)
        if not ship_id:
            skipped += 1
            continue

        try:
            ts = pd.to_datetime(row[col_ts])
        except:
            skipped += 1
            continue

        try:
            lat = float(row[col_lat])
            lon = float(row[col_lon])
        except (ValueError, TypeError):
            skipped += 1
            continue

        sog = float(row[col_sog]) if col_sog and pd.notna(row.get(col_sog)) else None
        cog = float(row[col_cog]) if col_cog and pd.notna(row.get(col_cog)) else None
        hdg = float(row[col_hdg]) if col_hdg and pd.notna(row.get(col_hdg)) else None
        nav = str(row[col_nav]) if col_nav and pd.notna(row.get(col_nav)) else None

        rows.append((
            ship_id, ts, lat, lon, sog, cog, hdg, nav,
            'AIS_Raw', False,
            None, None, None, None, None
        ))

    if rows:
        execute_values(cur, """
            INSERT INTO ais_tracking (
                ship_id, base_datetime,
                lat, lon, sog, cog, heading,
                status, ais_point_type, is_estimated,
                weather, temperature_c, wind_speed_kn, wind_direction, beaufort_scale
            ) VALUES %s
            ON CONFLICT DO NOTHING
        """, rows)
        conn.commit()
        print(f"  ✅ {len(rows)} titik AIS diimpor")
        total += len(rows)
    else:
        print(f"  ⚠️ Tidak ada data valid")
    print(f"  ⊙ {skipped} baris dilewati")

cur.close()
conn.close()
print(f"\n🎯 Total titik AIS berhasil diimpor: {total}")