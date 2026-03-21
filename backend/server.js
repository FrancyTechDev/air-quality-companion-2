import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Server as SocketIO } from "socket.io";
import http from "http";
import { Pool } from "pg";
import multer from "multer";
import aiRouter from "./ai.js";

// Fix __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env only if dotenv is available (optional in production)
const loadEnv = async () => {
  try {
    const dotenv = await import("dotenv");
    dotenv.config({ path: path.join(__dirname, ".env") });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("dotenv not installed; skipping .env load");
    }
  }
};
loadEnv();

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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

// ====================== AI CHATBOT ======================
app.use("/ai", aiRouter);

// ====================== AI CORRELAZIONE CSV ======================
const normalizeLines = (text) =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

const detectDelimiter = (headerLine) => {
  const candidates = [",", ";", "\t"];
  const counts = candidates.map((delim) => ({
    delim,
    count: headerLine.split(delim).length - 1,
  }));
  counts.sort((a, b) => b.count - a.count);
  return counts[0].count > 0 ? counts[0].delim : ",";
};

const parseCsvLine = (line, delimiter) => {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current.trim());
  return fields;
};

const parseCsvText = (text) => {
  const lines = normalizeLines(text);
  if (lines.length === 0) {
    return { headers: [], rows: [], delimiter: "," };
  }
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(lines[i], delimiter);
    if (fields.every((f) => f.trim() === "")) continue;
    const row = {};
    headers.forEach((header, index) => {
      row[header] = fields[index]?.trim() ?? "";
    });
    rows.push(row);
  }
  return { headers, rows, delimiter };
};

const toNumber = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
};

const parseEpoch = (value) => {
  const num = toNumber(value);
  if (num === null) return null;
  if (num > 1e12) return Math.round(num);
  if (num > 1e9) return Math.round(num * 1000);
  return null;
};

const parseDate = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseTimestamp = (value) => parseEpoch(value) ?? parseDate(value);

const detectNumericColumns = (headers, rows) =>
  headers.filter((header) => {
    let numeric = 0;
    let total = 0;
    rows.forEach((row) => {
      const value = row[header];
      if (value === undefined || value === "") return;
      total += 1;
      if (toNumber(value) !== null) numeric += 1;
    });
    return total > 0 && numeric / total >= 0.7;
  });

const detectTimeColumns = (headers, rows) =>
  headers.filter((header) => {
    const lower = header.toLowerCase();
    const looksLikeTime =
      lower.includes("time") ||
      lower.includes("timestamp") ||
      lower.includes("date") ||
      lower.includes("epoch");
    if (!looksLikeTime) return false;
    let valid = 0;
    let total = 0;
    rows.slice(0, 50).forEach((row) => {
      const value = row[header];
      if (!value) return;
      total += 1;
      if (parseTimestamp(value) !== null) valid += 1;
    });
    return total > 0 && valid / total >= 0.6;
  });

const pearson = (x, y) => {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { r: NaN, n };
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i += 1) {
    const xi = x[i];
    const yi = y[i];
    sumX += xi;
    sumY += yi;
    sumXX += xi * xi;
    sumYY += yi * yi;
    sumXY += xi * yi;
  }
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  return { r: denominator === 0 ? NaN : numerator / denominator, n };
};

