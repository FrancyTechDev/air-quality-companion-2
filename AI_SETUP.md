# Configurazione AI su Render

Il chatbot Node e le previsioni Python sono due servizi indipendenti.

## Chatbot (servizio del sito)

Per usare Groq, nelle variabili Environment del servizio Node impostare:

```text
AI_PROVIDER=groq
GROQ_API_KEY=<chiave del proprio account Groq>
GROQ_MODEL=llama-3.3-70b-versatile
```

La chiave va inserita solo nel pannello Render, mai nel repository o nelle
variabili `VITE_*`. Salvare e ridistribuire il servizio.

Sono supportati anche `AI_PROVIDER=xai` con `XAI_API_KEY` e `XAI_MODEL`, oppure
`AI_PROVIDER=openai` con `OPENAI_API_KEY` e `OPENAI_MODEL`. Le precedenti
variabili `AI_INTEGRATIONS_OPENAI_*` rimangono supportate. Impostare
`AI_PROVIDER` evita che una vecchia chiave di un altro provider abbia priorità.

Build Node dalla radice del repository:

```sh
npm ci && npm ci --prefix backend --omit=dev && npm run build
```

Avvio: `node backend/server.js`.

`GET /ai/status` restituisce provider, modello e presenza della configurazione,
senza esporre chiavi. `configured: true` conferma solo la presenza di una chiave:
per verificare autenticazione e generazione serve una chiamata a `POST /ai/chat`.
I codici di errore distinguono configurazione assente, accesso rifiutato,
limiti di utilizzo, richiesta rifiutata e servizio non raggiungibile.

## Analisi e previsioni (servizio Python)

Verificare che il servizio `ai-python-kae4` distribuisca questo repository,
ramo `main`, includendo le modifiche a `ml/serve.py`.

Con Root Directory `ml`:

```text
Build Command: pip install -r requirements.txt
Start Command: uvicorn serve:app --host 0.0.0.0 --port $PORT
```

Usare Python 3.12 con le dipendenze fissate in `ml/requirements.txt`.
`DATABASE_URL` deve riferirsi allo stesso Postgres del servizio Node. Se la
connessione diretta manca o fallisce, il servizio legge campioni reali da
`DATA_API_URL`, il cui valore predefinito è:

```text
https://air-quality-companion-2.onrender.com/data
```

Le richieste al database hanno un timeout di connessione di 5 secondi e quelle
all'API dei sensori di 10 secondi. Campioni non validi o fuori dalla finestra
richiesta vengono esclusi. Se non ci sono campioni recenti, l'API risponde 503,
senza inventare misurazioni o previsioni.

Controlli dopo il deploy:

- `GET /ai/debug`: fonte dati, numero di campioni recenti, ultimo timestamp,
  modalità del motore. `db: fallback` segnala uso dell'API dei sensori.
- `GET /ai/insights`: analisi dei campioni recenti.
- `GET /predict`: cinque previsioni orarie per PM2.5 e PM10.

`engine.mode=model` indica uso del modello disponibile; `trend_estimate`
indica una stima statistica, ad esempio quando manca storico sufficiente.
L'interfaccia distingue queste stime dalle previsioni del modello e dal
calcolo locale usato quando il servizio remoto non risponde.

Nel servizio Node, `VITE_AI_URL` deve essere
`https://ai-python-kae4.onrender.com`. È una variabile di build: dopo averla
modificata bisogna ricostruire il frontend. `VITE_AI_INSIGHTS_URL`, se impostata,
ha priorità per le analisi.

## Verifica locale

```sh
node --test backend/ai.test.js
python -m unittest discover -s ml -p test_serve.py -v
npm run build
```

I test del chatbot usano un provider HTTP locale simulato; quelli Python
verificano anche il modello incluso e il recupero dei dati quando Postgres
non è raggiungibile. Le chiavi reali non sono necessarie per questi test.
