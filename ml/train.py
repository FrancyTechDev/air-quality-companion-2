import argparse
import sqlite3
from datetime import datetime, timezone
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score
import joblib
from pathlib import Path


def load_hourly_series(db_path: Path, node: str | None = None) -> pd.DataFrame:
    conn = sqlite3.connect(db_path)
    query = """
        SELECT node, pm25, pm10, timestamp
        FROM sensor_data
        {where_clause}
        ORDER BY timestamp ASC
    """
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
    df["hour"] = df["timestamp"].dt.floor("H")

    hourly = (
        df.groupby("hour", as_index=False)[["pm25", "pm10"]]
        .mean()
        .sort_values("hour")
    )
    return hourly


def build_features(hourly: pd.DataFrame, lags: int = 6) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    df = hourly.copy()
    for i in range(1, lags + 1):
        df[f"pm25_lag_{i}"] = df["pm25"].shift(i)
        df[f"pm10_lag_{i}"] = df["pm10"].shift(i)

    df["hour_of_day"] = df["hour"].dt.hour
    df["day_of_week"] = df["hour"].dt.dayofweek

    df = df.dropna().reset_index(drop=True)
    feature_cols = [c for c in df.columns if c.startswith("pm25_lag_") or c.startswith("pm10_lag_")]
    feature_cols += ["hour_of_day", "day_of_week"]

    X = df[feature_cols]
    y_pm25 = df["pm25"]
    y_pm10 = df["pm10"]
    return X, y_pm25, y_pm10


def train(db_path: Path, output_dir: Path, node: str | None):
    hourly = load_hourly_series(db_path, node)
    if hourly.empty or len(hourly) < 50:
        raise RuntimeError("Dati insufficienti. Serve almeno ~50 ore di dati.")

    X, y25, y10 = build_features(hourly)
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

    train(Path(args.db), Path(args.out), args.node)
