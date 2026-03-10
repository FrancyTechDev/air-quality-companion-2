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
NEURO_THRESHOLD = 25.0
RECOVERY_HALFLIFE_H = 2.0

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
        return pd.DataFrame(columns=["pm25", "pm10", "timestamp"])
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
        return pd.DataFrame(columns=["pm25", "pm10", "timestamp"])

    df = pd.DataFrame(rows, columns=["pm25", "pm10", "timestamp"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    return df


def to_features(df: pd.DataFrame, lags: int = 6) -> pd.DataFrame:
    if df.empty or "timestamp" not in df.columns:
        return pd.DataFrame()
    d = df.copy()
    d["bucket"] = d["timestamp"].dt.floor("10min")
    hourly = (
        d.groupby("bucket", as_index=False)[["pm25", "pm10"]]
        .mean()
        .sort_values("bucket")
    )
    for i in range(1, lags + 1):
        hourly[f"pm25_lag_{i}"] = hourly["pm25"].shift(i)
        hourly[f"pm10_lag_{i}"] = hourly["pm10"].shift(i)
    hourly["hour_of_day"] = hourly["bucket"].dt.hour
    hourly["day_of_week"] = hourly["bucket"].dt.dayofweek
    hourly = hourly.dropna().reset_index(drop=True)
    return hourly


def simple_forecast(df: pd.DataFrame, horizon: list[int]) -> dict:
    if df.empty:
        return {h: None for h in horizon}
    recent = df.sort_values("timestamp").tail(30)
    base = float(recent["pm25"].iloc[-1])
    if len(recent) < 2:
        return {h: round(clamp(base, 5, 300), 1) for h in horizon}

    recent = recent.sort_values("timestamp").tail(10)
    x = (recent["timestamp"].astype("int64") / 1e9).values
    y = recent["pm25"].values
    slope_per_sec = (y[-1] - y[0]) / (x[-1] - x[0]) if x[-1] != x[0] else 0
    slope_per_hour = clamp(slope_per_sec * 3600, -30, 30)

    preds = {}
    for h in horizon:
        preds[h] = round(clamp(base + slope_per_hour * h, 5, 300), 1)
    return postprocess_forecast(preds, df)


def load_model_bundle() -> dict | None:
    if not MODEL_PATH.exists():
        return None
    return joblib.load(MODEL_PATH)


def model_forecast(df: pd.DataFrame) -> dict:
    if not MODEL_PATH.exists():
        return simple_forecast(df, HORIZON)
    hourly = to_features(df, LAGS)
    if hourly.empty:
        return simple_forecast(df, HORIZON)
    if len(hourly) < LAGS:
        return simple_forecast(df, HORIZON)
    bundle = load_model_bundle()
    if not bundle:
        return simple_forecast(df, HORIZON)
    if bundle.get("r2_pm25") is not None and bundle.get("r2_pm25", 0) < 0:
        return simple_forecast(df, HORIZON)
    model = bundle["model_pm25"]

    preds = {}
    last = hourly.copy()
    for h in [1, 2, 3, 4, 5]:
        row = {}
        for i in range(1, LAGS + 1):
            row[f"pm25_lag_{i}"] = last.iloc[-i]["pm25"]
            row[f"pm10_lag_{i}"] = last.iloc[-i]["pm10"]
        future_hour = last.iloc[-1]["bucket"] + pd.Timedelta(hours=h)
        row["hour_of_day"] = future_hour.hour
        row["day_of_week"] = future_hour.dayofweek
        X = pd.DataFrame([row])
        p = float(model.predict(X)[0])
        preds[h] = round(clamp(p, 5, 300), 1)

        next_hour = last.iloc[-1]["bucket"] + pd.Timedelta(hours=1)
        last = pd.concat(
            [
                last,
                pd.DataFrame(
                    [{"bucket": next_hour, "pm25": p, "pm10": last.iloc[-1]["pm10"]}]
                ),
            ],
            ignore_index=True,
        )

    return postprocess_forecast(preds, df)


def model_forecast_pm10(df: pd.DataFrame) -> dict:
    if not MODEL_PATH.exists():
        return {}
    hourly = to_features(df, LAGS)
    if hourly.empty:
        return {}
    bundle = load_model_bundle()
    if not bundle:
        return {}
    if bundle.get("r2_pm10") is not None and bundle.get("r2_pm10", 0) < 0:
        return {}
    model = bundle.get("model_pm10")
    if model is None:
        return {}

    preds = {}
    last = hourly.copy()
    for h in [1, 2, 3, 4, 5]:
        row = {}
        for i in range(1, LAGS + 1):
            row[f"pm25_lag_{i}"] = last.iloc[-i]["pm25"]
            row[f"pm10_lag_{i}"] = last.iloc[-i]["pm10"]
        future_hour = last.iloc[-1]["bucket"] + pd.Timedelta(hours=h)
        row["hour_of_day"] = future_hour.hour
        row["day_of_week"] = future_hour.dayofweek
        X = pd.DataFrame([row])
        p = float(model.predict(X)[0])
        preds[h] = round(clamp(p, 5, 500), 1)

        next_hour = last.iloc[-1]["bucket"] + pd.Timedelta(hours=1)
        last = pd.concat(
            [
                last,
                pd.DataFrame(
                    [{"bucket": next_hour, "pm25": last.iloc[-1]["pm25"], "pm10": p}]
                ),
            ],
            ignore_index=True,
        )

    return preds


def postprocess_forecast(preds: dict, df: pd.DataFrame) -> dict:
    if df.empty:
        return preds
    recent = df.sort_values("timestamp").tail(180)
    if recent.empty:
        return preds
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


def recovery_metrics(df: pd.DataFrame) -> dict:
    if df.empty:
        return {
            "recovery_index": 0.0,
            "time_since_peak_h": None,
            "time_since_above_threshold_h": None,
            "recovery_stage": "stable",
            "fatigue_score": 0.0,
        }

    df = df.sort_values("timestamp")
    recent = df.tail(360)
    now = recent["timestamp"].iloc[-1]

    above = recent[recent["pm25"] > NEURO_THRESHOLD]
    if above.empty:
        return {
            "recovery_index": 10.0,
            "time_since_peak_h": None,
            "time_since_above_threshold_h": None,
            "recovery_stage": "recovered",
            "fatigue_score": 0.0,
        }

    last_above_time = above["timestamp"].iloc[-1]
    time_since_above_h = (now - last_above_time).total_seconds() / 3600.0
    peak_idx = recent["pm25"].idxmax()
    peak_time = recent.loc[peak_idx, "timestamp"]
    time_since_peak_h = (now - peak_time).total_seconds() / 3600.0

    # Exponential decay for recovery (higher = worse, decays with time)
    recovery_index = 100.0 * pow(0.5, time_since_above_h / RECOVERY_HALFLIFE_H)

    # Fatigue score: integrate above-threshold area with decay
    fatigue = 0.0
    for i in range(1, len(recent)):
        t0 = recent["timestamp"].iloc[i - 1]
        t1 = recent["timestamp"].iloc[i]
        dt_h = (t1 - t0).total_seconds() / 3600.0
        if dt_h <= 0:
            continue
        v = max(0.0, recent["pm25"].iloc[i - 1] - NEURO_THRESHOLD)
        age_h = (now - t0).total_seconds() / 3600.0
        decay = pow(0.5, age_h / RECOVERY_HALFLIFE_H)
        fatigue += v * dt_h * decay

    if recovery_index > 70:
        stage = "acute"
    elif recovery_index > 35:
        stage = "recovering"
    else:
        stage = "stable"

    return {
        "recovery_index": round(recovery_index, 1),
        "time_since_peak_h": round(time_since_peak_h, 2),
        "time_since_above_threshold_h": round(time_since_above_h, 2),
        "recovery_stage": stage,
        "fatigue_score": round(fatigue, 2),
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


def source_classifier_ml(df: pd.DataFrame) -> dict:
    bundle = load_model_bundle()
    if not bundle or not bundle.get("model_source"):
        return source_classifier(df)
    if df.empty:
        return {"label": "unknown", "confidence": 0.0}

    recent = df.sort_values("timestamp").tail(6)
    if len(recent) < 2:
        return source_classifier(df)
    recent["bucket"] = recent["timestamp"].dt.floor("10min")
    recent = recent.groupby("bucket", as_index=False)[["pm25", "pm10"]].mean().sort_values("bucket")
    if len(recent) < 2:
        return source_classifier(df)

    t0 = recent["bucket"].iloc[0]
    t1 = recent["bucket"].iloc[-1]
    duration_min = max((t1 - t0).total_seconds() / 60.0, 1)
    pm25_last = float(recent["pm25"].iloc[-1])
    pm10_last = float(recent["pm10"].iloc[-1])
    ratio = pm25_last / pm10_last if pm10_last > 0 else 0
    delta = pm25_last - float(recent["pm25"].iloc[0])
    trend = (delta / duration_min) * 60.0
    volatility = float(recent["pm25"].std()) if len(recent) > 1 else 0.0
    avg_pm25 = float(recent["pm25"].mean())
    avg_pm10 = float(recent["pm10"].mean())
    max_pm25 = float(recent["pm25"].max())
    min_pm25 = float(recent["pm25"].min())
    spike = max_pm25 - avg_pm25

    X = pd.DataFrame(
        [
            {
                "pm25_last": pm25_last,
                "pm10_last": pm10_last,
                "ratio": ratio,
                "delta": delta,
                "trend": trend,
                "volatility": volatility,
                "avg_pm25": avg_pm25,
                "avg_pm10": avg_pm10,
                "max_pm25": max_pm25,
                "min_pm25": min_pm25,
                "spike": spike,
                "duration_min": duration_min,
            }
        ]
    )
    model = bundle["model_source"]
    proba = model.predict_proba(X)[0]
    classes = bundle.get("source_classes", model.classes_)
    best_idx = int(proba.argmax())
    label = classes[best_idx]
    # Never return "unknown" when ML model is available
    if label == "unknown":
        label = "background_elevation"
    return {"label": label, "confidence": round(float(proba[best_idx]), 2)}


def vulnerability_ml(df: pd.DataFrame) -> dict:
    bundle = load_model_bundle()
    if not bundle or not bundle.get("model_vulnerability") or df.empty:
        return {"score": 0.0, "level": "low"}

    recent = df.sort_values("timestamp").tail(6)
    if len(recent) < 2:
        return {"score": 0.0, "level": "low"}
    recent["bucket"] = recent["timestamp"].dt.floor("10min")
    recent = recent.groupby("bucket", as_index=False)[["pm25", "pm10"]].mean().sort_values("bucket")
    if len(recent) < 2:
        return {"score": 0.0, "level": "low"}

    t0 = recent["bucket"].iloc[0]
    t1 = recent["bucket"].iloc[-1]
    duration_min = max((t1 - t0).total_seconds() / 60.0, 1)
    pm25_last = float(recent["pm25"].iloc[-1])
    pm10_last = float(recent["pm10"].iloc[-1])
    ratio = pm25_last / pm10_last if pm10_last > 0 else 0
    delta = pm25_last - float(recent["pm25"].iloc[0])
    trend = (delta / duration_min) * 60.0
    volatility = float(recent["pm25"].std()) if len(recent) > 1 else 0.0
    avg_pm25 = float(recent["pm25"].mean())
    avg_pm10 = float(recent["pm10"].mean())
    max_pm25 = float(recent["pm25"].max())
    min_pm25 = float(recent["pm25"].min())
    spike = max_pm25 - avg_pm25

    X = pd.DataFrame(
        [
            {
                "pm25_last": pm25_last,
                "pm10_last": pm10_last,
                "ratio": ratio,
                "delta": delta,
                "trend": trend,
                "volatility": volatility,
                "avg_pm25": avg_pm25,
                "avg_pm10": avg_pm10,
                "max_pm25": max_pm25,
                "min_pm25": min_pm25,
                "spike": spike,
                "duration_min": duration_min,
            }
        ]
    )
    model = bundle["model_vulnerability"]
    score = float(model.predict(X)[0])
    score = round(clamp(score, 0.0, 100.0), 1)
    if score >= 70:
        level = "high"
    elif score >= 40:
        level = "moderate"
    else:
        level = "low"
    return {"score": score, "level": level}


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
    recovery = recovery_metrics(df)
    vulnerability = vulnerability_ml(df)

    prob = 0.0
    forecast_max = max([v for v in forecast.values() if v is not None] or [0])
    threshold = adaptive["adaptive_threshold"]
    if forecast_max > threshold:
        prob = min(1.0, (forecast_max - threshold) / max(threshold, 1))

    ess = calc_ess(realtime, exposure, forecast)
    source = source_classifier_ml(df)

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
        "recovery": recovery,
        "ess": ess,
        "source": source,
        "vulnerability": vulnerability,
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
    forecast_pm10 = model_forecast_pm10(df)
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
                forecast_pm10.get(h)
                if forecast_pm10.get(h) is not None
                else (forecast.get(h) or simple_forecast(df).get(h) or 0) / max(ratio, 0.1),
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
