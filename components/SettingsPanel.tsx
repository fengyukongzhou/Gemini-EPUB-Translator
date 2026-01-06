
import React, { useState } from 'react';
import { Settings, BookA, Sparkles, ScanEye, ChevronDown, ChevronRight, FileText } from 'lucide-react';
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
  const [showPrompts, setShowPrompts] = useState(false);

  const handleChange = (field: keyof AppConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6 transition-all hover:shadow-md">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-slate-800 text-sm">Configuration</h2>
        </div>
      </div>

      <div className="p-5 space-y-6">
        
        {/* Target Language */}
        <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Target Language
            </label>
            <div className="relative group">
              <select
                value={config.targetLanguage}
                onChange={(e) => handleChange('targetLanguage', e.target.value)}
                disabled={disabled}
                className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none transition-all hover:bg-slate-100 hover:border-slate-300 cursor-pointer"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
               <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400 group-hover:text-slate-600">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
        </div>

          {/* Feature Toggles */}
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex items-center shrink-0">
                    <input 
                        type="checkbox" 
                        checked={config.enableProofreading}
                        onChange={(e) => handleChange('enableProofreading', e.target.checked)}
                        disabled={disabled}
                        className="peer sr-only"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 shadow-inner"></div>
                </div>
                <span className="text-sm font-medium text-slate-600 group-hover:text-blue-700 transition-colors select-none">AI Proofreading</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group" title="Skip Title Page, Copyright, TOC, etc.">
                <div className="relative flex items-center shrink-0">
                    <input 
                        type="checkbox" 
                        checked={config.smartSkip}
                        onChange={(e) => handleChange('smartSkip', e.target.checked)}
                        disabled={disabled}
                        className="peer sr-only"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 shadow-inner"></div>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600 group-hover:text-blue-700 transition-colors select-none">
                    <ScanEye className="w-3.5 h-3.5 opacity-60" />
                    <span className="text-sm font-medium">Smart Skip</span>
                </div>
            </label>
          </div>

        <div className="h-px bg-slate-100 w-full" />

        {/* Recommended Prompts Toggle Card */}
        <div 
            onClick={() => !disabled && handleChange('useRecommendedPrompts', !config.useRecommendedPrompts)}
            className={`
                relative group cursor-pointer rounded-lg border transition-all duration-200 overflow-hidden
                ${config.useRecommendedPrompts 
                    ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500/20' 
                    : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
                } 
                ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
            `}
        >
           <div className="p-3.5 flex items-start gap-3.5">
              <div className={`p-2 rounded-md shrink-0 transition-colors ${config.useRecommendedPrompts ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400 group-hover:text-indigo-500 group-hover:bg-indigo-50'}`}>
                 <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                 <div className="flex items-center justify-between mb-1">
                    <span className={`font-semibold text-sm ${config.useRecommendedPrompts ? 'text-indigo-900' : 'text-slate-700'}`}>
                        Use Recommended Prompts
                    </span>
                    {config.useRecommendedPrompts && (
                        <span className="shrink-0 bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                            Active
                        </span>
                    )}
                 </div>
                 <p className={`text-xs leading-relaxed truncate ${config.useRecommendedPrompts ? 'text-indigo-700' : 'text-slate-500'}`}>
                    High-quality preset prompts designed for literary translation.
                 </p>
              </div>
           </div>
        </div>

        {/* Advanced Prompts Section (Collapsible) */}
        <div className="pt-1">
            <button
                onClick={() => setShowPrompts(!showPrompts)}
                className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors mb-3 focus:outline-none group uppercase tracking-wider w-full"
            >
                <span>Advanced Prompt Settings</span>
                <div className="h-px bg-slate-100 flex-1 group-hover:bg-blue-100 transition-colors" />
                {showPrompts ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>

            {showPrompts && (
                <div className="space-y-5 animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                           <BookA className="w-3.5 h-3.5 text-blue-500"/> System Instruction
                        </label>
                        <textarea
                            value={config.useRecommendedPrompts ? "Recommended prompts active. Custom instruction ignored." : config.systemInstruction}
                            onChange={(e) => handleChange('systemInstruction', e.target.value)}
                            disabled={disabled || config.useRecommendedPrompts}
                            rows={5}
                            className={`w-full px-3 py-2.5 text-xs md:text-sm rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono leading-relaxed resize-y
                                ${config.useRecommendedPrompts 
                                    ? 'bg-slate-50 text-slate-400 border-slate-200 italic' 
                                    : 'bg-white border-slate-300 text-slate-700 focus:border-blue-500 shadow-sm'
                                }`}
                        />
                    </div>

                    {config.enableProofreading && (
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                <FileText className="w-3.5 h-3.5 text-green-500"/> Proofreading Instruction
                            </label>
                            <textarea
                                value={config.useRecommendedPrompts ? "Recommended prompts active. Custom instruction ignored." : config.proofreadInstruction}
                                onChange={(e) => handleChange('proofreadInstruction', e.target.value)}
                                disabled={disabled || config.useRecommendedPrompts}
                                rows={3}
                                className={`w-full px-3 py-2.5 text-xs md:text-sm rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono leading-relaxed resize-y
                                    ${config.useRecommendedPrompts 
                                        ? 'bg-slate-50 text-slate-400 border-slate-200 italic' 
                                        : 'bg-white border-slate-300 text-slate-700 focus:border-blue-500 shadow-sm'
                                    }`}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
