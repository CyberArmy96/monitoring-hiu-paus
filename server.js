// ============================================
// DEPENDENCIES
// ============================================
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mqtt = require('mqtt');
const { Client } = require('pg');
const path = require('path');
require('dotenv').config();

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    mqtt: {
        broker: process.env.MQTT_BROKER || 'b8ae5c3ad3484c4fa485c54ae6eb8ca2.s1.eu.hivemq.cloud',
        topic: process.env.MQTT_TOPIC || 'monitor/hiu-paus/data',
        options: {
            username: process.env.MQTT_USERNAME || undefined,
            password: process.env.MQTT_PASSWORD || undefined,
            clientId: `server_${Math.random().toString(16).substr(2, 8)}`
        }
    },
    database: {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    },
    server: {
        port: process.env.PORT || 3000
    }
};

// ============================================
// INITIALIZATION
// ============================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const dbClient = new Client(CONFIG.database);
const mqttClient = mqtt.connect(CONFIG.mqtt.broker, CONFIG.mqtt.options);

// ============================================
// DATABASE CONNECTION
// ============================================
async function connectDatabase() {
    try {
        await dbClient.connect();
        console.log('✅ Connected to PostgreSQL database');
        await initializeDatabase();
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        setTimeout(connectDatabase, 5000);
    }
}

async function initializeDatabase() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS fish_monitoring (
            id SERIAL PRIMARY KEY,
            device_id VARCHAR(50),
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            speed_cms REAL,
            temperature REAL,
            dissolved_oxygen REAL,
            pressure REAL,
            depth REAL,
            latitude DECIMAL(10, 8),
            longitude DECIMAL(11, 8),
            accel_x REAL,
            accel_y REAL,
            accel_z REAL,
            gyro_x REAL,
            gyro_y REAL,
            gyro_z REAL,
            satellites INTEGER,
            quality INTEGER,
            pump_state BOOLEAN,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    try {
        await dbClient.query(createTableQuery);
        console.log('✅ Database table ready');
    } catch (error) {
        console.error('❌ Table creation error:', error);
    }
}

// ============================================
// MQTT CONNECTION
// ============================================
mqttClient.on('connect', () => {
    console.log('✅ Connected to MQTT broker');
    
    mqttClient.subscribe(CONFIG.mqtt.topic, (error) => {
        if (error) {
            console.error('❌ MQTT subscription failed:', error);
        } else {
            console.log(`📡 Subscribed to: ${CONFIG.mqtt.topic}`);
        }
    });

    mqttClient.subscribe(`${CONFIG.mqtt.topic}/command`, (error) => {
        if (!error) {
            console.log(`📡 Subscribed to command topic`);
        }
    });
});

mqttClient.on('error', (error) => {
    console.error('❌ MQTT error:', error);
});

mqttClient.on('reconnect', () => {
    console.log('🔄 Reconnecting to MQTT broker...');
});

mqttClient.on('message', async (topic, message) => {
    if (topic.includes('command')) {
        handleCommand(message);
    } else {
        await processData(message);
    }
});

// ============================================
// DATA PROCESSING
// ============================================
async function processData(message) {
    try {
        const data = JSON.parse(message.toString());
        console.log('📥 Data received from ESP32');

        const processedData = transformData(data);
        
        await saveToDatabase(processedData);
        
        broadcastToClients(processedData);
        
        checkAlerts(processedData);
        
    } catch (error) {
        console.error('❌ Data processing error:', error);
    }
}

