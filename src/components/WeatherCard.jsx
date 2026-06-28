// export default function WeatherCard({ data }) {
//   if (!data) return null;
//   return (
//     <div className="bg-white border border-gray-200 rounded-xl p-5">
//       <div className="text-sm font-medium text-gray-700 mb-3">Kondisi Cuaca Terkini</div>
//       <div className="grid grid-cols-2 gap-3 text-sm">
//         <div>
//           <span className="text-gray-400">Suhu</span>
//           <div className="font-semibold">{data.temperature} °C</div>
//         </div>
//         <div>
//           <span className="text-gray-400">Kecepatan Angin</span>
//           <div className="font-semibold">{data.windSpeed} knot</div>
//         </div>
//         <div>
//           <span className="text-gray-400">Arah Angin</span>
//           <div className="font-semibold">{data.windDirection}°</div>
//         </div>
//         <div>
//           <span className="text-gray-400">Skala Beaufort</span>
//           <div className="font-semibold">{data.beaufort}</div>
//         </div>
//       </div>
//       <div className="mt-2 text-xs text-gray-500">
//         Cuaca: {data.weather}
//       </div>
//     </div>
//   );
// }