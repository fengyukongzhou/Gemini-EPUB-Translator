import React from 'react';
import { Settings, BookA, Sparkles } from 'lucide-react';
import { AppConfig } from '../types';

interface SettingsPanelProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  disabled: boolean;
}

const LANGUAGES = [
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "English",
  "Japanese",
  "Korean",
  "French",
  "German",
  "Spanish",
  "Russian",
  "Italian",
  "Portuguese"
];

const SettingsPanel: React.FC<SettingsPanelProps> = ({ config, setConfig, disabled }) => {
  const handleChange = (field: keyof AppConfig, value: string | boolean) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
      <div className="flex items-center gap-2 mb-4 text-slate-800">
        <Settings className="w-5 h-5" />
        <h2 className="font-semibold text-lg">Workflow Settings</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Target Language */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Target Language
          </label>
          <div className="relative">
            <select
              value={config.targetLanguage}
              onChange={(e) => handleChange('targetLanguage', e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm appearance-none bg-white"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
          </div>
        </div>

        {/* Toggle Proofreading */}
        <div className="flex items-center h-full md:pt-6 pt-0">
            <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                    type="checkbox" 
                    checked={config.enableProofreading}
                    onChange={(e) => handleChange('enableProofreading', e.target.checked)}
                    disabled={disabled}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">Enable Gemini Proofreading</span>
            </label>
        </div>

        {/* Use Recommended Prompts Toggle */}
        <div className="col-span-1 md:col-span-2 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
           <label className="flex items-center gap-3 cursor-pointer select-none">
              <input 
                  type="checkbox" 
                  checked={config.useRecommendedPrompts}
                  onChange={(e) => handleChange('useRecommendedPrompts', e.target.checked)}
                  disabled={disabled}
                  className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <div className="flex flex-col">
                  <span className="text-sm font-semibold text-indigo-900 flex items-center gap-1">
                     <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" /> 中文推荐翻译配置
                  </span>
                  <span className="text-xs text-indigo-700">
                      使用经过优化的预设提示词，提供高质量的文学翻译与精准校对。
                  </span>
              </div>
           </label>
        </div>
        
        {/* System Instruction */}
        <div className="col-span-1 md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
             <BookA className="w-4 h-4"/> System Instruction (Translation)
          </label>
          <textarea
            value={config.useRecommendedPrompts ? "已启用中文推荐翻译配置" : config.systemInstruction}
            onChange={(e) => handleChange('systemInstruction', e.target.value)}
            disabled={disabled || config.useRecommendedPrompts}
            rows={3}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono transition-colors
              ${config.useRecommendedPrompts 
                ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed' 
                : 'bg-white border-slate-300'
              }`}
          />
        </div>

        {/* Proofreading Prompt */}
        {config.enableProofreading && (
           <div className="col-span-1 md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
                Proofreading Instruction
            </label>
            <textarea
                value={config.useRecommendedPrompts ? "已启用中文推荐校对配置" : config.proofreadInstruction}
                onChange={(e) => handleChange('proofreadInstruction', e.target.value)}
                disabled={disabled || config.useRecommendedPrompts}
                rows={2}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono transition-colors
                  ${config.useRecommendedPrompts 
                    ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed' 
                    : 'bg-white border-slate-300'
                  }`}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPanel;