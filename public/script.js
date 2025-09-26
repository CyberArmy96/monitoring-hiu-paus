// ============================================
// KONFIGURASI GLOBAL
// ============================================
const CONFIG = {
    maxDataPoints: 50,
    mapDefaultLat: -7.797068,
    mapDefaultLon: 110.370529,
    mapDefaultZoom: 13,
    updateInterval: 10000,
    chartTension: 0.4
};

// ============================================
// STATE MANAGEMENT
// ============================================
let state = {
    connected: false,
    mqttClient: null,
    charts: {
        speed: null,
        temperature: null,
        dissolvedOxygen: null,
        pressure: null,
        acceleration: null
    },
    map: {
        instance: null,
        marker: null,
        pathLine: null,
        coordinates: []
    },
    data: {
        timestamps: [],
        speed: [],
        temperature: [],
        dissolvedOxygen: [],
        pressure: [],
        depth: [],
        accelX: [],
        accelY: [],
        accelZ: []
    }
};

// ============================================
// MQTT CONFIGURATION
// ============================================
const MQTT_CONFIG = {
    broker: 'your-broker.hivemq.cloud',
    port: 8884,
    username: 'your-username',
    password: 'your-password',
    useSsl: true,
    topic: 'fish/monitor/data',
    clientId: 'web_' + Math.random().toString(16).substr(2, 8)
};

// ============================================
// INITIALIZATION
// ============================================
window.onload = function() {
    initializeSystem();
};

function initializeSystem() {
    initializeCharts();
    initializeMap();
    initializeTable();
    connectMQTT();
    updateTimestamp();
    setupEventListeners();
}

// ============================================
// MQTT CONNECTION
// ============================================
function connectMQTT() {
    if (typeof Paho === 'undefined') {
        console.error('Paho MQTT library not loaded');
        setTimeout(connectMQTT, 2000);
        return;
    }

    try {
        state.mqttClient = new Paho.MQTT.Client(
            MQTT_CONFIG.broker,
            MQTT_CONFIG.port,
            MQTT_CONFIG.clientId
        );

        state.mqttClient.onConnectionLost = onConnectionLost;
        state.mqttClient.onMessageArrived = onMessageArrived;

        const options = {
            timeout: 3,
            onSuccess: onConnect,
            onFailure: onConnectFailure,
            useSSL: MQTT_CONFIG.useSsl,
            userName: MQTT_CONFIG.username,
            password: MQTT_CONFIG.password
        };

        state.mqttClient.connect(options);
    } catch (error) {
        console.error('MQTT connection error:', error);
        updateConnectionStatus(false);
    }
}

function onConnect() {
    state.connected = true;
    updateConnectionStatus(true);
    state.mqttClient.subscribe(MQTT_CONFIG.topic);
    console.log('Connected to MQTT broker');
}

function onConnectFailure(error) {
    state.connected = false;
    updateConnectionStatus(false);
    console.error('MQTT connection failed:', error);
    setTimeout(connectMQTT, 5000);
}

function onConnectionLost(responseObject) {
    state.connected = false;
    updateConnectionStatus(false);
    if (responseObject.errorCode !== 0) {
        console.error('Connection lost:', responseObject.errorMessage);
    }
    setTimeout(connectMQTT, 3000);
}

function onMessageArrived(message) {
    try {
        const data = JSON.parse(message.payloadString);
        processIncomingData(data);
    } catch (error) {
        console.error('Error processing message:', error);
    }
}

// ============================================
// DATA PROCESSING
// ============================================
function processIncomingData(data) {
    updateDashboard(data);
    storeData(data);
    updateCharts();
    updateMap(data);
    updateTable(data);
    checkAlerts(data);
}

function storeData(data) {
    const timestamp = new Date().toLocaleTimeString('id-ID');
    
    state.data.timestamps.push(timestamp);
    state.data.speed.push(data.speed_cms || 0);
    state.data.temperature.push(data.temperature || 0);
    state.data.dissolvedOxygen.push(data.dissolved_oxygen || 0);
    state.data.pressure.push(data.pressure || 0);
    state.data.depth.push(data.depth || 0);
    state.data.accelX.push(data.acceleration?.x || 0);
    state.data.accelY.push(data.acceleration?.y || 0);
    state.data.accelZ.push(data.acceleration?.z || 0);

    if (state.data.timestamps.length > CONFIG.maxDataPoints) {
        Object.keys(state.data).forEach(key => {
            state.data[key].shift();
        });
    }
}

