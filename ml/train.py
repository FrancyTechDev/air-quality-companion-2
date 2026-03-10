import argparse
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor, RandomForestClassifier
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

    df["pm25_roll_3"] = df["pm25"].shift(1).rolling(3).mean()
    df["pm25_roll_6"] = df["pm25"].shift(1).rolling(6).mean()
    df["pm25_std_6"] = df["pm25"].shift(1).rolling(6).std()
    df["pm10_roll_3"] = df["pm10"].shift(1).rolling(3).mean()
    df["pm10_roll_6"] = df["pm10"].shift(1).rolling(6).mean()
    df["pm10_std_6"] = df["pm10"].shift(1).rolling(6).std()
    df["pm25_diff_1"] = df["pm25"].diff()
    df["pm10_diff_1"] = df["pm10"].diff()

    df["hour_of_day"] = df["bucket"].dt.hour
    df["day_of_week"] = df["bucket"].dt.dayofweek

    df = df.dropna().reset_index(drop=True)
    feature_cols = [c for c in df.columns if c.startswith("pm25_lag_") or c.startswith("pm10_lag_")]
    feature_cols += [
        "pm25_roll_3",
        "pm25_roll_6",
        "pm25_std_6",
        "pm10_roll_3",
        "pm10_roll_6",
        "pm10_std_6",
        "pm25_diff_1",
        "pm10_diff_1",
        "hour_of_day",
        "day_of_week",
    ]

    X = df[feature_cols]
    y_pm25 = df["pm25"]
    y_pm10 = df["pm10"]
    return X, y_pm25, y_pm10


def label_source(ratio: float, delta: float, duration_min: float, pm25: float, pm10: float) -> str:
    if ratio > 0.8 and delta > 5:
        return "combustion_dominant"
    if ratio < 0.5 and pm10 > pm25 * 1.8:
        return "coarse_particle"
    if delta > 8 and duration_min < 30:
        return "indoor_activity"
    if delta < 5 and duration_min > 60:
        return "background_elevation"
    if delta > 12 and duration_min < 10:
        return "anomalous_spike"
    # Avoid "unknown" for training labels to reduce undecided outputs
    return "background_elevation"


def build_window_features(binned: pd.DataFrame, window: int = 6) -> pd.DataFrame:
    if binned.empty or len(binned) < window:
        return pd.DataFrame()
    rows = []
    for i in range(window - 1, len(binned)):
        win = binned.iloc[i - window + 1 : i + 1].copy()
        t0 = win["bucket"].iloc[0]
        t1 = win["bucket"].iloc[-1]
        duration_min = max((t1 - t0).total_seconds() / 60.0, 1)
        pm25_last = float(win["pm25"].iloc[-1])
        pm10_last = float(win["pm10"].iloc[-1])
        ratio = pm25_last / pm10_last if pm10_last > 0 else 0
        delta = pm25_last - float(win["pm25"].iloc[0])
        trend = (delta / duration_min) * 60.0
        volatility = float(win["pm25"].std()) if len(win) > 1 else 0.0
        avg_pm25 = float(win["pm25"].mean())
        avg_pm10 = float(win["pm10"].mean())
        max_pm25 = float(win["pm25"].max())
        min_pm25 = float(win["pm25"].min())
        spike = max_pm25 - avg_pm25
        rows.append(
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
                "label": label_source(ratio, delta, duration_min, pm25_last, pm10_last),
            }
        )
    return pd.DataFrame(rows)


def vulnerability_score(row: pd.Series) -> float:
    def clamp(v: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, v))
    avg = row["avg_pm25"]
    trend = abs(row["trend"])
    vol = row["volatility"]
    ratio = row["ratio"]
    base = (
        0.45 * clamp(avg / 50.0, 0, 1)
        + 0.25 * clamp(trend / 20.0, 0, 1)
        + 0.2 * clamp(vol / 6.0, 0, 1)
        + 0.1 * clamp(ratio / 1.2, 0, 1)
    )
    return round(base * 100, 2)


def train(db_path: Path | None, output_dir: Path, node: str | None):
    binned = load_binned_series(db_path, node)
    if binned.empty:
        raise RuntimeError("Dati insufficienti.")

    X, y25, y10 = build_features(binned)
    if X.empty:
        raise RuntimeError("Dati insufficienti dopo il preprocessing.")

    if len(X) < 10:
        X_train, X_test, y25_train, y25_test = X, X, y25, y25
        y10_train, y10_test = y10, y10
    else:
        split_idx = int(len(X) * 0.8)
        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y25_train, y25_test = y25.iloc[:split_idx], y25.iloc[split_idx:]
        y10_train, y10_test = y10.iloc[:split_idx], y10.iloc[split_idx:]

    model25 = HistGradientBoostingRegressor(max_depth=6, learning_rate=0.08, max_iter=300, random_state=42)
    model10 = HistGradientBoostingRegressor(max_depth=6, learning_rate=0.08, max_iter=300, random_state=42)

    model25.fit(X_train, y25_train)
    model10.fit(X_train, y10_train)

    pred25 = model25.predict(X_test)
    pred10 = model10.predict(X_test)

    r2_25 = r2_score(y25_test, pred25)
    r2_10 = r2_score(y10_test, pred10)

    output_dir.mkdir(parents=True, exist_ok=True)
    # Source classifier model (weak supervision)
    window_df = build_window_features(binned, window=6)
    source_model = None
    source_classes = []
    if not window_df.empty:
        source_df = window_df.copy()
        source_y = source_df["label"]
        source_X = source_df.drop(columns=["label"])
        source_model = RandomForestClassifier(
            n_estimators=220,
            max_depth=8,
            min_samples_leaf=3,
            class_weight="balanced_subsample",
            random_state=42,
        )
        source_model.fit(source_X, source_y)
        source_classes = list(source_model.classes_)

    # Vulnerability risk model (regression)
    risk_model = None
    if not window_df.empty:
        risk_df = window_df.copy()
        risk_df["target"] = risk_df.apply(vulnerability_score, axis=1)
        risk_X = risk_df.drop(columns=["label", "target"])
        risk_y = risk_df["target"]
        risk_model = HistGradientBoostingRegressor(max_depth=5, learning_rate=0.08, max_iter=250, random_state=42)
        risk_model.fit(risk_X, risk_y)
        pred_risk = risk_model.predict(risk_X)
        r2_risk = r2_score(risk_y, pred_risk)
    else:
        r2_risk = None

    joblib.dump(
        {
            "model_pm25": model25,
            "model_pm10": model10,
            "model_source": source_model,
            "model_vulnerability": risk_model,
            "source_classes": source_classes,
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "r2_pm25": r2_25,
            "r2_pm10": r2_10,
            "r2_vulnerability": r2_risk,
        },
        output_dir / "air_quality_model.joblib",
    )

    print(f"Saved model to {output_dir / 'air_quality_model.joblib'}")
    print(f"R2 pm25: {r2_25:.3f}, R2 pm10: {r2_10:.3f}")
    if r2_risk is not None:
        print(f"R2 vulnerability: {r2_risk:.3f}")
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="../backend/data/air_quality.db")
    parser.add_argument("--out", default="./models")
    parser.add_argument("--node", default=None)
    args = parser.parse_args()

    db_path = Path(args.db) if args.db else None
    train(db_path, Path(args.out), args.node)





