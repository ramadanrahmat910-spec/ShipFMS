#!/usr/bin/env python3
"""
Import data voyage dari file Excel (Voyage_Summary) ke tabel voyage.
Untuk kedua kapal: Klasogun & Balongan.
"""

import pandas as pd
import psycopg2

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "ship_cii_database",
    "user": "postgres",
    "password": "112233",
}

EXCEL_KLASOGUN = r"C:\Users\N1NRK\Downloads\ais_like_klasogun.xlsx"
EXCEL_BALONGAN = r"C:\Users\N1NRK\Downloads\AIS_Like_Balongan.xlsx"

def import_voyage_from_summary(filename, ship_key, cur):
    df = pd.read_excel(filename, sheet_name='Voyage_Summary')
    count = 0
    for _, row in df.iterrows():
        code = int(row['Voyage_Code'])
        dep  = pd.to_datetime(row['Departure_Timestamp'])
        arr  = pd.to_datetime(row['Arrival_Timestamp_Estimated_From_Sea_Time'])
        dist = float(row['Distance_Nm'])
        sea_h = float(row['Sea_Time_H'])
        sea_d = float(row['Sea_Time_Day']) if 'Sea_Time_Day' in row and pd.notna(row['Sea_Time_Day']) else sea_h / 24.0
        cond = row['Cargo_Status']
        sog  = float(row['Calculated_SOG_knots'])

        cii_ref      = float(row['CII_Ref']) if 'CII_Ref' in row and pd.notna(row['CII_Ref']) else None
        cii_attained = float(row['CII_Attained']) if 'CII_Attained' in row and pd.notna(row['CII_Attained']) else None
        rating       = row['Rating'] if 'Rating' in row and pd.notna(row['Rating']) else None

        cur.execute("""
            INSERT INTO voyage (ship_id, voyage_code, date_departure, date_arrived,
                from_port, to_port, distance_nm, sea_time_hours, sea_time_days,
                sail_condition, avg_speed_knots, cii_ref, cii_attained, rating)
            VALUES ((SELECT id FROM ship WHERE ship_key = %s), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (ship_id, voyage_code) DO UPDATE SET
                cii_attained = EXCLUDED.cii_attained,
                rating = EXCLUDED.rating
        """, (
            ship_key, code, dep, arr,
            row['From_Port'], row['To_Port'],
            dist, sea_h, sea_d, cond, sog,
            cii_ref, cii_attained, rating
        ))
        count += 1
    return count


conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

print("[1/2] Import voyage MT. KLASOGUN...")
n1 = import_voyage_from_summary(EXCEL_KLASOGUN, 'klasogun', cur)
conn.commit()
print(f"  ✅ {n1} voyage Klasogun diimport")

print("[2/2] Import voyage MT. BALONGAN...")
n2 = import_voyage_from_summary(EXCEL_BALONGAN, 'balongan', cur)
conn.commit()
print(f"  ✅ {n2} voyage Balongan diimport")

cur.close()
conn.close()
print(f"\n✅ Total {n1 + n2} voyage berhasil diimpor.")