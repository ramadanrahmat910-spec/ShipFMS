import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.sql import text

old_db_uri = "postgresql://postgres.qjqpepkgjfpbbwnvzuts:TArahmat77!@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
new_db_uri = "postgresql://postgres:Sayang271102%3C3@db.bxmwgsvpixbkhpxbpbbx.supabase.co:5432/postgres"

old_engine = create_engine(old_db_uri)
new_engine = create_engine(new_db_uri)

with old_engine.connect() as conn:
    print("--- VIEWS ---")
    views = conn.execute(text("SELECT table_name, view_definition FROM information_schema.views WHERE table_schema = 'public'")).fetchall()
    for v in views:
        print(f"CREATE OR REPLACE VIEW {v[0]} AS\n{v[1]};")
        try:
            with new_engine.connect() as new_conn:
                new_conn.execute(text(f"CREATE OR REPLACE VIEW {v[0]} AS\n{v[1]}"))
                new_conn.commit()
            print(f"Successfully created view {v[0]}")
        except Exception as e:
            print(f"Error creating view {v[0]}: {e}")

    print("\n--- FUNCTIONS ---")
    funcs = conn.execute(text("""
        SELECT proname, pg_get_functiondef(p.oid) 
        FROM pg_proc p 
        JOIN pg_namespace n ON n.oid = p.pronamespace 
        WHERE n.nspname = 'public' AND prokind = 'f'
    """)).fetchall()
    
    for f in funcs:
        print(f"Function: {f[0]}")
        if f[1]:
            try:
                with new_engine.connect() as new_conn:
                    new_conn.execute(text(f[1]))
                    new_conn.commit()
                print(f"Successfully created function {f[0]}")
            except Exception as e:
                print(f"Error creating function {f[0]}: {e}")