const buildMatches = (sensorRows, braceletRows, sensorTime, braceletTime, toleranceMs) => {
  if (!sensorTime || !braceletTime) {
    const min = Math.min(sensorRows.length, braceletRows.length);
    return Array.from({ length: min }, (_, idx) => ({
      sensor: sensorRows[idx],
      bracelet: braceletRows[idx],
    }));
  }

  const sensor = sensorRows
    .map((row) => ({ row, t: parseTimestamp(row[sensorTime] ?? "") }))
    .filter((item) => item.t !== null)
    .sort((a, b) => a.t - b.t);
  const bracelet = braceletRows
    .map((row) => ({ row, t: parseTimestamp(row[braceletTime] ?? "") }))
    .filter((item) => item.t !== null)
    .sort((a, b) => a.t - b.t);

  const matches = [];
  let j = 0;
  const tolerance = toleranceMs ?? 5 * 60 * 1000;

  for (let i = 0; i < sensor.length; i += 1) {
    const target = sensor[i];
    while (j < bracelet.length - 1 && bracelet[j + 1].t <= target.t) {
      j += 1;
    }
    const candidates = [bracelet[j], bracelet[j + 1]].filter(Boolean);
    let best = null;
    let bestDiff = Infinity;
    candidates.forEach((cand) => {
      const diff = Math.abs(cand.t - target.t);
      if (diff < bestDiff) {
        best = cand;
        bestDiff = diff;
      }
    });
    if (best && bestDiff <= tolerance) {
      matches.push({ sensor: target.row, bracelet: best.row });
    }
  }
  return matches;
};

const extractSeries = (matches, sensorMetric, braceletMetric) => {
  const x = [];
  const y = [];
  matches.forEach(({ sensor, bracelet }) => {
    const xVal = toNumber(sensor[sensorMetric]);
    const yVal = toNumber(bracelet[braceletMetric]);
    if (xVal !== null && yVal !== null) {
      x.push(xVal);
      y.push(yVal);
    }
  });
  return { x, y };
};

app.post(
  "/ai/correlation",
  upload.fields([
    { name: "sensorCsv", maxCount: 1 },
    { name: "braceletCsv", maxCount: 1 },
  ]),
  (req, res) => {
    try {
      const sensorFile = req.files?.sensorCsv?.[0];
      const braceletFile = req.files?.braceletCsv?.[0];
      if (!sensorFile || !braceletFile) {
        return res.status(400).json({ error: "CSV mancanti" });
      }

      const sensorText = sensorFile.buffer.toString("utf-8");
      const braceletText = braceletFile.buffer.toString("utf-8");
      const sensorParsed = parseCsvText(sensorText);
      const braceletParsed = parseCsvText(braceletText);

      const sensorNumeric = detectNumericColumns(sensorParsed.headers, sensorParsed.rows);
      const braceletNumeric = detectNumericColumns(braceletParsed.headers, braceletParsed.rows);
      const sensorTimeColumns = detectTimeColumns(sensorParsed.headers, sensorParsed.rows);
      const braceletTimeColumns = detectTimeColumns(braceletParsed.headers, braceletParsed.rows);

      const sensorTime = req.body.sensorTime || sensorTimeColumns[0] || "";
      const braceletTime = req.body.braceletTime || braceletTimeColumns[0] || "";
      const toleranceMinutes = Math.max(1, Number(req.body.toleranceMinutes || 5));

      const sensorMetrics = req.body.sensorMetrics
        ? JSON.parse(req.body.sensorMetrics)
        : sensorNumeric.filter((col) => col.toLowerCase().includes("pm"));
      const braceletMetrics = req.body.braceletMetrics
        ? JSON.parse(req.body.braceletMetrics)
        : braceletNumeric;

      const matches = buildMatches(
        sensorParsed.rows,
        braceletParsed.rows,
        sensorTime || undefined,
        braceletTime || undefined,
        toleranceMinutes * 60 * 1000
      );

      const results = [];
      sensorMetrics.forEach((sensorMetric) => {
        braceletMetrics.forEach((braceletMetric) => {
          const { x, y } = extractSeries(matches, sensorMetric, braceletMetric);
          const { r, n } = pearson(x, y);
          results.push({ sensorMetric, braceletMetric, r, n });
        });
      });
      results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
      const summary = results[0] || null;

      return res.json({
        summary,
        results,
        meta: {
          matched: matches.length,
          sensorRows: sensorParsed.rows.length,
          braceletRows: braceletParsed.rows.length,
          sensorTime,
          braceletTime,
        },
      });
    } catch (err) {
      console.error("Errore AI correlazione:", err);
      return res.status(500).json({ error: "Errore AI correlazione" });
    }
  }
);

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
