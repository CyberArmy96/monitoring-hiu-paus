const MAX_DATA_POINTS = 50;
let map = null;
let marker = null;
let pathLine = null;
let pathCoordinates = [];
let historicalData = {
    timestamps: [],
    speed: [],
    temperature: [],
    dissolvedOxygen: [],
    pressure: [],
    depth: [],
    accelX: [],
    accelY: [],
    accelZ: []
};
let speedChart, tempChart, doChart, pressureChart, accelChart;
window.onload = function() {
    initializeCharts();
    initializeMap();
    updateTimestamp();
    startDemoMode(); 
};
const socket = io();
socket.on('connect', () => {
    console.log('✅ Terhubung ke Server Node.js via Socket.IO');
});
socket.on('data', (data) => {
    console.log('📥 Data baru diterima dari server:', data);
    updateDashboard(data);
    storeData(data);
    updateCharts();
    updateMap(data);
    updateDataTable(data);
});
socket.on('disconnect', () => {
    console.log('❌ Koneksi ke server terputus.');
});
function updateDashboard(data) {
    document.getElementById('deviceId').textContent = data.device_id || '--';
    document.getElementById('speedValue').textContent = data.speed_cms?.toFixed(1) || '0.0';
    document.getElementById('tempValue').textContent = data.temperature?.toFixed(1) || '0.0';
    document.getElementById('doValue').textContent = data.dissolved_oxygen?.toFixed(1) || '0.0';
    document.getElementById('pressureValue').textContent = data.pressure?.toFixed(1) || '0.0';
    document.getElementById('depthValue').textContent = data.depth?.toFixed(1) || '0.0';
    document.getElementById('accelX').textContent = data.acceleration?.x?.toFixed(3) || '0.000';
    document.getElementById('accelY').textContent = data.acceleration?.y?.toFixed(3) || '0.000';
    document.getElementById('accelZ').textContent = data.acceleration?.z?.toFixed(3) || '0.000';
    document.getElementById('latitude').textContent = data.location?.lat?.toFixed(6) || '--';
    document.getElementById('longitude').textContent = data.location?.lon?.toFixed(6) || '--';
    document.getElementById('dataQuality').textContent = (data.quality || 0) + '%';
    const pumpElement = document.getElementById('pumpStatus');
    if (data.pump_state) {
        pumpElement.textContent = 'ON';
        pumpElement.className = 'pump-status on';
    } else {
        pumpElement.textContent = 'OFF';
        pumpElement.className = 'pump-status off';
    }
    updateTimestamp();
}
function storeData(data) {
    const timestamp = new Date().toLocaleTimeString('id-ID');
    historicalData.timestamps.push(timestamp);
    historicalData.speed.push(data.speed_cms || 0);
    historicalData.temperature.push(data.temperature || 0);
    historicalData.dissolvedOxygen.push(data.dissolved_oxygen || 0);
    historicalData.pressure.push(data.pressure || 0);
    historicalData.depth.push(data.depth || 0);
    historicalData.accelX.push(data.acceleration?.x || 0);
    historicalData.accelY.push(data.acceleration?.y || 0);
    historicalData.accelZ.push(data.acceleration?.z || 0);
    if (historicalData.timestamps.length > MAX_DATA_POINTS) {
        Object.keys(historicalData).forEach(key => {
            historicalData[key].shift();
        });
    }
}
function initializeCharts() {
    console.log("Inisialisasi Chart...");
    try {
        const speedCtx = document.getElementById('speedChartCanvas').getContext('2d'); // PENTING: Pastikan ada <canvas id="speedChartCanvas">
        speedChart = new Chart(speedCtx, {
            type: 'line',
            data: {
                labels: historicalData.timestamps,
                datasets: [{
                    label: 'Speed (cm/s)',
                    data: historicalData.speed,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
        const tempCtx = document.getElementById('tempChartCanvas').getContext('2d'); // PENTING: Pastikan ada <canvas id="tempChartCanvas">
        tempChart = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: historicalData.timestamps,
                datasets: [{
                    label: 'Temperature (°C)',
                    data: historicalData.temperature,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
        const accelCtx = document.getElementById('accelChartCanvas').getContext('2d'); // PENTING: Pastikan ada <canvas id="accelChartCanvas">
        accelChart = new Chart(accelCtx, {
            type: 'line',
            data: {
                labels: historicalData.timestamps,
                datasets: [
                    { label: 'Accel X', data: historicalData.accelX, borderColor: 'rgba(255, 206, 86, 1)', borderWidth: 1.5, tension: 0.4 },
                    { label: 'Accel Y', data: historicalData.accelY, borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1.5, tension: 0.4 },
                    { label: 'Accel Z', data: historicalData.accelZ, borderColor: 'rgba(153, 102, 255, 1)', borderWidth: 1.5, tension: 0.4 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    } catch (e) {
        console.error("Error initializing charts. Pastikan ID elemen <canvas> sudah benar.", e);
    }
}
function updateCharts() {
    console.log("Memperbarui Chart...");
    try {
        const allCharts = [speedChart, tempChart, accelChart];
        allCharts.forEach(chart => {
            if (chart) {
                chart.data.labels = historicalData.timestamps;
            }
        });
        speedChart.data.datasets[0].data = historicalData.speed;
        tempChart.data.datasets[0].data = historicalData.temperature;
        accelChart.data.datasets[0].data = historicalData.accelX;
        accelChart.data.datasets[1].data = historicalData.accelY;
        accelChart.data.datasets[2].data = historicalData.accelZ;
        allCharts.forEach(chart => {
            if (chart) {
                chart.update('none');
            }
        });
    } catch (e) {
        console.error("Error updating charts:", e);
    }
}
function initializeMap() {
    console.log("Inisialisasi Peta...");
    try {
        map = L.map('mapContainer').setView([-2.548926, 118.0148634], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        marker = L.marker([-2.548926, 118.0148634]).addTo(map).bindPopup('Fish Location');
        pathLine = L.polyline(pathCoordinates, {color: 'blue'}).addTo(map);
    } catch (e) {
        console.error("Error initializing map. Pastikan ada <div id='mapContainer'>.", e);
    }
}
function updateMap(data) {
    console.log("Memperbarui Peta...");
    if (!map || !data.location || data.location.lat == null || data.location.lon == null) {
        return;
    }
    try {
        const newPosition = [data.location.lat, data.location.lon];
        marker.setLatLng(newPosition);
        pathCoordinates.push(newPosition);
        pathLine.setLatLngs(pathCoordinates);
        map.panTo(newPosition);
    } catch (e) {
        console.error("Error updating map:", e);
    }
}
function updateTimestamp() {
    const timestampElement = document.getElementById('lastUpdatedValue');
    if (timestampElement) {
        timestampElement.textContent = new Date().toLocaleString('id-ID', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }
}
function showAlert(message, type = 'info') {
    const alertElement = document.getElementById('alertBox');
    if (alertElement) {
        alertElement.textContent = message;
        alertElement.className = `alert ${type}`;
        alertElement.style.display = 'block';
        setTimeout(() => {
            alertElement.style.display = 'none';
        }, 5000);
    }
}