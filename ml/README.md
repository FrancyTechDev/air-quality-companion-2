# AI locale (training + predizione)

## 1) Installa dipendenze
```bash
pip install -r requirements.txt
```

## 2) Avvia il backend Node (salva i dati in SQLite)
```bash
cd ../backend
npm install
npm run dev
```

## 3) Raccogli dati
Lascia girare il sensore per diverse ore/giorni.  
Minimo consigliato: ~50 ore di dati.

## 4) Allena il modello
```bash
python train.py --db ../backend/data/air_quality.db --out ./models
```

## 5) Avvia API predizioni
```bash
uvicorn serve:app --host 0.0.0.0 --port 8000
```

L'endpoint per la UI è:
```
http://localhost:8000/predict
```

## Note
- La UI usa automaticamente queste predizioni se l'API è attiva.
- Se l'API non risponde, la UI torna alle stime "simulate" attuali.
