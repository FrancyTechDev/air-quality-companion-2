import express from "express";
import { OpenAI } from "openai";

const router = express.Router();

const openai = new OpenAI({
  apiKey:
    process.env.XAI_API_KEY ||
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL:
    process.env.XAI_BASE_URL ||
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
    "https://api.x.ai/v1",
});

const MODEL =
  process.env.XAI_MODEL ||
  process.env.AI_INTEGRATIONS_OPENAI_MODEL ||
  "grok-4-fast-non-reasoning";

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

    const response = await openai.chat.completions.create({
      model: MODEL,
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
