import "./globals.css";
import 'leaflet/dist/leaflet.css';   // ← tambahkan ini

export const metadata = { title: "ShipCII", description: "Monitoring CII Kapal Real-time" };

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}