// ============================================
// UI UPDATES
// ============================================
function updateDashboard(data) {
    const updates = {
        'deviceId': data.device_id || 'FISH_MON_001',
        'speedValue': formatNumber(data.speed_cms, 1),
        'tempValue': formatNumber(data.temperature, 1),
        'doValue': formatNumber(data.dissolved_oxygen, 1),
        'pressureValue': formatNumber(data.pressure, 1),
        'depthValue': formatNumber(data.depth, 1),
        'accelX': formatNumber(data.acceleration?.x, 3),
        'accelY': formatNumber(data.acceleration?.y, 3),
        'accelZ': formatNumber(data.acceleration?.z, 3),
        'latitude': formatNumber(data.location?.lat, 6),
        'longitude': formatNumber(data.location?.lon, 6),
        'satellites': data.location?.satellites || '--',
        'dataQuality': (data.quality || 0) + '%'
    };

    Object.keys(updates).forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = updates[id];
    });

    updatePumpStatus(data.pump_state);
    updateTimestamp();
}

function updatePumpStatus(isOn) {
    const element = document.getElementById('pumpStatus');
    if (element) {
        element.textContent = isOn ? 'ON' : 'OFF';
        element.className = isOn ? 'pump-status on' : 'pump-status off';
    }
}

function updateConnectionStatus(isConnected) {
    const statusElement = document.getElementById('connectionStatus');
    const textElement = document.getElementById('connectionText');
    
    if (statusElement) {
        statusElement.classList.toggle('connected', isConnected);
    }
    
    if (textElement) {
        textElement.textContent = isConnected ? 'Connected' : 'Disconnected';
        textElement.style.color = isConnected ? '#27ae60' : '#e74c3c';
    }
}

function updateTimestamp() {
    const element = document.getElementById('lastUpdate');
    if (element) {
        element.textContent = new Date().toLocaleTimeString('id-ID');
    }
}

// ============================================
// CHARTS
// ============================================
function initializeCharts() {
    const chartConfig = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 750 },
        scales: {
            x: { display: true, grid: { display: false }},
            y: { display: true, grid: { color: 'rgba(0,0,0,0.05)' }}
        },
        plugins: { legend: { display: false }}
    };

    state.charts.speed = createChart('speedChart', '#667eea', 'Speed (cm/s)', chartConfig);
    state.charts.temperature = createChart('tempChart', '#f5576c', 'Temperature (°C)', chartConfig);
    state.charts.dissolvedOxygen = createChart('doChart', '#00f2fe', 'DO (mg/L)', chartConfig);
    state.charts.pressure = createChart('pressureChart', '#fa709a', 'Pressure (kPa)', chartConfig);
    
    state.charts.acceleration = createAccelerationChart('accelChart', chartConfig);
}

function createChart(elementId, color, label, config) {
    const element = document.getElementById(elementId);
    if (!element) return null;

    return new Chart(element, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: color,
                backgroundColor: color + '20',
                borderWidth: 2,
                tension: CONFIG.chartTension,
                fill: true
            }]
        },
        options: {
            ...config,
            scales: {
                ...config.scales,
                y: {
                    ...config.scales.y,
                    title: { display: true, text: label }
                }
            }
        }
    });
}

function createAccelerationChart(elementId, config) {
    const element = document.getElementById(elementId);
    if (!element) return null;

    return new Chart(element, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'X-Axis', data: [], borderColor: '#e74c3c', borderWidth: 2, tension: CONFIG.chartTension },
                { label: 'Y-Axis', data: [], borderColor: '#27ae60', borderWidth: 2, tension: CONFIG.chartTension },
                { label: 'Z-Axis', data: [], borderColor: '#3498db', borderWidth: 2, tension: CONFIG.chartTension }
            ]
        },
        options: {
            ...config,
            plugins: { ...config.plugins, legend: { display: false, position: 'bottom' }},
            scales: {
                ...config.scales,
                y: {
                    ...config.scales.y,
                    title: { display: true, text: 'Acceleration (g)' }
                }
            }
        }
    });
}

