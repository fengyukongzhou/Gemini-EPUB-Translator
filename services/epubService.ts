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

// Elegant Chinese Typography CSS
const CHINESE_EPUB_CSS = `
  @charset "UTF-8";
  
  /* 基础排版：衬线体适合长文阅读 */
  body {
    font-family: "Songti SC", "SimSun", "STSong", "Times New Roman", serif;
    line-height: 1.8;
    text-align: justify;
    padding: 0 3%;
    color: #333;
    margin: 0;
  }

  /* 标题：黑体，居中，留白 */
  h1, h2, h3, h4, h5, h6 {
    font-family: "PingFang SC", "Microsoft YaHei", "Source Han Sans CN", sans-serif;
    font-weight: bold;
    color: #1a1a1a;
    text-align: center;
    margin-top: 1.5em;
    margin-bottom: 0.8em;
    line-height: 1.4;
  }

  h1 { font-size: 1.6em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
  h2 { font-size: 1.4em; }
  h3 { font-size: 1.2em; }

  /* 段落：中文习惯，首行缩进两个字符 */
  p {
    text-indent: 2em;
    margin-bottom: 0.5em;
    margin-top: 0;
  }

  /* 引用：楷体，灰色，左侧边框 */
  blockquote {
    font-family: "KaiTi", "KaiTi_GB2312", "STKaiti", serif;
    margin: 1em 1em;
    padding: 0.6em 1em;
    border-left: 4px solid #ddd;
    color: #555;
    background-color: #f9f9f9;
  }
  
  /* 列表：取消缩进，保持整洁 */
  ul, ol {
    margin: 1em 0 1em 2em;
    padding: 0;
  }
  
  li {
    margin-bottom: 0.3em;
  }

  /* 图片：居中，圆角，阴影 */
  img {
    display: block;
    margin: 1.5em auto;
    max-width: 100%;
    height: auto;
    border-radius: 3px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
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
  
  /* 粗体优化 */
  strong, b {
    color: #000;
    font-weight: 600;
  }
  
  /* 链接 */
  a {
    color: #0066cc;
    text-decoration: none;
    border-bottom: 1px dashed #0066cc;
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
    border-left: 3px solid #ccc;
    margin: 1em 2em;
    padding-left: 1em;
    color: #555;
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
   */
  async parseEpub(file: File): Promise<{ chapters: Chapter[], images: Record<string, Blob> }> {
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
    
    const chapters: Chapter[] = [];
    const images: Record<string, Blob> = {};

    // 3. Extract Images (Simulated copy - collecting blobs)
    // We iterate through all files in zip to find images.
    for (const [path, fileObj] of Object.entries(loadedZip.files)) {
      if (path.match(/\.(png|jpe?g|gif|svg|webp)$/i)) {
        // Cast fileObj to any to fix TS error
        const blob = await (fileObj as any).async("blob");
        images[path] = blob;
      }
    }

    // 4. Extract Text Content
    for (const ref of spineRefs) {
      const id = ref.getAttribute("idref");
      if (!id || !manifestItems[id]) continue;
      
      const href = manifestItems[id];
      const fullPath = opfDir + href;
      const fileObj = loadedZip.file(fullPath);
      
      if (fileObj) {
        const htmlContent = await fileObj.async("string");
        // Convert to Markdown
        // We strip scripts and styles before conversion
        const cleanHtml = DOMPurify.sanitize(htmlContent, { 
            WHOLE_DOCUMENT: true,
            FORBID_TAGS: ['style', 'script', 'link'] 
        });
        
        // Use DOMParser to get a title if possible
        const doc = parser.parseFromString(htmlContent, "text/html");
        const title = doc.querySelector("title")?.textContent || `Chapter ${chapters.length + 1}`;
        
        // Convert body to markdown
        const bodyContent = doc.body.innerHTML;
        const markdown = turndownService.turndown(bodyContent);

        chapters.push({
          id,
          fileName: href,
          title,
          content: htmlContent, // Original HTML
          markdown: markdown
        });
      }
    }

    return { chapters, images };
  }

  /**
   * Generates a new EPUB file from the translated markdown.
   * This implementation flattens image structures to ensure compatibility.
   */
  async generateEpub(
    chapters: Chapter[], 
    originalImages: Record<string, Blob>, 
    title: string,
    targetLanguage: string = "English" // Added parameter to determine CSS
  ): Promise<Blob> {
    const zip = new JSZip();

    // Determine which CSS to use
    const isChinese = targetLanguage.toLowerCase().includes('chinese');
    const cssToUse = isChinese ? CHINESE_EPUB_CSS : DEFAULT_EPUB_CSS;

    // 1. Mimetype (must be first, uncompressed)
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    // 2. Container XML
    zip.file("META-INF/container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
   <rootfiles>
      <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
   </rootfiles>
</container>`);

    // 3. Add Images (Flattened to 'images/' folder)
    // We extract the filename from the original path and save it to a unified 'images/' folder.
    // This simplifies path resolution in the generated HTML.
    const processedImageNames = new Set<string>();
    
    for (const [path, blob] of Object.entries(originalImages)) {
      const fileName = path.split('/').pop(); // Get just 'cover.jpg' from 'OEBPS/images/cover.jpg'
      if (fileName && !processedImageNames.has(fileName)) {
        zip.file(`images/${fileName}`, blob);
        processedImageNames.add(fileName);
      }
    }

    // 4. Generate HTML files from Translated Markdown
    let manifestItems = '';
    let spineItems = '';
    let navPoints = '';

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const contentToUse = ch.proofreadMarkdown || ch.translatedMarkdown || ch.markdown || "";
      
      // Convert Markdown back to HTML
      let htmlBody = await marked(contentToUse);
      
      // FIX: Rewrite image sources to point to the flattened 'images/' folder
      // Matches src="anything/filename.jpg" and replaces with src="images/filename.jpg"
      htmlBody = htmlBody.replace(/src="([^"]+)"/g, (match, srcPath) => {
        // Skip http/https links
        if (srcPath.startsWith('http') || srcPath.startsWith('//')) return match;
        
        const fileName = srcPath.split('/').pop();
        if (fileName) {
          return `src="images/${fileName}"`;
        }
        return match;
      });

      const fullHtml = `<?xml version='1.0' encoding='utf-8'?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <title>${ch.title}</title>
  <style>
${cssToUse}
  </style>
</head>
<body>
${htmlBody}
</body>
</html>`;

      // CHANGED: Use page_N.xhtml naming convention
      const fileName = `page_${i + 1}.xhtml`;
      zip.file(fileName, fullHtml);

      const id = `ch${i+1}`;
      manifestItems += `<item id="${id}" href="${fileName}" media-type="application/xhtml+xml"/>\n`;
      spineItems += `<itemref idref="${id}"/>\n`;
      
      navPoints += `<navPoint id="nav${i+1}" playOrder="${i+1}">
        <navLabel><text>${ch.title}</text></navLabel>
        <content src="${fileName}"/>
      </navPoint>\n`;
    }

    // 5. Create content.opf
    const opfContent = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uuid_id" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title} (Translated)</dc:title>
    <dc:language>${isChinese ? 'zh' : 'en'}</dc:language>
    <dc:identifier id="uuid_id" opf:scheme="uuid">${crypto.randomUUID()}</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${manifestItems}
  </manifest>
  <spine toc="ncx">
    ${spineItems}
  </spine>
</package>`;

    zip.file("content.opf", opfContent);

    // 6. Create toc.ncx
    const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:12345"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>
    ${navPoints}
  </navMap>
</ncx>`;
    
    zip.file("toc.ncx", ncxContent);

    // 7. Generate Blob
    return await zip.generateAsync({ type: "blob" });
  }
}