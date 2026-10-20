import express from "express";
import { OpenAI } from "openai";

const router = express.Router();
const env = (name) => process.env[name]?.trim() || "";

const resolveProvider = () => {
  if (["groq", "xai", "openai"].includes(env("AI_PROVIDER"))) return env("AI_PROVIDER");
  if (env("GROQ_API_KEY")) return "groq";
  if (env("XAI_API_KEY")) return "xai";
  if (env("OPENAI_API_KEY") || env("AI_INTEGRATIONS_OPENAI_API_KEY")) return "openai";
  return "none";
};

const resolveApiKey = (provider) => {
  if (provider === "groq") return env("GROQ_API_KEY");
  if (provider === "xai") return env("XAI_API_KEY");
  if (provider === "openai") return env("OPENAI_API_KEY") || env("AI_INTEGRATIONS_OPENAI_API_KEY");
  return "";
};

const resolveBaseUrl = (provider) => {
  if (provider === "groq") {
    return env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1";
  }
  if (provider === "xai") {
    return env("XAI_BASE_URL") || "https://api.x.ai/v1";
  }
  return env("OPENAI_BASE_URL") || env("AI_INTEGRATIONS_OPENAI_BASE_URL") || undefined;
};

const resolveModel = (provider) => {
  if (provider === "groq") {
    return env("GROQ_MODEL") || "llama-3.3-70b-versatile";
  }
  if (provider === "xai") {
    return env("XAI_MODEL") || "grok-4-1-fast";
  }
  return env("OPENAI_MODEL") || env("AI_INTEGRATIONS_OPENAI_MODEL") || "gpt-4o-mini";
};

const getClient = () => {
  const provider = resolveProvider();
  const apiKey = resolveApiKey(provider);
  if (!apiKey) {
    throw Object.assign(new Error("AI API key missing"), { code: "AI_NOT_CONFIGURED" });
  }
  return {
    client: new OpenAI({
      apiKey,
      baseURL: resolveBaseUrl(provider),
      timeout: 20000,
      maxRetries: 0,
    }),
    provider,
  };
};

const truncate = (value, max = 1200) => {
  if (typeof value !== "string") return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
};

const formatContext = (context = {}) => {
  context = context && typeof context === "object" ? context : {};
  const safe = {
    platform: truncate(context.platform, 300),
    activeSection: truncate(context.activeSection, 120),
    current: context.current,
    historySummary: context.historySummary,
    aiInsights: context.aiInsights,
    notes: truncate(context.notes, 400),
  };

  return JSON.stringify(safe, null, 2);
};

const buildSystemPrompt = (context) => `
Sei "AirWatch Assistant", il chatbot della piattaforma di monitoraggio aria.
Obiettivo: rispondere in italiano in modo chiaro, affidabile e operativo.

Regole:
- Usa i dati di contesto se presenti. Se un dato manca, dillo esplicitamente.
- Quando citi valori, includi unità (µg/m³) e timestamp se disponibili.
- Se fai previsioni, indica l'orizzonte (1h, 2h, 3h) e l'incertezza.
- Distingui chiaramente "Dati interni" da "Conoscenza generale".
- Se la domanda è ambigua, fai 1 domanda di chiarimento mirata.
- Non sostituisci il parere medico: evita diagnosi, limita a indicazioni generali.

Contesto piattaforma (JSON):
${formatContext(context)}
`.trim();

const sanitizeMessages = (messages) =>
  messages
    .filter((msg) => msg && typeof msg.content === "string")
    .map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: truncate(msg.content, 2000),
    }))
    .slice(-12);

router.post("/chat", async (req, res) => {
  try {
    const { messages, context } = req.body || {};
    if (!Array.isArray(messages) || sanitizeMessages(messages).length === 0) {
      return res.status(400).json({ error: "Messaggi mancanti" });
    }

    const { client, provider } = getClient();
    const response = await client.chat.completions.create({
      model: resolveModel(provider),
      temperature: 0.2,
      messages: [
        { role: "system", content: buildSystemPrompt(context) },
        ...sanitizeMessages(messages),
      ],
    });

    const message = response.choices?.[0]?.message;
    if (!message?.content?.trim()) {
      return res.status(502).json({ code: "AI_EMPTY_RESPONSE", error: "Il servizio AI non ha restituito una risposta. Riprova." });
    }
    return res.json({ message });
  } catch (error) {
    console.error("AI request failed:", { provider: resolveProvider(), status: error?.status, code: error?.code, type: error?.name });
    let status = 502;
    let code = "AI_UNAVAILABLE";
    let message = "Il servizio AI non è raggiungibile. Riprova tra poco.";
    if (error?.code === "AI_NOT_CONFIGURED") {
      status = 503;
      code = "AI_NOT_CONFIGURED";
      message = "L'assistente AI non è ancora configurato. Contatta il gestore del sito.";
    } else if ([401, 403].includes(error?.status)) {
      code = "AI_AUTH_FAILED";
      message = "Il servizio AI ha rifiutato l'accesso. Il gestore deve verificare la configurazione.";
    } else if (error?.status === 429) {
      status = 429;
      code = "AI_RATE_LIMIT";
      message = "Il servizio AI ha raggiunto il limite di utilizzo. Riprova più tardi.";
    } else if ([400, 404, 422].includes(error?.status)) {
      code = "AI_REQUEST_REJECTED";
      message = "Il servizio AI ha rifiutato la richiesta. Il gestore deve verificare il modello configurato.";
    }
    return res.status(status).json({ code, error: message });
  }
});

// Configuration only: this does not claim that the provider is reachable.
router.get("/status", (req, res) => {
  const provider = resolveProvider();
  res.json({ configured: Boolean(resolveApiKey(provider)), provider, model: provider === "none" ? null : resolveModel(provider) });
});

export default router;
