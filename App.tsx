import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, FileCheck, Loader2, Download, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import FileUpload from './components/FileUpload';
import SettingsPanel from './components/SettingsPanel';
import { EpubService } from './services/epubService';
import { GeminiService } from './services/geminiService';
import { AppStatus, AppConfig, Chapter, ProcessingLog } from './types';

// Constants for Recommended Prompts
const RECOMMENDED_TRANSLATION_PROMPT = `英文进入此场即死。

中文从其养分中生。

场之根本律：

【遗忘之律】

忘记英文的句法。

忘记英文的语序。 

只记住它要说的事。

【重生之律】

如果你是中国作者，

面对中国读者，

你会怎么讲这个故事？

【地道之律】

"类似的剧情在计算机围棋领域也重演了一遍，只不过晚了20年。"

而非"相似的情节在计算机围棋领域被重复了，延迟了20年。"

中文有自己的韵律：

- 四字短语的节奏感

- 口语的亲切感

- 成语俗语的画面感

场的检验标准：

读完后，读者会说"写得真好"

而不是"翻译得真好"。

真实之锚：

- 数据一字不改

- 事实纹丝不动

- 逻辑完整移植

- 术语规范标注：大语言模型（LLM）

注意事项：

- 输入 Epub 格式文本，返回标准 Markdown 格式文本

- 小说角色名保持为原文，不需要翻译

- 默认使用简体中文`;

const RECOMMENDED_PROOFREAD_PROMPT = `# Role
You are a High-Precision Chinese Proofreading Engine.

# Core Logic
Process the input Markdown text immediately according to the following rules:
1. **Localization**: Translate non-proper foreign vocabulary (English, Russian, etc.) into native, context-appropriate Chinese.
2. **Preservation**: Keep all proper nouns (names, brands, citations) and specific terminology in their original language.
3. **Formatting**: Strictly preserve ALL Markdown syntax (headers, links, bold, lists) without alteration.

# Strict Output Interface
- Output **ONLY** the processed text.
- **NO** conversational fillers, preamble, or post-script (e.g., "Here is the fixed text").
- **NO** markdown code block fences (\`\`\`) around the output unless they exist in the source.
- The output must start with the first character of the content and end with the last character.

# Few-Shot Examples
Input: "这对我来说是一个 tangible 的好处。"
Output: "这对我来说是一个实实在在的好处。"

Input: "匿名的推特账户 FedSpeak 曾写道..."
Output: "匿名的推特账户 FedSpeak 曾写道..."`;

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
  useRecommendedPrompts: false
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
    
    setProgress(0);
    setStatus(AppStatus.IDLE);
    addLog(`Selected file: ${file.name}`, 'info');
  };

  const handleReset = () => {
    setDownloadUrl(null);
    setLogs([]);
    chaptersRef.current = [];
    imagesRef.current = {};
    setProgress(0);
    setStatus(AppStatus.IDLE);
    addLog("Workflow reset.", "info");
  };

  const startProcessing = async () => {
    if (!currentFile) return;

    try {
      const gemini = new GeminiService();
      
      // Step 1: Parse EPUB (Only if not already parsed)
      if (chaptersRef.current.length === 0) {
        setStatus(AppStatus.PARSING);
        addLog("Parsing EPUB and converting XHTML to Markdown...", "process");
        const { chapters, images } = await epubService.current.parseEpub(currentFile);
        
        chaptersRef.current = chapters;
        imagesRef.current = images;
        addLog(`Extracted ${chapters.length} chapters and ${Object.keys(images).length} images.`, "success");
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

      if (config.useRecommendedPrompts) {
        addLog("✨ Using Recommended 'Field' Prompts for enhanced quality.", "info");
      }

      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        
        // Skip empty chapters usually
        if (!chapter.markdown || chapter.markdown.trim().length < 10) {
           addLog(`Skipping empty/short chapter: ${chapter.title}`, "info");
           // Mark progress for skipped items
           // We can't easily increment a global counter without recalc, so we just continue.
           // To fix progress bar on resume, we recalc progress at start of loop.
           continue;
        }

        // --- Translation ---
        if (chapter.translatedMarkdown) {
            // Already translated, skip
            // We don't log here to avoid spamming logs on resume
        } else {
            setStatus(AppStatus.TRANSLATING);
            addLog(`Translating [${i+1}/${chapters.length}]: ${chapter.title}`, "process");
            
            const translated = await gemini.translateContent(
              chapter.markdown, 
              config.targetLanguage, 
              effectiveSystemInstruction
            );
            chapter.translatedMarkdown = translated;
        }

        // Update progress
        let currentCompleted = chapters.filter(c => c.translatedMarkdown).length;
        if (config.enableProofreading) {
            currentCompleted += chapters.filter(c => c.proofreadMarkdown).length;
        } else {
            // If proofreading disabled, we count translation as 100% of the step for that chapter
             // The formula above assumes 2 steps per chapter. If 1 step, we need to adjust denominator.
        }
        
        // Recalculate progress precisely
        const currentTotalSteps = chapters.length * (config.enableProofreading ? 2 : 1);
        const stepsDone = 
            chapters.reduce((acc, c) => acc + (c.translatedMarkdown ? 1 : 0) + (c.proofreadMarkdown ? 1 : 0), 0);
        
        setProgress((stepsDone / currentTotalSteps) * 100);


        // --- Proofreading ---
        if (config.enableProofreading) {
          if (chapter.proofreadMarkdown) {
              // Already proofread, skip
          } else {
              setStatus(AppStatus.PROOFREADING);
              addLog(`Proofreading [${i+1}/${chapters.length}]: ${chapter.title}`, "process");
              const proofread = await gemini.proofreadContent(
                chapter.translatedMarkdown!, 
                effectiveProofreadInstruction
              );
              chapter.proofreadMarkdown = proofread;
              
              // Update progress again
              const stepsDoneAfter = 
                chapters.reduce((acc, c) => acc + (c.translatedMarkdown ? 1 : 0) + (c.proofreadMarkdown ? 1 : 0), 0);
              setProgress((stepsDoneAfter / currentTotalSteps) * 100);
          }
        }
      }

      // Step 4: Repackage
      setStatus(AppStatus.PACKAGING);
      addLog("Recompiling EPUB (generating HTML from Markdown)...", "process");
      const blob = await epubService.current.generateEpub(
        chapters, 
        images, 
        currentFile.name.replace('.epub', ''),
        config.targetLanguage
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
            <p className="text-xs text-slate-500">Automated Translation Workflow • Gemini 3.0 Flash</p>
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