function updateCharts() {
    if (state.charts.speed) {
        state.charts.speed.data.labels = state.data.timestamps;
        state.charts.speed.data.datasets[0].data = state.data.speed;
        state.charts.speed.update('none');
    }

    if (state.charts.temperature) {
        state.charts.temperature.data.labels = state.data.timestamps;
        state.charts.temperature.data.datasets[0].data = state.data.temperature;
        state.charts.temperature.update('none');
    }

    if (state.charts.dissolvedOxygen) {
        state.charts.dissolvedOxygen.data.labels = state.data.timestamps;
        state.charts.dissolvedOxygen.data.datasets[0].data = state.data.dissolvedOxygen;
        state.charts.dissolvedOxygen.update('none');
    }

    if (state.charts.pressure) {
        state.charts.pressure.data.labels = state.data.timestamps;
        state.charts.pressure.data.datasets[0].data = state.data.pressure;
        state.charts.pressure.update('none');
    }

    if (state.charts.acceleration) {
        state.charts.acceleration.data.labels = state.data.timestamps;
        state.charts.acceleration.data.datasets[0].data = state.data.accelX;
        state.charts.acceleration.data.datasets[1].data = state.data.accelY;
        state.charts.acceleration.data.datasets[2].data = state.data.accelZ;
        state.charts.acceleration.update('none');
    }
}

// ============================================
// MAP
// ============================================
function initializeMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    state.map.instance = L.map('map').setView(
        [CONFIG.mapDefaultLat, CONFIG.mapDefaultLon],
        CONFIG.mapDefaultZoom
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(state.map.instance);

    state.map.pathLine = L.polyline([], {
        color: '#667eea',
        weight: 3,
        opacity: 0.7
    }).addTo(state.map.instance);
}

function updateMap(data) {
    if (!state.map.instance || !data.location?.lat || !data.location?.lon) return;

    const position = [data.location.lat, data.location.lon];

    if (state.map.marker) {
        state.map.marker.setLatLng(position);
    } else {
        state.map.marker = L.marker(position, {
            icon: L.divIcon({
                className: 'custom-marker',
                html: '🐟',
                iconSize: [30, 30]
            })
        }).addTo(state.map.instance);
    }

    state.map.coordinates.push(position);
    if (state.map.coordinates.length > 100) {
        state.map.coordinates.shift();
    }

    state.map.pathLine.setLatLngs(state.map.coordinates);

    if (state.map.coordinates.length === 1) {
        state.map.instance.setView(position, CONFIG.mapDefaultZoom);
    }
}

// ============================================
// TABLE
// ============================================
function initializeTable() {
    const tableBody = document.getElementById('dataTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    for (let i = 0; i < 10; i++) {
        const row = tableBody.insertRow();
        row.classList.add('empty-row');
        for (let j = 0; j < 7; j++) {
            const cell = row.insertCell();
            cell.textContent = '--';
            cell.classList.add('empty-cell');
        }
    }
}

function updateTable(data) {
    const tableBody = document.getElementById('dataTableBody');
    if (!tableBody) return;

    const newRow = tableBody.insertRow(0);
    newRow.classList.add('new-data-row');

    const cells = [
        new Date().toLocaleTimeString('id-ID'),
        formatNumber(data.speed_cms, 1),
        formatNumber(data.temperature, 1),
        formatNumber(data.dissolved_oxygen, 1),
        formatNumber(data.pressure, 1),
        formatNumber(data.depth, 1),
        (data.quality || 0) + '%'
    ];

    cells.forEach(value => {
        const cell = newRow.insertCell();
        cell.textContent = value;
    });

    if (tableBody.rows.length > 10) {
        tableBody.deleteRow(10);
    }

    setTimeout(() => newRow.classList.remove('new-data-row'), 1000);
}

// ============================================
// ALERTS
// ============================================
function checkAlerts(data) {
    const alerts = [];

    if (data.temperature && (data.temperature < 20 || data.temperature > 32)) {
        alerts.push({ message: `Temperature warning: ${data.temperature.toFixed(1)}°C`, type: 'warning' });
    }

    if (data.dissolved_oxygen && data.dissolved_oxygen < 4) {
        alerts.push({ message: `Low oxygen: ${data.dissolved_oxygen.toFixed(1)} mg/L`, type: 'danger' });
    }

    if (data.pressure && Math.abs(data.pressure + 20) > 5) {
        alerts.push({ message: `Abnormal pressure: ${data.pressure.toFixed(1)} kPa`, type: 'warning' });
    }

    if (data.depth && data.depth > 25) {
        alerts.push({ message: `Deep dive: ${data.depth.toFixed(1)} m`, type: 'warning' });
    }

    alerts.forEach(alert => showAlert(alert.message, alert.type));
}

