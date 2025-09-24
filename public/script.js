// =================================================================
// BAGIAN 1: VARIABEL GLOBAL & KONFIGURASI
// =================================================================

// Konfigurasi untuk grafik
const MAX_DATA_POINTS = 50; // Batas data untuk ditampilkan di grafik

// Variabel untuk Peta (Leaflet.js)
let map = null;
let marker = null;
let pathLine = null;
let pathCoordinates = [];

// Variabel untuk menyimpan data historis untuk grafik
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

// Variabel untuk menyimpan instance dari setiap grafik (Chart.js)
let speedChart, tempChart, doChart, pressureChart, accelChart;


// =================================================================
// BAGIAN 2: INISIALISASI & KONEKSI REAL-TIME
// =================================================================

// Fungsi ini akan dijalankan saat seluruh halaman HTML selesai dimuat
window.onload = function() {
    // Panggil semua fungsi inisialisasi Anda di sini
    initializeCharts();
    initializeMap();
    updateTimestamp();

    // Aktifkan baris ini untuk memulai mode demo
    startDemoMode(); 
};

// Inisialisasi koneksi Socket.IO ke server Node.js
const socket = io();

// Event listener saat koneksi berhasil dibuat
socket.on('connect', () => {
    console.log('✅ Terhubung ke Server Node.js via Socket.IO');
    // Anda bisa memanggil fungsi untuk menampilkan notifikasi di sini
    // contoh: showAlert('Successfully connected to the server!', 'success');
});

// Event listener utama: dieksekusi setiap kali ada 'data' baru dari server
socket.on('data', (data) => {
    console.log('📥 Data baru diterima dari server:', data);
    
    // Panggil semua fungsi pembaruan Anda di sini
    updateDashboard(data);
    storeData(data);
    updateCharts();
    updateMap(data);
});

// Event listener saat koneksi terputus
socket.on('disconnect', () => {
    console.log('❌ Koneksi ke server terputus.');
    // contoh: showAlert('Connection to the server has been lost.', 'error');
});


// =================================================================
// BAGIAN 3: FUNGSI UTAMA PEMBARUAN DASHBOARD
// =================================================================

/**
 * Meng-update nilai-nilai utama di dashboard.
 * Kode ini diambil dari cuplikan Anda dan sudah benar.
 */
function updateDashboard(data) {
    // Update main metrics
    document.getElementById('speedValue').textContent = data.speed_cms?.toFixed(1) || '0.0';
    document.getElementById('tempValue').textContent = data.temperature?.toFixed(1) || '0.0';
    document.getElementById('doValue').textContent = data.dissolved_oxygen?.toFixed(1) || '0.0';
    document.getElementById('pressureValue').textContent = data.pressure?.toFixed(1) || '0.0';
    document.getElementById('depthValue').textContent = data.depth?.toFixed(1) || '0.0';
    
    // Update acceleration values
    document.getElementById('accelX').textContent = data.acceleration?.x?.toFixed(3) || '0.000';
    document.getElementById('accelY').textContent = data.acceleration?.y?.toFixed(3) || '0.000';
    document.getElementById('accelZ').textContent = data.acceleration?.z?.toFixed(3) || '0.000';
    
    // Update location info
    document.getElementById('latitude').textContent = data.location?.lat?.toFixed(6) || '--';
    document.getElementById('longitude').textContent = data.location?.lon?.toFixed(6) || '--';
    
    // Jika Anda ingin menampilkan satelit (data dummy, karena tidak ada di DB)
    // document.getElementById('satellites').textContent = data.location?.satellites || '--';
    
    // Update data quality
    document.getElementById('dataQuality').textContent = (data.quality || 0) + '%';
    
    // Update pump status
    const pumpElement = document.getElementById('pumpStatus');
    if (data.pump_state) {
        pumpElement.textContent = 'ON';
        pumpElement.className = 'pump-status on';
    } else {
        pumpElement.textContent = 'OFF';
        pumpElement.className = 'pump-status off';
    }
    
    // Update timestamp
    updateTimestamp();
}

/**
 * Menyimpan data ke array untuk digunakan oleh grafik.
 * Kode ini diambil dari cuplikan Anda dan sudah benar.
 */
