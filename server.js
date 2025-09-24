// server.js (Versi Final)

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mqtt = require('mqtt');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- KONFIGURASI ---
const dbConnection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'hiupaus_data' // Ganti ini
});

const mqttClient = mqtt.connect('mqtt://broker.hivemq.com');
const MQTT_TOPIC = 'fish/data/#'; // Ganti ini jika perlu

// --- KONEKSI ---
dbConnection.connect(err => {
    if (err) {
        console.error('❌ Error connecting to MySQL:', err.stack);
        return;
    }
    console.log('✅ Connected to MySQL database.');
});

mqttClient.on('connect', () => {
    console.log('✅ Connected to MQTT broker.');
    mqttClient.subscribe(MQTT_TOPIC, (err) => {
        if (!err) console.log(`Subscribed to topic: '${MQTT_TOPIC}'`);
    });
});

// --- LOGIKA INTI ---
mqttClient.on('message', (topic, message) => {
    try {
        const flatData = JSON.parse(message.toString());
        console.log(`📥 Flat data received from MQTT:`, flatData);

        const sql = `INSERT INTO fish_monitoring (device_id, speed_cms, temperature, dissolved_oxygen, pressure, depth, latitude, longitude, accel_x, accel_y, accel_z, quality, pump_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const values = [flatData.device_id, flatData.speed_cms, flatData.temperature, flatData.dissolved_oxygen, flatData.pressure, flatData.depth, flatData.latitude, flatData.longitude, flatData.accel_x, flatData.accel_y, flatData.accel_z, flatData.quality, flatData.pump_state];

        dbConnection.query(sql, values, (error, results) => {
            if (error) {
                console.error('❌ Failed to insert data into MySQL:', error);
                return;
            }
            console.log('💾 Data saved to MySQL, ID:', results.insertId);
            
            // PENTING: Transformasi data ke format yang diinginkan frontend
            const nestedData = {
                device_id: flatData.device_id,
                timestamp: flatData.timestamp,
                speed_cms: flatData.speed_cms,
                temperature: flatData.temperature,
                dissolved_oxygen: flatData.dissolved_oxygen,
                pressure: flatData.pressure,
                depth: flatData.depth,
                quality: flatData.quality,
                pump_state: flatData.pump_state,
                location: { lat: flatData.latitude, lon: flatData.longitude },
                acceleration: { x: flatData.accel_x, y: flatData.accel_y, z: flatData.accel_z }
            };
            
            io.emit('data', nestedData); 
            console.log('📡 Forwarded NESTED data to web clients:', nestedData);
        });

    } catch (e) {
        console.error('Error processing message:', e);
    }
});

// --- SAJIKAN FRONTEND ---
app.use(express.static(path.join(__dirname, 'public')));

// Rute ini secara eksplisit mengirimkan dashboard.html saat halaman utama diminta
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- JALANKAN SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});