function showAlert(message, type = 'info') {
    const container = document.getElementById('alertsContainer');
    if (!container) return;

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;

    container.insertBefore(alert, container.firstChild);

    while (container.children.length > 3) {
        container.removeChild(container.lastChild);
    }

    setTimeout(() => {
        if (alert.parentNode) {
            alert.parentNode.removeChild(alert);
        }
    }, 5000);
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    const reconnectBtn = document.getElementById('reconnectBtn');
    if (reconnectBtn) {
        reconnectBtn.addEventListener('click', () => {
            connectMQTT();
        });
    }

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportData);
    }

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearData);
    }

    const emergencyBtn = document.getElementById('emergencyBtn');
    if (emergencyBtn) {
        emergencyBtn.addEventListener('click', emergencyRelease);
    }
}

// ============================================
// CONTROL FUNCTIONS
// ============================================
function exportData() {
    let csv = 'Timestamp,Speed(cm/s),Temperature(°C),DO(mg/L),Pressure(kPa),Depth(m),AccelX(g),AccelY(g),AccelZ(g)\n';

    for (let i = 0; i < state.data.timestamps.length; i++) {
        csv += [
            state.data.timestamps[i],
            state.data.speed[i],
            state.data.temperature[i],
            state.data.dissolvedOxygen[i],
            state.data.pressure[i],
            state.data.depth[i],
            state.data.accelX[i],
            state.data.accelY[i],
            state.data.accelZ[i]
        ].join(',') + '\n';
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monitoring_hiu_paus${new Date().toISOString()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    showAlert('Data exported successfully', 'success');
}

function clearData() {
    Object.keys(state.data).forEach(key => {
        state.data[key] = [];
    });

    updateCharts();
    
    state.map.coordinates = [];
    if (state.map.pathLine) {
        state.map.pathLine.setLatLngs([]);
    }

    showAlert('Data cleared', 'success');
}

function emergencyRelease() {
    if (!confirm('Trigger emergency release?')) return;

    if (state.mqttClient && state.connected) {
        const message = new Paho.MQTT.Message(JSON.stringify({
            command: 'emergency_release',
            timestamp: Date.now()
        }));
        message.destinationName = 'fish/monitor/command';
        state.mqttClient.send(message);
        
        showAlert('Emergency release triggered!', 'danger');
    } else {
        showAlert('Not connected to system', 'danger');
    }
}

// ============================================
// UTILITIES
// ============================================
function formatNumber(value, decimals) {
    if (value === null || value === undefined) return '--';
    return Number(value).toFixed(decimals);
}

// ============================================
// DEMO MODE (Development Only)
// ============================================
function generateDemoData() {
    return {
        device_id: "Adinda_Putri",
        timestamp: Date.now() / 1000,
        temperature: 25 + Math.random() * 5,
        dissolved_oxygen: 6 + Math.random() * 3,
        pressure: -20 + (Math.random() - 0.5) * 4,
        depth: Math.random() * 10,
        speed_cms: 20 + Math.random() * 40,
        location: {
            lat: CONFIG.mapDefaultLat + (Math.random() - 0.5) * 0.01,
            lon: CONFIG.mapDefaultLon + (Math.random() - 0.5) * 0.01,
            satellites: Math.floor(5 + Math.random() * 5)
        },
        acceleration: {
            x: (Math.random() - 0.5) * 0.5,
            y: (Math.random() - 0.5) * 0.5,
            z: 0.98 + (Math.random() - 0.5) * 0.1
        },
        quality: Math.floor(70 + Math.random() * 30),
        pump_state: Math.random() > 0.7
    };
}

function startDemoMode() {
    console.log('Demo mode active');
    showAlert('Demo mode - Simulated data', 'info');
    
    setInterval(() => {
        const data = generateDemoData();
        processIncomingData(data);
    }, 2000);
}