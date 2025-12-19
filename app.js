const map = L.map("map").setView([-6.2, 106.8], 12); 
 
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { 
  maxZoom: 19, 
  attribution: "&copy; OpenStreetMap contributors" 
}).addTo(map); 
 
const osrmBaseUrl = "https://router.project-osrm.org"; 
 
let waypoints = [];   
let tripLayer = null; 
 
const profileSelect = document.getElementById("profile"); 
const clearBtn = document.getElementById("clear"); 
const matrixBtn = document.getElementById("btn-matrix"); 
const tripBtn = document.getElementById("btn-trip"); 
const stopsList = document.getElementById("stops-list"); 
const matrixContainer = document.getElementById("matrix-container"); 
const tripOrderList = document.getElementById("trip-order"); 
const infoDiv = document.getElementById("info"); 
 
// Add waypoint on map click 
map.on("click", (e) => { 
  addWaypoint(e.latlng); 
}); 
 
function addWaypoint(latlng) { 
  const index = waypoints.length; 
  const marker = L.marker(latlng, { draggable: true }) 
    .addTo(map) 
    .bindPopup(`Stop ${index + 1}`)
    .openPopup(); 
marker.on("dragend", () => { 
const pos = marker.getLatLng(); 
waypoints[index].lat = pos.lat; 
waypoints[index].lng = pos.lng; 
renderStopsList(); 
}); 
waypoints.push({ 
lat: latlng.lat, 
lng: latlng.lng, 
marker 
}); 
renderStopsList(); 
} 
function clearAll() { 
waypoints.forEach((w) => map.removeLayer(w.marker)); 
waypoints = []; 
if (tripLayer) { 
map.removeLayer(tripLayer); 
tripLayer = null; 
} 
matrixContainer.innerHTML = ""; 
stopsList.innerHTML = ""; 
tripOrderList.innerHTML = ""; 
infoDiv.innerHTML = ""; 
} 
clearBtn.addEventListener("click", clearAll); 
function renderStopsList() { 
stopsList.innerHTML = ""; 
waypoints.forEach((wp, idx) => { 
const li = document.createElement("li"); 
li.textContent = `Stop ${idx + 1}: (${wp.lat.toFixed(5)}, 
${wp.lng.toFixed(5)})`; 
stopsList.appendChild(li); 
// update popup 
wp.marker.setPopupContent(`Stop ${idx + 1}`); 
}); 
} 
// Helper: format 
function formatDurationMinutes(seconds) {
  return (seconds / 60).toFixed(1); 
} 
function formatDistanceKm(meters) { 
return (meters / 1000).toFixed(2); 
} 
// Compute OD Matrix 
matrixBtn.addEventListener("click", async () => { 
if (waypoints.length < 2) { 
infoDiv.innerHTML = "Tambah minimal 2 titik untuk matrix."; 
return; 
} 
infoDiv.innerHTML = "Computing OD matrix..."; 
matrixContainer.innerHTML = ""; 
tripOrderList.innerHTML = ""; 
if (tripLayer) { 
map.removeLayer(tripLayer); 
tripLayer = null; 
} 
const profile = profileSelect.value; 
const coords = waypoints 
.map((wp) => `${wp.lng},${wp.lat}`) 
.join(";"); 
const url = 
`${osrmBaseUrl}/table/v1/${profile}/${coords}?annotations=duration`; 
try { 
const res = await fetch(url); 
const data = await res.json(); 
if (data.code !== "Ok") { 
infoDiv.innerHTML = `Error from OSRM: ${data.message || 
data.code}`; 
return; 
} 
const durations = data.durations; 
renderMatrix(durations); 
infoDiv.innerHTML = "OD matrix computed."; 
} catch (err) { 
console.error(err); 
infoDiv.innerHTML = "Failed to fetch table."; 
} 
});
function renderMatrix(durations) { 
const n = durations.length; 
let html = "<table><tr><th></th>"; 
for (let j = 0; j < n; j++) { 
html += `<th>${j + 1}</th>`; 
} 
html += "</tr>"; 
for (let i = 0; i < n; i++) { 
html += `<tr><th>${i + 1}</th>`; 
for (let j = 0; j < n; j++) { 
const val = durations[i][j]; 
html += `<td>${val == null ? "-" : 
formatDurationMinutes(val)}</td>`; 
} 
html += "</tr>"; 
} 
html += "</table>"; 
matrixContainer.innerHTML = html; 
} 
// Optimize Trip (TSP-like) 
tripBtn.addEventListener("click", async () => { 
if (waypoints.length < 3) { 
infoDiv.innerHTML = "Minimal 3 titik untuk trip."; 
return; 
} 
infoDiv.innerHTML = "Optimizing trip (TSP heuristic)..."; 
matrixContainer.innerHTML = ""; 
tripOrderList.innerHTML = ""; 
if (tripLayer) { 
map.removeLayer(tripLayer); 
tripLayer = null; 
} 
const profile = profileSelect.value; 
const coords = waypoints 
.map((wp) => `${wp.lng},${wp.lat}`) 
.join(";"); 
// first point as start & end (roundtrip) 
const url = 
`${osrmBaseUrl}/trip/v1/${profile}/${coords}?roundtrip=true&source=firs
t&destination=last&geometries=geojson`; 
try { 
const res = await fetch(url); 
const data = await res.json();
if (data.code !== "Ok") { 
infoDiv.innerHTML = `Error from OSRM: ${data.message || 
data.code}`; 
return; 
} 
const trip = data.trips[0]; 
if (!trip) { 
infoDiv.innerHTML = "No trip found."; 
return; 
} 
const coordsTrip = trip.geometry.coordinates.map((c) => [c[1], 
c[0]]); 
tripLayer = L.polyline(coordsTrip, { 
color: "#1976d2", 
weight: 5, 
opacity: 0.9 
}).addTo(map); 
map.fitBounds(tripLayer.getBounds(), { padding: [40, 40] }); 
infoDiv.innerHTML = ` 
<b>Trip found!</b><br/> 
Total distance: ${formatDistanceKm(trip.distance)} km<br/> 
Total duration: ${(trip.duration / 3600).toFixed(2)} hours 
`; 
renderTripOrder(data.waypoints); 
} catch (err) { 
console.error(err); 
infoDiv.innerHTML = "Failed to fetch trip."; 
} 
}); 
// Render urutan kunjungan dari waypoints trip 
function renderTripOrder(waypointsTrip) { 
tripOrderList.innerHTML = ""; 
// waypointsTrip mengandung info "waypoint_index" = urutan di trip 
const sorted = [...waypointsTrip].sort( 
(a, b) => a.waypoint_index - b.waypoint_index 
); 
sorted.forEach((wp, idx) => { 
const li = document.createElement("li"); 
const originalIndex = wp.waypoint_index; 
    li.textContent = `Visit Stop ${originalIndex + 1} at 
(${wp.location[1].toFixed( 
      5 
    )}, ${wp.location[0].toFixed(5)})`; 
    tripOrderList.appendChild(li); 
  }); 
} 