from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from pathlib import Path
import pandas as pd
import joblib
import psycopg2

DB_URL = os.getenv("DATABASE_URL")
MODEL_PATH = Path("./models/air_quality_model.joblib")
LAGS = 6
HORIZON = [1, 2, 3]
HORIZON_PRED = [1, 2, 3, 4, 5]
WHO_THRESHOLD = 15.0

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def load_recent_data(hours: int = 6, node: str | None = None) -> pd.DataFrame:
    if not DB_URL:
        return pd.DataFrame()
    conn = psycopg2.connect(DB_URL, sslmode="require")
    try:
        with conn.cursor() as cur:
            cutoff_ms = (
                int(pd.Timestamp.utcnow().timestamp() * 1000) - hours * 3600 * 1000
            )
            if node:
                cur.execute(
                    "SELECT pm25, pm10, timestamp FROM sensor_data WHERE node = %s AND timestamp >= %s ORDER BY timestamp ASC",
                    (node, cutoff_ms),
                )
            else:
                cur.execute(
                    "SELECT pm25, pm10, timestamp FROM sensor_data WHERE timestamp >= %s ORDER BY timestamp ASC",
                    (cutoff_ms,),
                )
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows, columns=["pm25", "pm10", "timestamp"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    return df


def to_features(df: pd.DataFrame, lags: int = 6) -> pd.DataFrame:
    d = df.copy()
    d["hour"] = d["timestamp"].dt.floor("H")
    hourly = (
        d.groupby("hour", as_index=False)[["pm25", "pm10"]].mean().sort_values("hour")
    )
    for i in range(1, lags + 1):
        hourly[f"pm25_lag_{i}"] = hourly["pm25"].shift(i)
        hourly[f"pm10_lag_{i}"] = hourly["pm10"].shift(i)
    hourly["hour_of_day"] = hourly["hour"].dt.hour
    hourly["day_of_week"] = hourly["hour"].dt.dayofweek
    hourly = hourly.dropna().reset_index(drop=True)
    return hourly


def simple_forecast(df: pd.DataFrame) -> dict:
    if df.empty:
        return {h: None for h in HORIZON}
    recent = df.sort_values("timestamp").tail(30)
    base = float(recent["pm25"].iloc[-1])
    if len(recent) < 2:
        return {h: round(clamp(base, 5, 300), 1) for h in HORIZON}

    recent = recent.sort_values("timestamp").tail(10)
    x = (recent["timestamp"].astype("int64") / 1e9).values
    y = recent["pm25"].values
    slope_per_sec = (y[-1] - y[0]) / (x[-1] - x[0]) if x[-1] != x[0] else 0
    slope_per_hour = clamp(slope_per_sec * 3600, -30, 30)

    preds = {}
    for h in HORIZON:
        preds[h] = round(clamp(base + slope_per_hour * h, 5, 300), 1)
    return postprocess_forecast(preds, df)\n

def model_forecast(df: pd.DataFrame) -> dict:
    if not MODEL_PATH.exists():
        return simple_forecast(df)
    hourly = to_features(df, LAGS)
    if hourly.empty:
        return simple_forecast(df)
    bundle = joblib.load(MODEL_PATH)
    model = bundle["model_pm25"]

    preds = {}
    last = hourly.copy()
    for h in HORIZON:
        row = {}
        for i in range(1, LAGS + 1):
            row[f"pm25_lag_{i}"] = last.iloc[-i]["pm25"]
            row[f"pm10_lag_{i}"] = last.iloc[-i]["pm10"]
        future_hour = last.iloc[-1]["hour"] + pd.Timedelta(hours=h)
        row["hour_of_day"] = future_hour.hour
        row["day_of_week"] = future_hour.dayofweek
        X = pd.DataFrame([row])
        p = float(model.predict(X)[0])
        preds[h] = round(clamp(p, 5, 300), 1)

        next_hour = last.iloc[-1]["hour"] + pd.Timedelta(hours=1)
        last = pd.concat(
            [
                last,
                pd.DataFrame(
                    [{"hour": next_hour, "pm25": p, "pm10": last.iloc[-1]["pm10"]}]
                ),
            ],
            ignore_index=True,
        )

    return postprocess_forecast(preds, df)\n


def postprocess_forecast(preds: dict, df: pd.DataFrame) -> dict:
    if df.empty:
        return postprocess_forecast(preds, df)\n    recent = df.sort_values("timestamp").tail(180)
    base = float(recent["pm25"].iloc[-1])
    q10 = float(recent["pm25"].quantile(0.1))
    q90 = float(recent["pm25"].quantile(0.9))
    lo = max(5.0, q10, base * 0.7)
    hi = max(80.0, q90 * 1.3, base * 1.5)
    cleaned = {}
    for h, v in preds.items():
        if v is None:
            cleaned[h] = None
        else:
            cleaned[h] = round(clamp(float(v), lo, hi), 1)
    return cleaned
def exposure_metrics(df: pd.DataFrame) -> dict:
    if df.empty or len(df) < 2:
        return {
            "exposure_1h": 0,
            "exposure_6h": 0,
            "exposure_24h": 0,
            "avg_1h": 0,
            "avg_6h": 0,
            "avg_24h": 0,
        }

    df = df.sort_values("timestamp")
    now = df["timestamp"].iloc[-1]
    cutoff_1h = now - pd.Timedelta(hours=1)
    cutoff_6h = now - pd.Timedelta(hours=6)
    cutoff_24h = now - pd.Timedelta(hours=24)

    def integrate(sub: pd.DataFrame) -> tuple[float, float]:
        if len(sub) < 2:
            return 0.0, 0.0
        sub = sub.sort_values("timestamp")
        total = 0.0
        duration = 0.0
        for i in range(1, len(sub)):
            t0 = sub["timestamp"].iloc[i - 1]
            t1 = sub["timestamp"].iloc[i]
            dt_h = (t1 - t0).total_seconds() / 3600.0
            if dt_h <= 0:
                continue
            total += sub["pm25"].iloc[i - 1] * dt_h
            duration += dt_h
        avg = (total / duration) if duration > 0 else 0.0
        return total, avg

    sub1 = df[df["timestamp"] >= cutoff_1h]
    sub6 = df[df["timestamp"] >= cutoff_6h]
    sub24 = df[df["timestamp"] >= cutoff_24h]
    exp1, avg1 = integrate(sub1)
    exp6, avg6 = integrate(sub6)
    exp24, avg24 = integrate(sub24)
    return {
        "exposure_1h": exp1,
        "exposure_6h": exp6,
        "exposure_24h": exp24,
        "avg_1h": avg1,
        "avg_6h": avg6,
        "avg_24h": avg24,
    }


def moving_averages(df: pd.DataFrame) -> dict:
    if df.empty:
        return {"ma_5m": 0, "ma_15m": 0, "ma_60m": 0}
    df = df.sort_values("timestamp")
    now = df["timestamp"].iloc[-1]

    def avg_window(minutes: int) -> float:
        cutoff = now - pd.Timedelta(minutes=minutes)
        sub = df[df["timestamp"] >= cutoff]
        if sub.empty:
            return 0.0
        return float(sub["pm25"].mean())

    return {
        "ma_5m": avg_window(5),
        "ma_15m": avg_window(15),
        "ma_60m": avg_window(60),
    }


def adaptive_threshold(df: pd.DataFrame) -> dict:
    if df.empty:
        return {"adaptive_threshold": WHO_THRESHOLD, "method": "fallback"}
    recent = df.tail(360)
    q90 = float(recent["pm25"].quantile(0.9))
    mean = float(recent["pm25"].mean())
    std = float(recent["pm25"].std()) if len(recent) > 1 else 0
    adaptive = max(WHO_THRESHOLD, mean + std)
    return {
        "adaptive_threshold": round(max(adaptive, q90 * 0.9), 1),
        "method": "mean+std / q90",
    }


def data_quality(df: pd.DataFrame) -> dict:
    if df.empty:
        return {"samples": 0, "last_gap_s": None, "sample_rate_min": 0}
    df = df.sort_values("timestamp")
    samples = len(df)
    if samples < 2:
        return {"samples": samples, "last_gap_s": None, "sample_rate_min": 0}
    gaps = (df["timestamp"].iloc[1:].values - df["timestamp"].iloc[:-1].values) / 1e9
    last_gap = float(gaps[-1])
    duration_min = (
        df["timestamp"].iloc[-1] - df["timestamp"].iloc[0]
    ).total_seconds() / 60.0
    sample_rate = (samples - 1) / duration_min if duration_min > 0 else 0
    return {
        "samples": samples,
        "last_gap_s": round(last_gap, 1),
        "sample_rate_min": round(sample_rate, 2),
    }


def realtime_metrics(df: pd.DataFrame) -> dict:
    if df.empty:
        return {"pm25": 0, "pm10": 0, "ratio": 0, "trend": 0, "volatility": 0}
    recent = df.tail(60)
    pm25 = float(recent["pm25"].iloc[-1])
    pm10 = float(recent["pm10"].iloc[-1])
    ratio = pm25 / pm10 if pm10 > 0 else 0

    if len(recent) >= 2:
        x = (recent["timestamp"].astype("int64") / 1e9).values
        y = recent["pm25"].values
        slope = (y[-1] - y[0]) / (x[-1] - x[0]) if x[-1] != x[0] else 0
        trend = slope * 3600
    else:
        trend = 0

    volatility = float(recent["pm25"].std()) if len(recent) > 1 else 0

    return {
        "pm25": pm25,
        "pm10": pm10,
        "ratio": ratio,
        "trend": trend,
        "volatility": volatility,
    }


def source_classifier(df: pd.DataFrame) -> dict:
    if df.empty:
        return {"label": "unknown", "confidence": 0.0}

    recent = df.tail(30)
    ratio = (
        (recent["pm25"].iloc[-1] / recent["pm10"].iloc[-1])
        if recent["pm10"].iloc[-1] > 0
        else 0
    )
    delta = recent["pm25"].iloc[-1] - recent["pm25"].iloc[0]
    duration_min = (
        recent["timestamp"].iloc[-1] - recent["timestamp"].iloc[0]
    ).total_seconds() / 60

    if ratio > 0.8 and delta > 5:
        return {"label": "combustion_dominant", "confidence": 0.75}
    if ratio < 0.5 and recent["pm10"].iloc[-1] > recent["pm25"].iloc[-1] * 1.8:
        return {"label": "coarse_particle", "confidence": 0.7}
    if delta > 8 and duration_min < 30:
        return {"label": "indoor_activity", "confidence": 0.6}
    if delta < 5 and duration_min > 60:
        return {"label": "background_elevation", "confidence": 0.55}
    if delta > 12 and duration_min < 10:
        return {"label": "anomalous_spike", "confidence": 0.7}

    return {"label": "unknown", "confidence": 0.4}


def calc_ess(realtime: dict, exposure: dict, forecast: dict) -> float:
    current_score = min(realtime["pm25"] / 150.0, 1.0) * 100
    exposure_score = min(exposure["avg_6h"] / 75.0, 1.0) * 100
    trend_score = min(abs(realtime["trend"]) / 20.0, 1.0) * 100
    forecast_max = max([v for v in forecast.values() if v is not None] or [0])
    forecast_score = min(forecast_max / 150.0, 1.0) * 100
    ess = (
        0.3 * current_score
        + 0.3 * exposure_score
        + 0.2 * trend_score
        + 0.2 * forecast_score
    )
    return round(ess, 1)


def advisory(ess: float, forecast: dict, prob: float) -> list[str]:
    advice = []
    forecast_max = max([v for v in forecast.values() if v is not None] or [0])

    if ess >= 80 or prob > 0.7:
        advice.append(
            "Limitare attività fisica intensa all’aperto nelle prossime 2 ore."
        )
        advice.append("Ridurre la durata di esposizione se necessario uscire.")
        advice.append("Monitorare l’andamento nelle prossime 2 ore.")
    elif ess >= 60:
        advice.append("Evitare zone trafficate nelle prossime 2 ore.")
        advice.append("Preferire attività indoor o in aree meno inquinate.")
    elif ess >= 30:
        advice.append(
            "Condizioni moderate: pianificare attività outdoor in fasce più favorevoli."
        )
    else:
        advice.append("Condizioni stabili: nessuna azione specifica necessaria.")

    if forecast_max > WHO_THRESHOLD:
        advice.append("Possibile superamento soglia OMS nelle prossime ore.")

    return advice


@app.get("/ai/insights")
def ai_insights(node: str | None = None, hours: int = 24):
    df = load_recent_data(hours=hours, node=node)
    realtime = realtime_metrics(df)
    exposure = exposure_metrics(df)
    forecast = model_forecast(df)
    ma = moving_averages(df)
    adaptive = adaptive_threshold(df)
    quality = data_quality(df)

    prob = 0.0
    forecast_max = max([v for v in forecast.values() if v is not None] or [0])
    threshold = adaptive["adaptive_threshold"]
    if forecast_max > threshold:
        prob = min(1.0, (forecast_max - threshold) / max(threshold, 1))

    ess = calc_ess(realtime, exposure, forecast)
    source = source_classifier(df)

    return {
        "realtime": realtime,
        "forecast": {
            "h1": forecast.get(1),
            "h2": forecast.get(2),
            "h3": forecast.get(3),
            "prob_over_threshold": round(prob, 2),
            "threshold": threshold,
        },
        "exposure": exposure,
        "moving_averages": ma,
        "adaptive_threshold": adaptive,
        "data_quality": quality,
        "ess": ess,
        "source": source,
        "advisory": advisory(ess, forecast, prob),
    }


@app.get("/ai/debug")
def ai_debug():
    if not DB_URL:
        return {"db": "missing", "count": 0, "latest_timestamp": None}
    conn = psycopg2.connect(DB_URL, sslmode="require")
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM sensor_data")
            count = cur.fetchone()[0]
            cur.execute("SELECT MAX(timestamp) FROM sensor_data")
            latest = cur.fetchone()[0]
    finally:
        conn.close()
    return {"db": "ok", "count": int(count), "latest_timestamp": latest}


@app.get("/predict")
def predict(node: str | None = None):
    df = load_recent_data(hours=6, node=node)
    forecast = model_forecast(df)
    ratio = 1.0
    if not df.empty and float(df["pm10"].iloc[-1]) > 0:
        ratio = float(df["pm25"].iloc[-1]) / float(df["pm10"].iloc[-1])

    pm25_preds = [
        {"hour": h, "value": forecast.get(h) or simple_forecast(df).get(h)}
        for h in HORIZON_PRED
    ]
    pm10_preds = [
        {
            "hour": h,
            "value": round(
                (
                    (forecast.get(h) or simple_forecast(df).get(h) or 0)
                    / max(ratio, 0.1)
                ),
                1,
            ),
        }
        for h in HORIZON_PRED
    ]

    return {
        "pm25Predictions": pm25_preds,
        "pm10Predictions": pm10_preds,
        "trend": "stable",
        "confidence": 80,
    }

