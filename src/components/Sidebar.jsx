"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="1" width="6" height="6" rx="1.5" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/input",
    label: "Prediksi CII",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2" width="12" height="12" rx="2" />
        <line x1="8" y1="5" x2="8" y2="11" />
        <line x1="5" y1="8" x2="11" y2="8" />
      </svg>
    ),
  },
  {
    href: "/dashboard/rekomendasi",
    label: "Rekomendasi",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="7" r="5" />
        <path d="M8 5v3" strokeLinecap="round" />
        <circle cx="8" cy="10" r="0.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/dashboard/histori",
    label: "Histori",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="1,10 4,5 7,9 10,4 13,8 15,6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/dashboard/kapal",
    label: "Data Kapal",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 13c2-5 10-5 12 0" strokeLinecap="round" />
        <path d="M5 13V8l3-3 3 3v5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-52 min-h-screen border-r border-gray-200 bg-gray-50 flex flex-col flex-shrink-0">
      <div className="px-4 py-5 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-900">ShipCII</div>
        <div className="text-xs text-gray-500 mt-0.5">Monitoring System</div>
      </div>

      <nav className="flex-1 px-3 py-3 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-white text-gray-900 font-medium shadow-sm border border-gray-200"
                  : "text-gray-500 hover:bg-white hover:text-gray-700"
              }`}
            >
              <span className={isActive ? "opacity-100" : "opacity-60"}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
          <div>
            <div className="text-xs font-medium text-gray-800">Live</div>
            <div className="text-xs text-gray-400">AIS terhubung</div>
          </div>
        </div>
      </div>
    </aside>
  )
}