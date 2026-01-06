
import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, FileCheck, Loader2, Download, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import FileUpload from './components/FileUpload';
import SettingsPanel from './components/SettingsPanel';
import { EpubService } from './services/epubService';
import { AiService } from './services/geminiService';
import { AppStatus, AppConfig, Chapter, ProcessingLog } from './types';

// Constants for Recommended Prompts
const RECOMMENDED_TRANSLATION_PROMPT = `You are a professional literary translator.
Your task is to translate the provided text into the target language while preserving the original tone, style, and formatting.

Guidelines:
1. Translate the content accurately.
2. Maintain the markdown structure (headers, bold, italics).
3. Do not output any explanations or conversational text, only the translated content.
4. Keep proper nouns and specific terms consistent.`;

const RECOMMENDED_PROOFREAD_PROMPT = `You are a professional proofreader.
Your task is to review the text for grammar, flow, and translation errors.

Guidelines:
1. Fix any grammatical errors or awkward phrasings.
2. Ensure the tone is consistent.
3. Do not change the meaning of the text.
4. Return only the corrected markdown text.`;

// Default config values
const DEFAULT_CONFIG: AppConfig = {
  targetLanguage: 'Chinese (Simplified)',
  systemInstruction: `You are an expert literary translator. Your task is to rewrite the original text into the target language.

Guidelines:
1. Input: Text derived from an EPUB file.
2. Output: Standard Markdown format.
3. Character Names: Keep novel character names in their original language. Do NOT translate them.
4. Fidelity: Maintain the original tone, style, and logic of the story.`,
  proofreadInstruction: 'Check for mixed languages (e.g., untranslated sentences) and fix them. Ensure smooth flow. Return the corrected markdown only.',
  enableProofreading: true,
  useRecommendedPrompts: false,
  smartSkip: true
};

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  
  // Refs for services and data persistence
  const epubService = useRef(new EpubService());
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  // Persist chapters and images across renders to allow resuming
  const chaptersRef = useRef<Chapter[]>([]);
  const imagesRef = useRef<Record<string, Blob>>({});
  const coverPathRef = useRef<string | undefined>(undefined);

  // Auto scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = (message: string, type: ProcessingLog['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: Date.now(), message, type }]);
  };

  const handleFileSelect = (file: File) => {
    setCurrentFile(file);
    setDownloadUrl(null);
    setLogs([]);
    
    // Clear persisted data for new file
    chaptersRef.current = [];
    imagesRef.current = {};
    coverPathRef.current = undefined;
    
    setProgress(0);
    setStatus(AppStatus.IDLE);
    addLog(`Selected file: ${file.name}`, 'info');
  };

  const handleReset = () => {
    setDownloadUrl(null);
    setLogs([]);
    chaptersRef.current = [];
    imagesRef.current = {};
    coverPathRef.current = undefined;
    setProgress(0);
    setStatus(AppStatus.IDLE);
    addLog("Workflow reset.", "info");
  };

  const startProcessing = async () => {
    if (!currentFile) return;

    try {
      const aiService = new AiService(config);
      
      // Step 1: Parse EPUB (Only if not already parsed)
      if (chaptersRef.current.length === 0) {
        setStatus(AppStatus.PARSING);
        addLog("Parsing EPUB and converting XHTML to Markdown...", "process");
        const { chapters, images, coverPath } = await epubService.current.parseEpub(currentFile);
        
        chaptersRef.current = chapters;
        imagesRef.current = images;
        coverPathRef.current = coverPath;

        addLog(`Extracted ${chapters.length} chapters and ${Object.keys(images).length} images.`, "success");
        if (coverPath) {
            addLog(`Cover image detected.`, 'info');
        }
      } else {
        addLog("Resuming workflow with existing parsed data...", "info");
      }

      const chapters = chaptersRef.current;
      const images = imagesRef.current;

      // Step 2 & 3: Translate & Proofread Loop
      const totalSteps = chapters.length * (config.enableProofreading ? 2 : 1);
      
      // Select prompts based on configuration
      const effectiveSystemInstruction = config.useRecommendedPrompts 
        ? RECOMMENDED_TRANSLATION_PROMPT 
        : config.systemInstruction;
        
      const effectiveProofreadInstruction = config.useRecommendedPrompts
        ? RECOMMENDED_PROOFREAD_PROMPT
        : config.proofreadInstruction;

      addLog(`🚀 Starting translation using Google Gemini 3.0 Flash...`, "info");

      if (config.useRecommendedPrompts) {
        addLog("✨ Using Recommended Prompts.", "info");
      }
      
      if (config.smartSkip) {
        addLog("👁️ Smart Skip enabled: Title pages, Copyright, TOC will be REMOVED. References will be KEPT (untranslated).", "info");
      }

      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        
        // Skip empty chapters usually
        if (!chapter.markdown || chapter.markdown.trim().length < 10) {
           addLog(`Skipping empty/short chapter: ${chapter.title}`, "info");
           continue;
        }
        
        // Handle Smart Skip Logic
        if (config.smartSkip) {
            // Case 1: Skippable (Copyright, TOC, etc.) -> Remove completely from output
            if (chapter.isSkippable) {
                 // If it's skippable, we don't translate, don't proofread.
                 continue;
            }

            // Case 2: Reference (Bibliography, etc.) -> Keep but don't translate
            if (chapter.isReference) {
                if (!chapter.translatedMarkdown) {
                    addLog(`Keeping reference chapter untranslated: ${chapter.title}`, "info");
                    chapter.translatedMarkdown = chapter.markdown;
                    chapter.proofreadMarkdown = chapter.markdown;
                }
            }
        }

        // --- Translation ---
        if (chapter.translatedMarkdown) {
            // Already translated (or preserved as reference), move on
        } else {
            setStatus(AppStatus.TRANSLATING);
            addLog(`Translating [${i+1}/${chapters.length}]: ${chapter.title}`, "process");
            
            const translated = await aiService.translateContent(
              chapter.markdown, 
              config.targetLanguage, 
              effectiveSystemInstruction
            );
            chapter.translatedMarkdown = translated;
        }

        // Update progress
        const currentTotalSteps = chapters.length * (config.enableProofreading ? 2 : 1);
        
        // Calculate steps done. 
        const stepsDone = chapters.reduce((acc, c) => {
             // If skippable and smartSkip is on, it counts as fully done (2 steps)
             if (config.smartSkip && c.isSkippable) return acc + (config.enableProofreading ? 2 : 1);
             return acc + (c.translatedMarkdown ? 1 : 0) + (c.proofreadMarkdown ? 1 : 0);
        }, 0);
        
        setProgress((stepsDone / currentTotalSteps) * 100);


        // --- Proofreading ---
        if (config.enableProofreading) {
          if (chapter.proofreadMarkdown) {
              // Already proofread, move on
          } else {
              setStatus(AppStatus.PROOFREADING);
              addLog(`Proofreading [${i+1}/${chapters.length}]: ${chapter.title}`, "process");
              const proofread = await aiService.proofreadContent(
                chapter.translatedMarkdown!, 
                effectiveProofreadInstruction
              );
              chapter.proofreadMarkdown = proofread;
              
              // Update progress again
               const stepsDoneAfter = chapters.reduce((acc, c) => {
                    if (config.smartSkip && c.isSkippable) return acc + (config.enableProofreading ? 2 : 1);
                    return acc + (c.translatedMarkdown ? 1 : 0) + (c.proofreadMarkdown ? 1 : 0);
               }, 0);
              setProgress((stepsDoneAfter / currentTotalSteps) * 100);
          }
        }
      }

      // Step 4: Repackage
      setStatus(AppStatus.PACKAGING);
      
      const chaptersToPack = config.smartSkip 
        ? chapters.filter(c => !c.isSkippable)
        : chapters;

      addLog(`Recompiling EPUB (Packaged ${chaptersToPack.length} / ${chapters.length} chapters)...`, "process");
      
      const blob = await epubService.current.generateEpub(
        chaptersToPack, 
        images, 
        currentFile.name.replace('.epub', ''),
        config.targetLanguage,
        coverPathRef.current
      );
      
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
      
      setStatus(AppStatus.COMPLETED);
      addLog("Workflow complete! Download ready.", "success");

    } catch (error) {
      console.error(error);
      setStatus(AppStatus.ERROR);
      addLog(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <BookOpen className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Gemini EPUB Translator</h1>
            <p className="text-xs text-slate-500">Automated Translation Workflow</p>
          </div>
        </div>
        {status === AppStatus.COMPLETED && downloadUrl && (
          <a
            href={downloadUrl}
            download={`translated-${currentFile?.name}`}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Download className="w-4 h-4" /> Download EPUB
          </a>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col md:flex-row bg-slate-50">
        
        {/* Left Panel: Configuration & Input */}
        <div className="w-full md:w-1/2 lg:w-5/12 p-6 overflow-y-auto border-r border-slate-200">
          
          <div className="max-w-xl mx-auto space-y-6">
            <SettingsPanel 
              config={config} 
              setConfig={setConfig} 
              disabled={status !== AppStatus.IDLE && status !== AppStatus.COMPLETED && status !== AppStatus.ERROR} 
            />

            <FileUpload 
              onFileSelect={handleFileSelect} 
              disabled={status !== AppStatus.IDLE && status !== AppStatus.COMPLETED && status !== AppStatus.ERROR}
            />

            {currentFile && (
               <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                 <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <FileCheck className="text-blue-600 w-5 h-5" />
                        <span className="font-medium text-blue-900 truncate max-w-[200px]">{currentFile.name}</span>
                    </div>
                    {/* Clear Button */}
                     {(status === AppStatus.IDLE || status === AppStatus.COMPLETED || status === AppStatus.ERROR) && (
                        <button 
                            onClick={handleReset}
                            className="text-slate-400 hover:text-red-500 transition-colors p-1"
                            title="Remove file"
                        >
                            <Trash2 className="w-4 h-4"/>
                        </button>
                     )}
                 </div>

                 <div className="flex gap-2">
                    {/* Start Button */}
                    {status === AppStatus.IDLE && (
                    <button
                        onClick={startProcessing}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                    >
                        Start Translation
                    </button>
                    )}

                    {/* Resume Button */}
                    {status === AppStatus.ERROR && (
                    <button
                        onClick={startProcessing}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" /> Resume Translation
                    </button>
                    )}
                    
                    {/* Restart Button (If Completed) */}
                     {status === AppStatus.COMPLETED && (
                        <button
                            onClick={startProcessing}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                        >
                            Translate Again
                        </button>
                    )}
                 </div>
               </div>
            )}
            
            {status === AppStatus.ERROR && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-start gap-3 text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-1">
                        <span className="font-semibold">Process Paused due to Error</span>
                        <span className="text-red-600/80">
                            Check the logs for details. You can click "Resume Translation" above to retry from where it left off.
                        </span>
                    </div>
                </div>
            )}
          </div>
        </div>

        {/* Right Panel: Logs & Progress */}
        <div className="w-full md:w-1/2 lg:w-7/12 bg-slate-900 text-slate-300 p-0 flex flex-col">
          <div className="p-4 border-b border-slate-700 bg-slate-800 flex items-center justify-between">
             <span className="font-mono text-sm font-semibold text-slate-100">Workflow Console</span>
             <div className="text-xs font-mono text-slate-400">
                {status !== AppStatus.IDLE && status !== AppStatus.COMPLETED && status !== AppStatus.ERROR ? (
                   <span className="flex items-center gap-2">
                     <Loader2 className="w-3 h-3 animate-spin" /> 
                     {status}... {Math.round(progress)}%
                   </span>
                ) : (
                    <span>{status}</span>
                )}
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs md:text-sm space-y-2">
            {logs.length === 0 && (
                <div className="text-slate-600 italic text-center mt-10">
                    Waiting for input...
                </div>
            )}
            {logs.map((log, idx) => (
                <div key={idx} className={`flex gap-2 ${
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'success' ? 'text-green-400' :
                    log.type === 'process' ? 'text-blue-400' : 'text-slate-300'
                }`}>
                    <span className="opacity-50">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span>{log.message}</span>
                </div>
            ))}
            <div ref={logsEndRef} />
          </div>

          {/* Progress Bar (Visual) */}
          <div className="h-1 bg-slate-800 w-full">
            <div 
                className={`h-full transition-all duration-300 ease-out ${status === AppStatus.ERROR ? 'bg-amber-500' : 'bg-blue-500'}`}
                style={{ width: `${progress}%` }}
            />
          </div>
        </div>

      </main>
    </div>
  );
};

export default App;
