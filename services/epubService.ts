
import JSZip from 'jszip';
import TurndownService from 'turndown';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Chapter } from '../types';

// Initialize Markdown converters
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// Custom Rule: Flatten Headings
// Fixes issue where <h1>2<br/>Title</h1> becomes invalid broken markdown.
// Converts newlines inside headers to spaces to ensure valid "# Title" format.
turndownService.addRule('flattenHeader', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement: function (content, node, options) {
    const hLevel = Number(node.nodeName.charAt(1));
    const hashes = '#'.repeat(hLevel);
    
    // Replace newlines (often from <br> tags) with spaces, remove excessive whitespace
    const cleanContent = content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    return `\n\n${hashes} ${cleanContent}\n\n`;
  }
});

// Helper to escape XML characters for OPF and NCX files
const escapeXml = (unsafe: string): string => {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

// Elegant Chinese Typography CSS
// Adapted to match specific aesthetic requirements (colors, fonts, alignment)
// Font sizes updated to match reference: Headers ~1.3em, large margins.
const CHINESE_EPUB_CSS = `
  @charset "UTF-8";
  
  /* 基础排版：优先使用小标宋、宋体，优化中文对齐 */
  body {
    font-family: "ZY-XIAOBIAOSONG", "Songti SC", "SimSun", "STSong", "Times New Roman", serif;
    font-size: 1em;
    line-height: 1.8em;
    text-align: justify;
    text-justify: inter-ideograph;
    word-break: break-all;
    padding: 0 3%;
    color: #333;
    margin: 0;
  }

  /* 标题：参考配色 #2e5b60 (Teal)，字体 FZQYS/小标宋，不加粗 */
  /* 字号调整：H1 接近参考样式的 1.29167em，使用 1.3em */
  h1, h2, h3, h4, h5, h6 {
    font-family: "fzqys", "ZY-XIAOBIAOSONG", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-weight: normal;
    color: #2e5b60;
    text-align: center;
    margin-top: 1em;
    margin-bottom: 2.2em; /* 增加下方留白，参考样式为 2.2em */
    line-height: 1.6;
  }

  h1 { 
    font-size: 1.3em; 
    border-bottom: 1px dotted #A2906A;
    padding-bottom: 0.6em; 
  }
  
  h2 { font-size: 1.15em; }
  h3 { font-size: 1.1em; }

  /* 段落：严格首行缩进 */
  p {
    text-indent: 2em;
    margin: 0.5em 0; /* 减小段间距，让行距(line-height)主导视觉 */
    line-height: 1.8em;
    text-align: justify;
    text-justify: inter-ideograph;
  }

  /* 引用：使用仿宋体，深紫褐色 (#412938)，字号保持 1em */
  blockquote {
    font-family: "fs2", "ZY-FANGSONG", "FangSong", "KaiTi", serif;
    font-size: 1em;
    margin: 1.8em 1em;
    padding: 0; /* 取消 padding，依靠 text-indent */
    text-indent: 2em;
    color: #412938;
    border: none;
    background: none;
  }
  
  /* 分割线：点状线，古铜色 (#A2906A) */
  hr {
    border: 0;
    border-top: 1px dotted #A2906A;
    margin: 2em auto;
    width: 60%;
    color: #A2906A;
    background-color: transparent;
    height: 1px;
  }
  
  /* 列表 */
  ul, ol {
    margin: 1em 0 1em 2em;
    padding: 0;
  }
  
  li {
    margin-bottom: 0.3em;
  }

  /* 图片 */
  img {
    display: block;
    margin: 1.5em auto;
    max-width: 100%;
    height: auto;
    border-radius: 2px;
  }
  
  /* 代码块 */
  pre, code {
    font-family: "Consolas", "Monaco", monospace;
    background-color: #f5f5f5;
    padding: 0.2em;
    border-radius: 3px;
    font-size: 0.9em;
    color: #d63384;
  }
  
  /* 链接 */
  a {
    color: #2e5b60;
    text-decoration: none;
    border-bottom: 1px dashed #2e5b60;
  }
`;

// Standard CSS for Western Languages (English, etc.)
const DEFAULT_EPUB_CSS = `
  @charset "UTF-8";
  
  body {
    font-family: "Times New Roman", serif;
    line-height: 1.6;
    padding: 0 3%;
    color: #333;
    margin: 0;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: Helvetica, Arial, sans-serif;
    font-weight: bold;
    color: #1a1a1a;
    text-align: center;
    margin-top: 1.5em;
    margin-bottom: 1em;
  }
  
  h1 { border-bottom: 1px solid #eee; padding-bottom: 0.5em; }

  /* Western paragraphs usually use margin spacing, not indentation */
  p {
    text-indent: 0;
    margin-bottom: 1.2em;
    margin-top: 0;
  }

  blockquote {
    border: none;
    margin: 1em 2em;
    padding: 0;
    color: inherit;
    font-style: italic;
  }

  img {
    display: block;
    margin: 1.5em auto;
    max-width: 100%;
    height: auto;
  }

  code, pre {
    font-family: monospace;
    background: #f4f4f4;
    padding: 0.2em;
  }
`;

export class EpubService {
  /**
   * Parses an EPUB file (zip), identifies the spine, and extracts chapters as Markdown.
   * Also attempts to identify the cover image.
   */
  async parseEpub(file: File): Promise<{ chapters: Chapter[], images: Record<string, Blob>, coverPath?: string }> {
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(file);

    // 1. Find container.xml to locate the OPF
    const containerFile = loadedZip.file("META-INF/container.xml");
    if (!containerFile) throw new Error("Invalid EPUB: Missing META-INF/container.xml");
    
    const containerXml = await containerFile.async("string");
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, "application/xml");
    const rootfileNode = containerDoc.querySelector("rootfile");
    
    if (!rootfileNode) throw new Error("Invalid EPUB: Missing rootfile in container.xml");
    const opfPath = rootfileNode.getAttribute("full-path");
    if (!opfPath) throw new Error("Invalid EPUB: rootfile missing full-path");

    // 2. Parse OPF to get manifest and spine
    const opfFile = loadedZip.file(opfPath);
    if (!opfFile) throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}`);
    
    const opfXml = await opfFile.async("string");
    const opfDoc = parser.parseFromString(opfXml, "application/xml");
    
    // Resolve base path for relative URLs
    const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

    // Get Manifest items
    const manifestItems = Array.from(opfDoc.querySelectorAll("manifest > item")).reduce((acc, item) => {
      acc[item.getAttribute("id")!] = item.getAttribute("href")!;
      return acc;
    }, {} as Record<string, string>);

    // Get Spine order
    const spineRefs = Array.from(opfDoc.querySelectorAll("spine > itemref"));
    
    // Attempt to find Cover Image ID
    // Priority 1: <meta name="cover" content="item-id" />
    let coverId = opfDoc.querySelector('meta[name="cover"]')?.getAttribute('content');

    // Priority 2: <item properties="cover-image" ... />
    if (!coverId) {
        const coverItem = opfDoc.querySelector('manifest > item[properties~="cover-image"]');
        if (coverItem) {
            coverId = coverItem.getAttribute('