import express from "express";
import { OpenAI } from "openai";

const router = express.Router();

const resolveProvider = () => {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.XAI_API_KEY) return "xai";
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) return "openai";
  return "none";
};

const resolveApiKey = (provider) => {
  if (provider === "groq") return process.env.GROQ_API_KEY || "";
  if (provider === "xai") return process.env.XAI_API_KEY || "";
  if (provider === "openai") return process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
  return "";
};

const resolveBaseUrl = (provider) => {
  if (provider === "groq") {
    return process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
  }
  if (provider === "xai") {
    return process.env.XAI_BASE_URL || "https://api.x.ai/v1";
  }
  return process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
};

const resolveModel = (provider) => {
  if (provider === "groq") {
    return process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  }
  if (provider === "xai") {
    return process.env.XAI_MODEL || "grok-4-1-fast";
  }
  return process.env.AI_INTEGRATIONS_OPENAI_MODEL || "gpt-4o-mini";
};

const getClient = () => {
  const provider = resolveProvider();
  const apiKey = resolveApiKey(provider);
  if (!apiKey) {
    throw new Error("AI API key missing");
  }
  return {
    client: new OpenAI({
      apiKey,
      baseURL: resolveBaseUrl(provider),
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
    if (!Array.isArray(messages) || messages.length === 0) {
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

    return res.json({ message: response.choices?.[0]?.message || null });
  } catch (error) {
    console.error("OpenAI Error:", error?.message || error);
    return res.status(500).json({ error: "Failed to communicate with AI" });
  }
});

export default router;