function storeData(data) {
    const timestamp = new Date().toLocaleTimeString('id-ID');
    
    // Tambah data baru
    historicalData.timestamps.push(timestamp);
    historicalData.speed.push(data.speed_cms || 0);
    historicalData.temperature.push(data.temperature || 0);
    historicalData.dissolvedOxygen.push(data.dissolved_oxygen || 0);
    historicalData.pressure.push(data.pressure || 0);
    historicalData.depth.push(data.depth || 0);
    historicalData.accelX.push(data.acceleration?.x || 0);
    historicalData.accelY.push(data.acceleration?.y || 0);
    historicalData.accelZ.push(data.acceleration?.z || 0);
    
    // Batasi jumlah titik data
    if (historicalData.timestamps.length > MAX_DATA_POINTS) {
        Object.keys(historicalData).forEach(key => {
            historicalData[key].shift();
        });
    }
}


// =================================================================
// BAGIAN 4: FUNGSI UNTUK GRAFIK, PETA, & BANTUAN
// (Tempelkan kode Anda untuk fungsi-fungsi ini di sini)
// =================================================================

function initializeCharts() {
    console.log("Inisialisasi Chart...");
    try {
        // --- Grafik Kecepatan (Speed) ---
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

        // --- Grafik Suhu (Temperature) ---
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

        // --- Grafik Akselerasi (Acceleration) ---
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
        
        // **Tambahkan inisialisasi untuk grafik lain (DO, Pressure) jika ada**

    } catch (e) {
        console.error("Error initializing charts. Pastikan ID elemen <canvas> sudah benar.", e);
    }
}

/**
 * Memperbarui data di semua grafik dan me-render ulang.
 * Fungsi ini dipanggil setiap kali ada data baru.
 */
function updateCharts() {
    console.log("Memperbarui Chart...");
    try {
        // Update data untuk semua chart
        const allCharts = [speedChart, tempChart, accelChart]; // Tambahkan variabel chart lain ke array ini
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
        
        // Render ulang semua chart
        allCharts.forEach(chart => {
            if (chart) {
                chart.update('none'); // 'none' untuk animasi yang lebih mulus
            }
        });

    } catch (e) {
        console.error("Error updating charts:", e);
    }
}

/**
 * Inisialisasi peta Leaflet saat halaman dimuat.
 */
function initializeMap() {
    console.log("Inisialisasi Peta...");
    try {
        // PENTING: Ganti 'mapContainer' dengan ID div peta Anda
        // Atur koordinat awal (contoh: tengah Indonesia) dan level zoom
        map = L.map('mapContainer').setView([-2.548926, 118.0148634], 5);

        // Tambahkan layer peta dari OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Buat marker awal (akan digerakkan nanti)
        marker = L.marker([-2.548926, 118.0148634]).addTo(map).bindPopup('Fish Location');
        
        // Buat garis untuk melacak jejak
        pathLine = L.polyline(pathCoordinates, {color: 'blue'}).addTo(map);

    } catch (e) {
        console.error("Error initializing map. Pastikan ada <div id='mapContainer'>.", e);
    }
}

/**
 * Memperbarui posisi marker dan jejak di peta.
 * Fungsi ini dipanggil setiap kali ada data baru.
 */
function updateMap(data) {
    console.log("Memperbarui Peta...");
    if (!map || !data.location || data.location.lat == null || data.location.lon == null) {
        return; // Jangan lakukan apa-apa jika peta belum siap atau data lokasi tidak ada
    }

    try {
        const newPosition = [data.location.lat, data.location.lon];
        
        // Perbarui posisi marker
        marker.setLatLng(newPosition);
        
        // Tambahkan koordinat baru ke jejak
        pathCoordinates.push(newPosition);
        
        // Gambar ulang garis jejak
        pathLine.setLatLngs(pathCoordinates);
        
        // Secara opsional, atur agar peta selalu mengikuti marker
        map.panTo(newPosition);

    } catch (e) {
        console.error("Error updating map:", e);
    }
}

/**
 * Memperbarui elemen timestamp di halaman.
 */
function updateTimestamp() {
    // PENTING: Ganti 'lastUpdatedValue' dengan ID elemen timestamp Anda
    const timestampElement = document.getElementById('lastUpdatedValue');
    if (timestampElement) {
        timestampElement.textContent = new Date().toLocaleString('id-ID', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }
}

/**
 * Fungsi bantuan untuk menampilkan notifikasi/alert.
 */
function showAlert(message, type = 'info') {
    // PENTING: Ganti 'alertBox' dengan ID elemen notifikasi Anda
    const alertElement = document.getElementById('alertBox');
    if (alertElement) {
        alertElement.textContent = message;
        alertElement.className = `alert ${type}`; // contoh class: 'alert success' atau 'alert error'
        alertElement.style.display = 'block';

        // Sembunyikan notifikasi setelah 5 detik
        setTimeout(() => {
            alertElement.style.display = 'none';
        }, 5000);
    }
}