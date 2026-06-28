// import Sidebar from "@/components/Sidebar"

// export const metadata = {
//   title: "ShipCII Dashboard",
//   description: "Monitoring CII Kapal Real-time",
// }

// export default function DashboardLayout({ children }) {
//   return (
//     <div className="flex min-h-screen bg-white">
//       <Sidebar />
//       <main className="flex-1 overflow-auto">
//         {children}
//       </main>
//     </div>
//   )
// }

import Sidebar from "@/components/Sidebar"
 
export const metadata = { title: "ShipCII Dashboard" }
 
export default function DashboardLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">{children}</main>
    </div>
  )
}
