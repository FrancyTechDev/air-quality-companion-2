import argparse
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score
import joblib
import psycopg2


def load_binned_series(db_path: Path | None = None, node: str | None = None) -> pd.DataFrame:
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        conn = psycopg2.connect(db_url, sslmode="require")
        query = "SELECT node, pm25, pm10, timestamp FROM sensor_data {where_clause} ORDER BY timestamp ASC"
        where_clause = ""
        params = []
        if node:
            where_clause = "WHERE node = %s"
            params = [node]
        with conn.cursor() as cur:
            cur.execute(query.format(where_clause=where_clause), params)
            rows = cur.fetchall()
        conn.close()
        df = pd.DataFrame(rows, columns=["node", "pm25", "pm10", "timestamp"])
    else:
        if not db_path:
            raise RuntimeError("DATABASE_URL non impostata e db_path mancante")
        conn = sqlite3.connect(db_path)
        query = "SELECT node, pm25, pm10, timestamp FROM sensor_data {where_clause} ORDER BY timestamp ASC"
        where_clause = ""
        params = []
        if node:
            where_clause = "WHERE node = ?"
            params = [node]
        df = pd.read_sql_query(query.format(where_clause=where_clause), conn, params=params)
        conn.close()

    if df.empty:
        return df

    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df["bucket"] = df["timestamp"].dt.floor("10min")

    binned = (
        df.groupby("bucket", as_index=False)[["pm25", "pm10"]]
        .mean()
        .sort_values("bucket")
    )
    return binned


def build_features(binned: pd.DataFrame, lags: int = 6) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    df = binned.copy()
    for i in range(1, lags + 1):
        df[f"pm25_lag_{i}"] = df["pm25"].shift(i)
        df[f"pm10_lag_{i}"] = df["pm10"].shift(i)

    df["hour_of_day"] = df["bucket"].dt.hour
    df["day_of_week"] = df["bucket"].dt.dayofweek

    df = df.dropna().reset_index(drop=True)
    feature_cols = [c for c in df.columns if c.startswith("pm25_lag_") or c.startswith("pm10_lag_")]
    feature_cols += ["hour_of_day", "day_of_week"]

    X = df[feature_cols]
    y_pm25 = df["pm25"]
    y_pm10 = df["pm10"]
    return X, y_pm25, y_pm10


def train(db_path: Path | None, output_dir: Path, node: str | None):
    binned = load_binned_series(db_path, node)
    if binned.empty:
        raise RuntimeError("Dati insufficienti.")

    X, y25, y10 = build_features(binned)
    if X.empty:
        raise RuntimeError("Dati insufficienti dopo il preprocessing.")

    if len(X) < 5:
        X_train, X_test, y25_train, y25_test = X, X, y25, y25
        y10_train, y10_test = y10, y10
    else:
        X_train, X_test, y25_train, y25_test = train_test_split(X, y25, test_size=0.2, random_state=42)
        _, _, y10_train, y10_test = train_test_split(X, y10, test_size=0.2, random_state=42)

    model25 = RandomForestRegressor(n_estimators=200, random_state=42)
    model10 = RandomForestRegressor(n_estimators=200, random_state=42)

    model25.fit(X_train, y25_train)
    model10.fit(X_train, y10_train)

    pred25 = model25.predict(X_test)
    pred10 = model10.predict(X_test)

    r2_25 = r2_score(y25_test, pred25)
    r2_10 = r2_score(y10_test, pred10)

    output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model_pm25": model25,
            "model_pm10": model10,
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "r2_pm25": r2_25,
            "r2_pm10": r2_10,
        },
        output_dir / "air_quality_model.joblib",
    )

    print(f"Saved model to {output_dir / 'air_quality_model.joblib'}")
    print(f"R2 pm25: {r2_25:.3f}, R2 pm10: {r2_10:.3f}")
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="../backend/data/air_quality.db")
    parser.add_argument("--out", default="./models")
    parser.add_argument("--node", default=None)
    args = parser.parse_args()

    db_path = Path(args.db) if args.db else None
    train(db_path, Path(args.out), args.node)





