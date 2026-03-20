import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Bot, Send, X, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { SensorData } from '@/lib/airQuality';
import { AIAnalysis } from '@/lib/aiPrediction';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

interface ChatbotPanelProps {
  currentData: SensorData;
  history: SensorData[];
  aiInsights: AIAnalysis | null;
  activeSection?: string;
  onClose?: () => void;
  variant?: 'drawer' | 'page';
}

const CHAT_API_URL =
  (import.meta as any).env?.VITE_CHATBOT_URL || `${window.location.origin}/ai/chat`;

const formatNumber = (value: number) => Number.isFinite(value) ? Number(value.toFixed(2)) : 0;

const summarizeHistory = (history: SensorData[]) => {
  if (!history.length) return null;
  const recent = history.slice(-120);
  const pm25 = recent.map((d) => Math.max(0, d.pm25));
  const pm10 = recent.map((d) => Math.max(0, d.pm10));
  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const min = (values: number[]) => Math.min(...values);
  const max = (values: number[]) => Math.max(...values);
  const trend = (values: number[]) =>
    values.length >= 2 ? values[values.length - 1] - values[0] : 0;
  const lastTs = recent[recent.length - 1].timestamp?.getTime?.() ?? Date.now();

  return {
    samples: recent.length,
    lastTimestamp: new Date(lastTs).toISOString(),
    pm25: {
      avg: formatNumber(avg(pm25)),
      min: formatNumber(min(pm25)),
      max: formatNumber(max(pm25)),
      trend: formatNumber(trend(pm25)),
    },
    pm10: {
      avg: formatNumber(avg(pm10)),
      min: formatNumber(min(pm10)),
      max: formatNumber(max(pm10)),
      trend: formatNumber(trend(pm10)),
    },
  };
};

const buildContext = (
  currentData: SensorData,
  history: SensorData[],
  aiInsights: AIAnalysis | null,
  activeSection?: string
) => {
  return {
    platform: 'AirWatch - Air Quality Companion',
    activeSection: activeSection || 'overview',
    current: {
      pm25: formatNumber(currentData.pm25),
      pm10: formatNumber(currentData.pm10),
      lat: formatNumber(currentData.lat),
      lng: formatNumber(currentData.lng),
      timestamp: currentData.timestamp?.toISOString?.() || new Date().toISOString(),
      unit: 'µg/m³',
    },
    historySummary: summarizeHistory(history),
    aiInsights,
    notes: 'Usa questi dati per spiegare condizione attuale, storico e previsione.',
  };
};

const ChatbotPanel = ({
  currentData,
  history,
  aiInsights,
  activeSection,
  onClose,
  variant = 'drawer',
}: ChatbotPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Ciao! Sono l’assistente AirWatch. Chiedimi qualsiasi cosa su dati attuali, storico, analisi e previsioni.',
      createdAt: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const context = useMemo(
    () => buildContext(currentData, history, aiInsights, activeSection),
    [currentData, history, aiInsights, activeSection]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsSending(true);

    try {
      const payload = {
        messages: [...messages, userMessage].slice(-10).map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        context,
      };
      const res = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`AI error ${res.status}`);
      const json = await res.json();
      const content = json?.message?.content || 'Nessuna risposta disponibile.';

      const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content:
          'Mi dispiace, non riesco a contattare il motore AI in questo momento. Riprova tra poco.',
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const containerClasses =
    variant === 'page'
      ? 'glass-panel p-6 h-[calc(100vh-220px)]'
      : 'glass-panel p-4 h-[70vh]';

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-accent">
          <Bot className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">AirWatch Assistant</h2>
          <p className="text-xs text-muted-foreground">Dati interni + conoscenza generale</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-2 rounded-xl bg-muted hover:bg-muted/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className={`${containerClasses} flex flex-col`}>
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'assistant'
                  ? 'bg-muted text-foreground'
                  : 'ml-auto bg-primary/20 text-foreground'
              }`}
            >
              {msg.content}
            </div>
          ))}
          {isSending && (
            <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm bg-muted text-muted-foreground">
              <motion.span
                className="inline-flex items-center gap-2"
                initial={{ opacity: 0.3 }}
                animate={{ opacity: 1 }}
                transition={{ repeat: Infinity, duration: 0.8, repeatType: 'reverse' }}
              >
                <Sparkles className="w-4 h-4" /> Sto analizzando i dati...
              </motion.span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="mt-4 flex items-end gap-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scrivi una domanda sui dati, le previsioni o la situazione..."
            rows={2}
            className="flex-1 rounded-2xl bg-muted/70 border border-border px-4 py-3 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isSending}
            className="p-3 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Risposte basate su dati interni e conoscenza generale. Nessun parere medico.
        </p>
      </div>
    </div>
  );
};

export default ChatbotPanel;
