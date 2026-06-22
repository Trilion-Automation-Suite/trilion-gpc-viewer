/**
 * Extract plain text from a completed EUC file — entirely in the browser.
 * .docx is unzipped with JSZip (already a dependency) and read via DOMParser.
 * .pdf is read with pdfjs-dist. Nothing is uploaded.
 */

async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const docFile = zip.file('word/document.xml')
  if (!docFile) return ''
  const xml = await docFile.async('string')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const paras = doc.getElementsByTagName('w:p')
  const lines: string[] = []
  for (let i = 0; i < paras.length; i++) {
    const texts = paras[i].getElementsByTagName('w:t')
    let line = ''
    for (let j = 0; j < texts.length; j++) line += texts[j].textContent || ''
    if (line.trim()) lines.push(line)
  }
  // Fallback: if no <w:p> structure, grab all <w:t>
  if (!lines.length) {
    const texts = doc.getElementsByTagName('w:t')
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i].textContent || ''
      if (t.trim()) lines.push(t)
    }
  }
  return lines.join('\n')
}

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  // Bundle the worker through Vite and point pdf.js at it.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  let out = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    out += content.items
      .map((it) => ('str' in it ? (it as { str: string }).str : ''))
      .join(' ') + '\n'
  }
  return out
}

export async function parseEucDoc(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) return extractDocxText(buffer)
  if (name.endsWith('.pdf')) return extractPdfText(buffer)
  // last resort: treat as text
  return new TextDecoder().decode(buffer)
}
