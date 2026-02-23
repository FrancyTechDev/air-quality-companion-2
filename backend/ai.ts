import { OpenAI } from "openai";
import express from "express";

const router = express.Router();
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

router.post("/chat", async (req, res) => {
  try {
    const { messages: chatMessages } = req.body;
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: chatMessages,
      response_format: { type: "json_object" }
    });
    res.json({ message: response.choices[0].message });
  } catch (error) {
    console.error("OpenAI Error:", error);
    res.status(500).json({ error: "Failed to communicate with AI" });
  }
});

export default router;
