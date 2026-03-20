import ChatbotPanel from '@/components/ChatbotPanel';
import { SensorData } from '@/lib/airQuality';
import { AIAnalysis } from '@/lib/aiPrediction';

interface ChatbotSectionProps {
  currentData: SensorData;
  history: SensorData[];
  aiInsights: AIAnalysis | null;
  activeSection?: string;
}

const ChatbotSection = ({ currentData, history, aiInsights, activeSection }: ChatbotSectionProps) => {
  return (
    <div className="animate-fade-in">
      <ChatbotPanel
        currentData={currentData}
        history={history}
        aiInsights={aiInsights}
        activeSection={activeSection}
        variant="page"
      />
    </div>
  );
};

export default ChatbotSection;
