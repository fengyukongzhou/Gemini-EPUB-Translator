
import { GoogleGenAI } from "@google/genai";
import { AppConfig } from "../types";

export class AiService {
  private ai: GoogleGenAI;
  private geminiModelName = 'gemini-3-flash-preview';
  // Safe chunk size to avoid HTTP timeouts (approx 1500-2000 tokens)
  private CHUNK_SIZE = 6000;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    // API key must be obtained exclusively from process.env.API_KEY
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  /**
   * Helper to retry operations with exponential backoff.
   */
  private async retry<T>(
    operation: () => Promise<T>, 
    retries: number = 3, 
    delay: number = 2000
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      if (retries <= 0) throw error;
      
      const errString = String(error) + (typeof error === 'object' ? JSON.stringify(error) : '');
      const isRateLimit = errString.includes('429') || errString.includes('RESOURCE_EXHAUSTED');
      // Don't retry on Auth errors or Bad Request
      const isFatal = errString.includes('401') || errString.includes('403') || errString.includes('400');

      if (isFatal) throw error;

      let nextDelay = delay;

      if (isRateLimit) {
          nextDelay = Math.max(delay * 1.5, 15000);
          console.warn(`Rate limit exceeded (429). Pausing for ${nextDelay}ms before retry... (${retries} attempts left)`);
      } else {
          nextDelay = delay * 2;
          console.warn(`API call failed. Retrying in ${nextDelay}ms... (${retries} attempts left).`, error);
      }
      
      await new Promise(resolve => setTimeout(resolve, nextDelay));
      return this.retry(operation, retries - 1, nextDelay);
    }
  }

  /**
   * Splits text into manageable chunks.
   */
  private splitTextIntoChunks(text: string): string[] {
    if (!text || text.length <= this.CHUNK_SIZE) return [text];

    const chunks: string[] = [];
    let currentChunk = '';
    
    const paragraphs = text.split(/\n\n/);

    for (const paragraph of paragraphs) {
      if ((currentChunk.length + paragraph.length + 2) > this.CHUNK_SIZE) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }

        if (paragraph.length > this.CHUNK_SIZE) {
           const lines = paragraph.split('\n');
           let currentLineChunk = '';
           
           for (const line of lines) {
             if ((currentLineChunk.length + line.length + 1) > this.CHUNK_SIZE) {
                if (currentLineChunk) {
                    chunks.push(currentLineChunk);
                    currentLineChunk = '';
                }
                if (line.length > this.CHUNK_SIZE) {
                    let remaining = line;
                    while (remaining.length > 0) {
                        chunks.push(remaining.substring(0, this.CHUNK_SIZE));
                        remaining = remaining.substring(this.CHUNK_SIZE);
                    }
                } else {
                    currentLineChunk = line;
                }
             } else {
                currentLineChunk += (currentLineChunk ? '\n' : '') + line;
             }
           }
           if (currentLineChunk) chunks.push(currentLineChunk);

        } else {
           currentChunk = paragraph;
        }
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Generates content using Google Gemini.
   */
  private async generate(
      prompt: string, 
      systemInstruction: string, 
      temperature: number
  ): Promise<string> {
      const operation = async () => {
        const response = await this.ai.models.generateContent({
            model: this.geminiModelName,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                temperature: temperature,
            }
        });

        const text = response.text;
        if (!text) {
            throw new Error("Received empty response from Gemini API");
        }
        return text;
      };

      return this.retry(operation);
  }

  async translateContent(
    content: string, 
    targetLanguage: string, 
    systemInstruction: string
  ): Promise<string> {
    
    const chunks = this.splitTextIntoChunks(content);
    const translatedChunks: string[] = [];

    const baseSystemInstruction = `MANDATORY INSTRUCTION: Translate the content into ${targetLanguage}.\n\n${systemInstruction}`;

    for (let i = 0; i < chunks.length; i++) {
        // Add polite delay for rate limits
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const chunk = chunks[i];
        
        const chunkInstruction = chunks.length > 1
            ? `${baseSystemInstruction}\n\n[System Note: This is part ${i + 1} of ${chunks.length} of the chapter. Maintain strict terminology and stylistic consistency with previous parts.]`
            : baseSystemInstruction;

        const prompt = `Translate the following Markdown content into ${targetLanguage}. \n\nCONTENT:\n${chunk}`;

        try {
            const result = await this.generate(prompt, chunkInstruction, 0.3);
            translatedChunks.push(result);
        } catch (error) {
            console.error(`Error translating chunk ${i + 1}/${chunks.length}:`, error);
            throw new Error(`Translation failed at part ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    return translatedChunks.join('\n\n');
  }

  async proofreadContent(
    content: string, 
    instruction: string
  ): Promise<string> {
    
    const chunks = this.splitTextIntoChunks(content);
    const proofreadChunks: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const chunk = chunks[i];
        const prompt = `Check the following Markdown content. ${instruction}\n\nCONTENT:\n${chunk}`;
        
        try {
            const result = await this.generate(prompt, "You are a specialized proofreading engine.", 0.1);
            proofreadChunks.push(result);
        } catch (error) {
            console.error(`Error proofreading chunk ${i + 1}/${chunks.length}:`, error);
            throw new Error(`Proofreading failed at part ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    return proofreadChunks.join('\n\n');
  }
}
