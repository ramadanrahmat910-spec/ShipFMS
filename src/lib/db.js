import { Pool } from 'pg'

let pool

export function getPool() {
  if (!pool) {
    // Gunakan DATABASE_URL jika tersedia (production Vercel)
    if (process.env.DATABASE_URL) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false, // Supabase memerlukan SSL
        },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      })
    } else {
      // Koneksi lokal (development)
      // PENTING: pakai Session Pooler, BUKAN direct connection (db.<ref>.supabase.co).
      // Direct connection hanya resolve ke alamat IPv6 (sudah dicek: tidak ada IPv4
      // sama sekali untuk project ini), sehingga gagal connect dari kebanyakan
      // jaringan rumahan/ISP di Indonesia maupun dari Vercel (tidak ada outbound IPv6).
      // Session pooler (pooler.supabase.com) punya alamat IPv4 dan jauh lebih kompatibel.
      const supabasePassword = process.env.SUPABASE_PASSWORD || 'TArahmat77!' // ← ganti ini
      pool = new Pool({
        host:     process.env.DB_HOST     || 'aws-1-ap-south-1.pooler.supabase.com',
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME     || 'postgres',
        // Catatan: dengan Session Pooler, username HARUS menyertakan project-ref
        // (format: postgres.<project-ref>), bukan cuma "postgres" seperti pada
        // direct connection. Ini detail yang sering terlewat dan bikin auth gagal.
        user:     process.env.DB_USER     || 'postgres.qjqpepkgjfpbbwnvzuts',
        password: supabasePassword,
        ssl: {
          rejectUnauthorized: false, // Supabase memerlukan SSL
        },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      })
    }
    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err)
    })
  }
  return pool
}

export async function query(text, params) {
  const client = await getPool().connect()
  try {
    return await client.query(text, params)
  } finally {
    client.release()
  }
}