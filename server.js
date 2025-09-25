// server.js (Versi Final - Perbaikan mqttClient)

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mqtt = require('mqtt');
const { Client } = require('pg'); // Gunakan Client dari pg
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- KONFIGURASI ---
const dbClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// --- BAGIAN YANG DIPERBAIKI ---
// 1. Impor library mqtt
// (Pastikan ini ada di atas)

// 2. Buat koneksi ke MQTT dan simpan di variabel mqttClient
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com');
const MQTT_TOPIC = 'fish/monitor/data'; // Sesuaikan jika perlu
// --- AKHIR BAGIAN PERBAIKAN ---


// --- KONEKSI ---
dbClient.connect((err) => { // Tambahkan callback error untuk debugging
    if (err) {
        console.error('❌ Error connecting to PostgreSQL:', err.stack);
        return;
    }
    console.log('✅ Connected to PostgreSQL database.');
});

// 3. Sekarang baru gunakan mqttClient
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

        const sql = `INSERT INTO fish_monitoring (device_id, speed_cms, temperature, dissolved_oxygen, pressure, depth, latitude, longitude, accel_x, accel_y, accel_z, quality, pump_state) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`;
        const values = [flatData.device_id, flatData.speed_cms, flatData.temperature, flatData.dissolved_oxygen, flatData.pressure, flatData.depth, flatData.latitude, flatData.longitude, flatData.accel_x, flatData.accel_y, flatData.accel_z, flatData.quality, flatData.pump_state];

        dbClient.query(sql, values, (error, results) => {
            if (error) {
                console.error('❌ Failed to insert data into PostgreSQL:', error);
                return;
            }
            console.log('💾 Data saved to PostgreSQL');
            
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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- JALANKAN SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});