import pandas as pd
from sqlalchemy import create_engine

old_db_uri = "postgresql://postgres.qjqpepkgjfpbbwnvzuts:TArahmat77!@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
new_db_uri = "postgresql://postgres:Sayang271102%3C3@db.bxmwgsvpixbkhpxbpbbx.supabase.co:5432/postgres"

old_engine = create_engine(old_db_uri)
new_engine = create_engine(new_db_uri)

tables = [
    "ship", "port", "fuel_price", "cii_boundaries", 
    "fuel_annual", "voyage", "noon_report", "cii_daily", "ais_tracking"
]

print("Mulai menyalin database langsung dari cloud Supabase...")
for table in tables:
    print(f"Menyalin tabel: {table} ...")
    try:
        df = pd.read_sql_table(table, con=old_engine)
        if df.empty:
            print(f"  Tabel {table} kosong, skip.")
        else:
            df.to_sql(name=table, con=new_engine, if_exists='replace', index=False, chunksize=1000)
            print(f"  Berhasil menyalin {len(df)} baris tabel {table}.")
    except Exception as e:
        print(f"  Gagal menyalin tabel {table}: {e}")

print("Proses salin database selesai!")