function transformData(rawData) {
    return {
        device_id: rawData.device_id || 'FISH_MON_001',
        timestamp: rawData.timestamp || Date.now() / 1000,
        speed_cms: parseFloat(rawData.speed_cms) || 0,
        temperature: parseFloat(rawData.temperature) || 0,
        dissolved_oxygen: parseFloat(rawData.dissolved_oxygen) || 0,
        pressure: parseFloat(rawData.pressure) || 0,
        depth: parseFloat(rawData.depth) || 0,
        location: {
            lat: parseFloat(rawData.latitude) || parseFloat(rawData.location?.lat) || 0,
            lon: parseFloat(rawData.longitude) || parseFloat(rawData.location?.lon) || 0,
            satellites: parseInt(rawData.gps_satellites) || parseInt(rawData.location?.satellites) || 0
        },
        acceleration: {
            x: parseFloat(rawData.accel_x) || parseFloat(rawData.acceleration?.x) || 0,
            y: parseFloat(rawData.accel_y) || parseFloat(rawData.acceleration?.y) || 0,
            z: parseFloat(rawData.accel_z) || parseFloat(rawData.acceleration?.z) || 0
        },
        gyroscope: {
            x: parseFloat(rawData.gyro_x) || parseFloat(rawData.gyroscope?.x) || 0,
            y: parseFloat(rawData.gyro_y) || parseFloat(rawData.gyroscope?.y) || 0,
            z: parseFloat(rawData.gyro_z) || parseFloat(rawData.gyroscope?.z) || 0
        },
        quality: parseInt(rawData.quality) || parseInt(rawData.data_quality) || 0,
        pump_state: Boolean(rawData.pump_state)
    };
}

async function saveToDatabase(data) {
    const query = `
        INSERT INTO fish_monitoring (
            device_id, speed_cms, temperature, dissolved_oxygen, 
            pressure, depth, latitude, longitude, 
            accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z,
            satellites, quality, pump_state
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id
    `;

    const values = [
        data.device_id,
        data.speed_cms,
        data.temperature,
        data.dissolved_oxygen,
        data.pressure,
        data.depth,
        data.location.lat,
        data.location.lon,
        data.acceleration.x,
        data.acceleration.y,
        data.acceleration.z,
        data.gyroscope.x,
        data.gyroscope.y,
        data.gyroscope.z,
        data.location.satellites,
        data.quality,
        data.pump_state
    ];

    try {
        const result = await dbClient.query(query, values);
        console.log(`💾 Saved to DB with ID: ${result.rows[0].id}`);
    } catch (error) {
        console.error('❌ Database save error:', error);
    }
}

function broadcastToClients(data) {
    io.emit('data', data);
    console.log(`📡 Broadcasted to ${io.engine.clientsCount} clients`);
}

// ============================================
// ALERT SYSTEM
// ============================================
function checkAlerts(data) {
    const alerts = [];

    if (data.temperature < 20 || data.temperature > 32) {
        alerts.push({
            type: 'temperature',
            level: 'warning',
            message: `Temperature alert: ${data.temperature}°C`,
            value: data.temperature
        });
    }

    if (data.dissolved_oxygen < 4) {
        alerts.push({
            type: 'oxygen',
            level: 'danger',
            message: `Low oxygen: ${data.dissolved_oxygen} mg/L`,
            value: data.dissolved_oxygen
        });
    }

    if (Math.abs(data.pressure + 20) > 5) {
        alerts.push({
            type: 'pressure',
            level: 'warning',
            message: `Pressure anomaly: ${data.pressure} kPa`,
            value: data.pressure
        });
    }

    if (data.depth > 25) {
        alerts.push({
            type: 'depth',
            level: 'warning',
            message: `Deep dive: ${data.depth} m`,
            value: data.depth
        });
    }

    if (alerts.length > 0) {
        io.emit('alerts', alerts);
        logAlerts(alerts, data.device_id);
    }
}

async function logAlerts(alerts, deviceId) {
    for (const alert of alerts) {
        const query = `
            INSERT INTO alerts (device_id, type, level, message, value)
            VALUES ($1, $2, $3, $4, $5)
        `;
        
        try {
            await dbClient.query(query, [
                deviceId,
                alert.type,
                alert.level,
                alert.message,
                alert.value
            ]);
        } catch (error) {
            console.error('Alert logging error:', error);
        }
    }
}

// ============================================
// COMMAND HANDLING
// ============================================
function handleCommand(message) {
    try {
        const command = JSON.parse(message.toString());
        console.log('📝 Command received:', command);

        switch (command.type) {
            case 'emergency_release':
                handleEmergencyRelease();
                break;
            case 'pump_control':
                handlePumpControl(command.state);
                break;
            case 'calibrate':
                handleCalibration(command.sensor, command.value);
                break;
            default:
                console.log('Unknown command:', command.type);
        }
    } catch (error) {
        console.error('Command processing error:', error);
    }
}

