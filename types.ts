
export interface Chapter {
  id: string;
  fileName: string;
  title: string;
  content: string; // HTML content
  markdown?: string; // Converted markdown
  translatedMarkdown?: string; // After Gemini
  proofreadMarkdown?: string; // After 2nd pass
}

export interface ProcessingLog {
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'process';
}

export enum AppStatus {
  IDLE = 'IDLE',
  PARSING = 'PARSING',
  TRANSLATING = 'TRANSLATING',
  PROOFREADING = 'PROOFREADING',
  PACKAGING = 'PACKAGING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface AppConfig {
  targetLanguage: string;
  systemInstruction: string;
  proofreadInstruction: string;
  enableProofreading: boolean;
  useRecommendedPrompts: boolean;
}
