import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Server as SocketIO } from "socket.io";
import http from "http";
import { Pool } from "pg";

// Fix __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server, {
  cors: {
    origin: "*",
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend static
app.use(express.static(path.join(__dirname, "../dist")));

// ====================== STORAGE DATI ======================
let sensorDataHistory = []; // cache in memoria per la UI realtime

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sensor_data (
      id SERIAL PRIMARY KEY,
      node TEXT NOT NULL,
      pm25 REAL NOT NULL,
      pm10 REAL NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      timestamp BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON sensor_data(timestamp);
    CREATE INDEX IF NOT EXISTS idx_sensor_data_node ON sensor_data(node);
  `);
};

// ====================== SOCKET.IO ======================
io.on("connection", (socket) => {
  console.log("Nuovo client connesso:", socket.id);

  socket.on("ping", () => {
    socket.emit("pong", { msg: "Pong dal server!" });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnesso:", socket.id);
  });
});

// ====================== API ======================

// Endpoint per ricevere dati dal nodo ESP32
app.post("/data", async (req, res) => {
  const { node, pm25, pm10, lat, lon, timestamp } = req.body;

  if (!node || pm25 === undefined || pm10 === undefined || !lat || !lon) {
    return res.status(400).json({ error: "Dati mancanti" });
  }

  const entry = { node, pm25, pm10, lat, lon, timestamp: timestamp || Date.now() };
  sensorDataHistory.push(entry);

  // Limita la memoria a 1000 campioni
  if (sensorDataHistory.length > 1000) sensorDataHistory.shift();

  console.log("Dati ricevuti:", entry);

  // Invia dati ai client connessi via socket
  io.emit("new-data", entry);

  // Salvataggio su Postgres
  try {
    await pool.query(
      "INSERT INTO sensor_data (node, pm25, pm10, lat, lon, timestamp) VALUES ($1, $2, $3, $4, $5, $6)",
      [entry.node, entry.pm25, entry.pm10, entry.lat, entry.lon, entry.timestamp]
    );
  } catch (err) {
    console.error("Errore salvataggio Postgres:", err.message);
  }

  res.json({ status: "OK" });
});

// Endpoint per leggere lo storico
app.get("/data", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "1000", 10), 5000);
  const node = req.query.node;

  try {
    if (node) {
      const { rows } = await pool.query(
        "SELECT node, pm25, pm10, lat, lon, timestamp FROM sensor_data WHERE node = $1 ORDER BY timestamp DESC LIMIT $2",
        [node, limit]
      );
      return res.json(rows.reverse());
    }

    const { rows } = await pool.query(
      "SELECT node, pm25, pm10, lat, lon, timestamp FROM sensor_data ORDER BY timestamp DESC LIMIT $1",
      [limit]
    );
    return res.json(rows.reverse());
  } catch (err) {
    console.error("Errore lettura Postgres:", err.message);
    return res.status(500).json({ error: "Errore lettura dati" });
  }
});

// Test endpoint
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello dal backend!" });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"), (err) => {
    if (err) res.status(500).send(err);
  });
});

// Porta dinamica
const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Backend in ascolto su http://localhost:${PORT}`);
      console.log("Postgres: connected");
    });
  })
  .catch((err) => {
    console.error("Errore init DB:", err);
    process.exit(1);
  });