function handleEmergencyRelease() {
    const command = {
        command: 'emergency_release',
        timestamp: Date.now()
    };
    
    mqttClient.publish('fish/monitor/command', JSON.stringify(command));
    io.emit('emergency_activated', true);
    console.log('⚠️ Emergency release activated');
}

function handlePumpControl(state) {
    const command = {
        command: state ? 'pump_on' : 'pump_off',
        timestamp: Date.now()
    };
    
    mqttClient.publish('fish/monitor/command', JSON.stringify(command));
    console.log(`💧 Pump ${state ? 'ON' : 'OFF'} command sent`);
}

function handleCalibration(sensor, value) {
    const command = {
        command: 'calibrate',
        sensor: sensor,
        value: value,
        timestamp: Date.now()
    };
    
    mqttClient.publish('fish/monitor/command', JSON.stringify(command));
    console.log(`🔧 Calibration command sent for ${sensor}`);
}

// ============================================
// WEB SOCKET CONNECTION
// ============================================
io.on('connection', (socket) => {
    console.log(`👤 Client connected: ${socket.id}`);

    socket.emit('welcome', {
        message: 'Connected to Fish Monitoring Server',
        timestamp: Date.now()
    });

    socket.on('get_history', async (params) => {
        const history = await getHistoricalData(params);
        socket.emit('history', history);
    });

    socket.on('command', (cmd) => {
        handleCommand(JSON.stringify(cmd));
    });

    socket.on('disconnect', () => {
        console.log(`👤 Client disconnected: ${socket.id}`);
    });
});

// ============================================
// API ENDPOINTS
// ============================================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        mqtt: mqttClient.connected,
        database: dbClient._connected || false,
        clients: io.engine.clientsCount,
        uptime: process.uptime()
    });
});

app.get('/api/data/latest', async (req, res) => {
    try {
        const query = `
            SELECT * FROM fish_monitoring 
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        const result = await dbClient.query(query);
        res.json(result.rows[0] || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/data/history', async (req, res) => {
    const { limit = 100, offset = 0, device_id } = req.query;
    
    try {
        let query = `
            SELECT * FROM fish_monitoring 
            ${device_id ? 'WHERE device_id = $3' : ''}
            ORDER BY created_at DESC 
            LIMIT $1 OFFSET $2
        `;
        
        const params = device_id 
            ? [limit, offset, device_id]
            : [limit, offset];
            
        const result = await dbClient.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/data/statistics', async (req, res) => {
    const { device_id, hours = 24 } = req.query;
    
    try {
        const query = `
            SELECT 
                AVG(speed_cms) as avg_speed,
                MAX(speed_cms) as max_speed,
                MIN(speed_cms) as min_speed,
                AVG(temperature) as avg_temp,
                AVG(dissolved_oxygen) as avg_do,
                AVG(depth) as avg_depth,
                COUNT(*) as data_points
            FROM fish_monitoring
            WHERE created_at > NOW() - INTERVAL '${hours} hours'
            ${device_id ? `AND device_id = '${device_id}'` : ''}
        `;
        
        const result = await dbClient.query(query);
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================
async function getHistoricalData(params = {}) {
    const { limit = 50, device_id } = params;
    
    try {
        const query = `
            SELECT * FROM fish_monitoring
            ${device_id ? 'WHERE device_id = $2' : ''}
            ORDER BY created_at DESC
            LIMIT $1
        `;
        
        const values = device_id ? [limit, device_id] : [limit];
        const result = await dbClient.query(query, values);
        
        return result.rows.reverse();
    } catch (error) {
        console.error('History fetch error:', error);
        return [];
    }
}

// ============================================
// SERVER STARTUP
// ============================================
async function startServer() {
    await connectDatabase();
    
    server.listen(CONFIG.server.port, () => {
        console.log(`🚀 Server running on port ${CONFIG.server.port}`);
        console.log(`📊 Dashboard: http://localhost:${CONFIG.server.port}`);
    });
}

// ============================================
// ERROR HANDLING
// ============================================
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing connections...');
    mqttClient.end();
    await dbClient.end();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// ============================================
// START APPLICATION
// ============================================
startServer();