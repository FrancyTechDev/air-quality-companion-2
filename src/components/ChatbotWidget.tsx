import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import ChatbotPanel from '@/components/ChatbotPanel';
import { SensorData } from '@/lib/airQuality';
import { AIAnalysis } from '@/lib/aiPrediction';

interface ChatbotWidgetProps {
  currentData: SensorData;
  history: SensorData[];
  aiInsights: AIAnalysis | null;
  activeSection?: string;
}

const ChatbotWidget = ({ currentData, history, aiInsights, activeSection }: ChatbotWidgetProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-2xl bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="hidden md:inline text-sm font-medium">Apri Assistant</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] flex items-end justify-end p-4 md:p-6"
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
            <div className="relative w-full max-w-xl">
              <ChatbotPanel
                currentData={currentData}
                history={history}
                aiInsights={aiInsights}
                activeSection={activeSection}
                onClose={() => setIsOpen(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChatbotWidget;
