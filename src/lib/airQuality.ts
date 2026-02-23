// Air quality level types and utilities
export type AirQualityLevel = 'excellent' | 'good' | 'moderate' | 'unhealthy' | 'dangerous' | 'hazardous';

export interface AirQualityInfo {
  level: AirQualityLevel;
  label: string;
  color: string;
  bgClass: string;
  badgeClass: string;
  description: string;
}

export const getAirQualityInfo = (pm25: number): AirQualityInfo => {
  if (pm25 <= 12) {
    return {
      level: 'excellent',
      label: 'ECCELLENTE',
      color: '#22c55e',
      bgClass: 'bg-air-excellent',
      badgeClass: 'badge-excellent',
      description: 'Aria pulita, ideale per attività all\'aperto'
    };
  } else if (pm25 <= 25) {
    return {
      level: 'good',
      label: 'BUONA',
      color: '#84cc16',
      bgClass: 'bg-air-good',
      badgeClass: 'badge-good',
      description: 'Qualità dell\'aria accettabile'
    };
  } else if (pm25 <= 35) {
    return {
      level: 'moderate',
      label: 'MODERATA',
      color: '#eab308',
      bgClass: 'bg-air-moderate',
      badgeClass: 'badge-moderate',
      description: 'Sensibilità per gruppi a rischio'
    };
  } else if (pm25 <= 55) {
    return {
      level: 'unhealthy',
      label: 'INSALUBRE',
      color: '#f97316',
      bgClass: 'bg-air-unhealthy',
      badgeClass: 'badge-unhealthy',
      description: 'Effetti sulla salute possibili'
    };
  } else if (pm25 <= 150) {
    return {
      level: 'dangerous',
      label: 'PERICOLOSA',
      color: '#ef4444',
      bgClass: 'bg-air-dangerous',
      badgeClass: 'badge-dangerous',
      description: 'Rischio significativo per la salute'
    };
  } else {
    return {
      level: 'hazardous',
      label: 'CRITICA',
      color: '#a855f7',
      bgClass: 'bg-air-hazardous',
      badgeClass: 'badge-dangerous',
      description: 'Emergenza sanitaria - evitare esposizione'
    };
  }
};

export const getMarkerColor = (pm25: number): string => {
  const info = getAirQualityInfo(pm25);
  return info.color;
};

export interface SensorData {
  pm25: number;
  pm10: number;
  timestamp: Date;
  lat?: number;
  lng?: number;
}

export interface NeuroHealthRisk {
  level: 'low' | 'moderate' | 'high' | 'critical';
  percentage: number;
  cumulativeExposure: number;
  timeAboveThreshold: number;
}

export const calculateNeuroHealthRisk = (history: SensorData[]): NeuroHealthRisk => {
  if (history.length === 0) {
    return { level: 'low', percentage: 0, cumulativeExposure: 0, timeAboveThreshold: 0 };
  }

  const threshold = 35;
  const aboveThreshold = history.filter(d => d.pm25 > threshold).length;
  const timeAboveThreshold = (aboveThreshold / history.length) * 100;
  
  const cumulativeExposure = history.length > 0 ? history.reduce((acc, d) => acc + d.pm25, 0) / history.length : 0;
  
  let level: NeuroHealthRisk['level'];
  let percentage: number;
  
  if (timeAboveThreshold < 10) {
    level = 'low';
    percentage = timeAboveThreshold * 2;
  } else if (timeAboveThreshold < 30) {
    level = 'moderate';
    percentage = 20 + (timeAboveThreshold - 10) * 1.5;
  } else if (timeAboveThreshold < 60) {
    level = 'high';
    percentage = 50 + (timeAboveThreshold - 30);
  } else {
    level = 'critical';
    percentage = Math.min(80 + (timeAboveThreshold - 60) * 0.5, 100);
  }
  
  return { level, percentage, cumulativeExposure, timeAboveThreshold };
};
