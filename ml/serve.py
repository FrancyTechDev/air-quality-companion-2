from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
from pathlib import Path
import pandas as pd
import joblib
import math

DB_PATH = Path("../backend/data/air_quality.db")
MODEL_PATH = Path("./models/air_quality_model.joblib")
LAGS = 6
HORIZON = 5

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_hourly_series(node: str | None = None) -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    where_clause = ""
    params = []
    if node:
        where_clause = "WHERE node = ?"
        params = [node]
    query = f"""
        SELECT node, pm25, pm10, timestamp
        FROM sensor_data
        {where_clause}
        ORDER BY timestamp ASC
    """
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    if df.empty:
        return df
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df["hour"] = df["timestamp"].dt.floor("H")
    hourly = (
        df.groupby("hour", as_index=False)[["pm25", "pm10"]]
        .mean()
        .sort_values("hour")
    )
    return hourly


def make_feature_row(hourly: pd.DataFrame, step_offset: int) -> pd.DataFrame:
    last = hourly.copy()
    last["hour_of_day"] = last["hour"].dt.hour
    last["day_of_week"] = last["hour"].dt.dayofweek
    row = {}
    for i in range(1, LAGS + 1):
        row[f"pm25_lag_{i}"] = last.iloc[-i]["pm25"]
        row[f"pm10_lag_{i}"] = last.iloc[-i]["pm10"]
    future_hour = last.iloc[-1]["hour"] + pd.Timedelta(hours=step_offset)
    row["hour_of_day"] = future_hour.hour
    row["day_of_week"] = future_hour.dayofweek
    return pd.DataFrame([row])


@app.get("/predict")
def predict(node: str | None = None):
    if not MODEL_PATH.exists():
        return {
            "pm25Predictions": [],
            "pm10Predictions": [],
            "trend": "stable",
            "confidence": 0,
            "message": "Model not trained yet",
        }

    hourly = load_hourly_series(node)
    if hourly.empty or len(hourly) < LAGS + 2:
        return {
            "pm25Predictions": [],
            "pm10Predictions": [],
            "trend": "stable",
            "confidence": 0,
            "message": "Not enough data",
        }

    bundle = joblib.load(MODEL_PATH)
    model25 = bundle["model_pm25"]
    model10 = bundle["model_pm10"]
    r2_25 = bundle.get("r2_pm25", 0)
    r2_10 = bundle.get("r2_pm10", 0)

    pm25_preds = []
    pm10_preds = []

    temp = hourly.copy()
    for step in range(1, HORIZON + 1):
        X = make_feature_row(temp, step)
        p25 = float(model25.predict(X)[0])
        p10 = float(model10.predict(X)[0])
        pm25_preds.append({"hour": step, "value": round(p25, 1)})
        pm10_preds.append({"hour": step, "value": round(p10, 1)})

        next_hour = temp.iloc[-1]["hour"] + pd.Timedelta(hours=1)
        temp = pd.concat(
            [temp, pd.DataFrame([{"hour": next_hour, "pm25": p25, "pm10": p10}])],
            ignore_index=True,
        )

    slope = pm25_preds[-1]["value"] - pm25_preds[0]["value"]
    if slope > 1:
        trend = "worsening"
    elif slope < -1:
        trend = "improving"
    else:
        trend = "stable"

    confidence = int(max(50, min(95, 70 + (r2_25 + r2_10) * 10)))

    return {
        "pm25Predictions": pm25_preds,
        "pm10Predictions": pm10_preds,
        "trend": trend,
        "confidence": confidence,
    }
