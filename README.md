# AirWatch – AI Platform

## Avvio rapido
1. Avvia backend e frontend come da progetto.
2. Avvia AI server:
```bash
cd ml
uvicorn serve:app --host 0.0.0.0 --port 8000
```

## AI avanzata (overview)
- Forecast multi-step PM2.5/PM10 (modello + fallback).
- Exposure Engine con cumulative 1h/6h/24h.
- Source Pattern Classifier + soglie adattive.
- NeuroHealth calibrata su finestra recente.
- Report PDF multi‑pagina con raw data snapshot.

## Sezioni UI aggiuntive
- AI Lab, Model Registry, Dataset, Alerts, Mobility.
- Exposure Forecast, Diagnostics, Operations, Compliance.
- Raw Data (table + JSON).
