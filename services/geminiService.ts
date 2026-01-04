import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  private ai: GoogleGenAI;
  private modelName = 'gemini-3-flash-preview';
  // Safe chunk size to avoid HTTP timeouts (approx 1500-2000 tokens)
  private CHUNK_SIZE = 6000;

  constructor() {
    // API key must be obtained exclusively from process.env.API_KEY
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  /**
   * Helper to retry operations with exponential backoff.
   * Helps mitigate transient 500 errors or network hiccups.
   * Handles 429 Rate Limits with aggressive backoff.
   */
  private async retry<T>(
    operation: () => Promise<T>, 
    retries: number = 5, 
    delay: number = 2000
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      if (retries <= 0) throw error;
      
      // Detect Rate Limit / Resource Exhausted errors
      // The error object structure can vary, so we check string representations
      const errString = String(error) + (typeof error === 'object' ? JSON.stringify(error) : '');
      const isRateLimit = errString.includes('429') || errString.includes('RESOURCE_EXHAUSTED');

      let nextDelay = delay;

      if (isRateLimit) {
          // If we hit a rate limit, wait at least 15 seconds, or double the previous wait
          nextDelay = Math.max(delay * 1.5, 15000);
          console.warn(`Rate limit exceeded (429). Pausing for ${nextDelay}ms before retry... (${retries} attempts left)`);
      } else {
          // Standard exponential backoff for other errors (500, network, etc.)
          nextDelay = delay * 2;
          console.warn(`API call failed. Retrying in ${nextDelay}ms... (${retries} attempts left).`, error);
      }
      
      await new Promise(resolve => setTimeout(resolve, nextDelay));
      return this.retry(operation, retries - 1, nextDelay);
    }
  }

  /**
   * Splits text into manageable chunks to avoid API timeouts.
   * Tries to respect paragraph boundaries (\n\n).
   */
  private splitTextIntoChunks(text: string): string[] {
    if (!text || text.length <= this.CHUNK_SIZE) return [text];

    const chunks: string[] = [];
    let currentChunk = '';
    
    // Split by double newline to preserve paragraph structure
    const paragraphs = text.split(/\n\n/);

    for (const paragraph of paragraphs) {
      // If adding this paragraph exceeds limit
      if ((currentChunk.length + paragraph.length + 2) > this.CHUNK_SIZE) {
        // Push the current accumulated chunk if it exists
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }

        // Handle the current paragraph
        if (paragraph.length > this.CHUNK_SIZE) {
           // If a single paragraph is massive, we must split it.
           // Try splitting by single newline first
           const lines = paragraph.split('\n');
           let currentLineChunk = '';
           
           for (const line of lines) {
             if ((currentLineChunk.length + line.length + 1) > this.CHUNK_SIZE) {
                if (currentLineChunk) {
                    chunks.push(currentLineChunk);
                    currentLineChunk = '';
                }
                // If a single line is massive (unlikely), hard chop it
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
   * Internal helper to perform the generation request
   */
  private async generate(
      prompt: string, 
      systemInstruction: string, 
      temperature: number
  ): Promise<string> {
      const operation = async () => {
        const response = await this.ai.models.generateContent({
            model: this.modelName,
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

    // Prepend mandatory instruction
    const baseSystemInstruction = `MANDATORY INSTRUCTION: Translate the content into ${targetLanguage}.\n\n${systemInstruction}`;

    // Process chunks sequentially
    for (let i = 0; i < chunks.length; i++) {
        // Add a polite delay between chunks to avoid flooding the API (Rate Limits)
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const chunk = chunks[i];
        
        // Add context to system instruction if chunked
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
        // Add a polite delay between chunks to avoid flooding the API (Rate Limits)
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