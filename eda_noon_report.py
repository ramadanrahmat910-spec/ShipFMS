#!/usr/bin/env python3
"""Exploratory Data Analysis untuk Noon Report"""

import psycopg2
import pandas as pd
import numpy as np

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "ship_cii_database",
    "user": "postgres",
    "password": "112233",
}

conn = psycopg2.connect(**DB_CONFIG)
df = pd.read_sql("""
    SELECT voyage_date, from_port, to_port, avg_speed,
           distance_nm, steaming_time_h, cargo_status,
           fuel_cons_mt_per_day
    FROM noon_report
    ORDER BY voyage_date
""", conn)
conn.close()

print("=" * 60)
print("STATISTIK DESKRIPTIF")
print("=" * 60)
print(df.describe())

print("\n" + "=" * 60)
print("DATA BERDASARKAN CARGO STATUS")
print("=" * 60)
print(df.groupby('cargo_status').describe())

print("\n" + "=" * 60)
print("10 DATA PERTAMA")
print("=" * 60)
print(df.head(10))

print("\n" + "=" * 60)
print("DATA DENGAN KECEPATAN = 0")
print("=" * 60)
print(df[df['avg_speed'] == 0])

print("\n" + "=" * 60)
print("DATA DENGAN FUEL = 0")
print("=" * 60)
print(df[df['fuel_cons_mt_per_day'] == 0])

# Cek korelasi
print("\n" + "=" * 60)
print("KORELASI SPEED vs FUEL")
print("=" * 60)
print(df[['avg_speed', 'fuel_cons_mt_per_day', 'distance_nm']].corr())

# Cek data dengan kecepatan > 0 saja
df_valid = df[df['avg_speed'] > 0]
if len(df_valid) > 0:
    print("\n" + "=" * 60)
    print("KORELASI (HANYA SPEED > 0)")
    print("=" * 60)
    print(df_valid[['avg_speed', 'fuel_cons_mt_per_day', 'distance_nm']].corr())