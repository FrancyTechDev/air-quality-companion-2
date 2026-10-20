import io
import json
import unittest
from unittest.mock import patch

import pandas as pd
import psycopg2
from fastapi import HTTPException

import serve


class AiServiceTests(unittest.TestCase):
    def samples(self, count=30):
        return pd.DataFrame({
            "pm25": [20 + i % 7 for i in range(count)],
            "pm10": [30 + i % 9 for i in range(count)],
            "timestamp": pd.date_range(end=pd.Timestamp.now(tz="UTC"), periods=count, freq="10min"),
        })

    def test_model_path_is_independent_of_working_directory(self):
        self.assertTrue(serve.MODEL_PATH.is_absolute())
        self.assertIsNotNone(serve.load_model_bundle())

    def test_sample_gaps_are_seconds_and_json_serializable(self):
        result = serve.data_quality(self.samples())
        self.assertEqual(result["last_gap_s"], 600)
        json.dumps(result, allow_nan=False)

    def test_insights_and_five_hour_predictions_with_real_model(self):
        with patch.object(serve, "load_recent_data", return_value=self.samples()):
            insights = serve.ai_insights(hours=24)
            predictions = serve.predict()
        json.dumps(insights, allow_nan=False)
        json.dumps(predictions, allow_nan=False)
        self.assertEqual(predictions["engine"]["mode"], "model")
        self.assertEqual([p["hour"] for p in predictions["pm25Predictions"]], [1, 2, 3, 4, 5])
        self.assertEqual(len(predictions["pm10Predictions"]), 5)

    def test_short_history_and_missing_model_use_all_five_horizons(self):
        with patch.object(serve, "load_recent_data", return_value=self.samples(2)), patch.object(serve, "load_model_bundle", return_value=None):
            predictions = serve.predict()
        self.assertEqual(predictions["engine"]["mode"], "trend_estimate")
        self.assertEqual(predictions["confidence"], 30)
        self.assertEqual(len(predictions["pm25Predictions"]), 5)
        self.assertTrue(all(p["value"] is not None for p in predictions["pm25Predictions"]))

    def test_database_failure_recovers_real_sensor_data_and_numeric_strings(self):
        timestamp = int(pd.Timestamp.now(tz="UTC").timestamp() * 1000) - 1000
        records = [{"pm25": "21", "pm10": "33", "timestamp": str(timestamp)}]
        with patch.object(serve, "DB_URL", "test-db"), patch.object(serve, "load_database_rows", side_effect=psycopg2.OperationalError()), patch.object(serve, "urlopen", return_value=io.BytesIO(json.dumps(records).encode())):
            df = serve.load_recent_data()
        self.assertEqual(df.attrs["data_source"], "sensor_api")
        self.assertEqual(float(df["pm25"].iloc[-1]), 21)

    def test_old_or_invalid_data_are_not_used_as_current(self):
        records = [{"pm25": 21, "pm10": 33, "timestamp": "1000"}, {"pm25": "bad", "pm10": 33, "timestamp": "broken"}]
        with patch.object(serve, "DB_URL", None), patch.object(serve, "urlopen", return_value=io.BytesIO(json.dumps(records).encode())):
            self.assertTrue(serve.load_recent_data().empty)

    def test_no_data_returns_explicit_unavailable_status(self):
        with patch.object(serve, "load_recent_data", return_value=self.samples(0)):
            for endpoint in (lambda: serve.ai_insights(hours=24), serve.predict):
                with self.assertRaises(HTTPException) as raised:
                    endpoint()
                self.assertEqual(raised.exception.status_code, 503)

    def test_both_data_sources_unavailable_return_503(self):
        with patch.object(serve, "DB_URL", None), patch.object(serve, "urlopen", side_effect=TimeoutError()):
            with self.assertRaises(HTTPException) as raised:
                serve.load_recent_data()
        self.assertEqual(raised.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
