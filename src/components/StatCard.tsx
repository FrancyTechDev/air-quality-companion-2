import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  variant?: 'default' | 'danger' | 'neuro';
  badge?: string;
  badgeClass?: string;
}

const StatCard = ({
  title,
  value,
  unit,
  icon: Icon,
  trend,
  trendValue,
  variant = 'default',
  badge,
  badgeClass
}: StatCardProps) => {
  const cardClass = variant === 'danger' 
    ? 'stat-card stat-card-danger' 
    : variant === 'neuro' 
    ? 'stat-card stat-card-neuro' 
    : 'stat-card';

  return (
    <motion.div
      className={cardClass}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <span className="text-sm text-muted-foreground font-medium">{title}</span>
        </div>
        {badge && (
          <span className={badgeClass || 'badge-excellent'}>
            {badge}
          </span>
        )}
      </div>
      
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-foreground">{value}</span>
        {unit && <span className="text-lg text-muted-foreground">{unit}</span>}
      </div>
      
      {trend && trendValue && (
        <div className="mt-3 flex items-center gap-2">
          <span className={`text-sm ${
            trend === 'up' ? 'text-air-dangerous' : 
            trend === 'down' ? 'text-air-excellent' : 
            'text-muted-foreground'
          }`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
            {' '}{trendValue}
          </span>
        </div>
      )}
    </motion.div>
  );
};

export default StatCard;
