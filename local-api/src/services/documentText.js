// Best-effort local text extraction for resumes (no external services, no extra dependencies).
import { readFileSync } from "fs";
import { inflateRawSync, inflateSync } from "zlib";
import { extname } from "path";

const MAX_TEXT = 20000;

function unzipEntry(buf, wanted) {
  // locate End Of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  let off = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let n = 0; n < count && off + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28), extraLen = buf.readUInt16LE(off + 30), commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    if (name === wanted) {
      const lhNameLen = buf.readUInt16LE(localOff + 26), lhExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lhNameLen + lhExtraLen;
      const data = buf.subarray(start, start + compSize);
      return method === 0 ? data : inflateRawSync(data);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

export function docxText(buf) {
  const xml = unzipEntry(buf, "word/document.xml");
  if (!xml) return "";
  return xml.toString("utf8")
    .replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, " ").replace(/<w:br\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}

function pdfString(s) {
  return s.replace(/\\([nrtbf()\\]|\d{1,3})/g, (_, c) => {
    if (/\d/.test(c)) return String.fromCharCode(parseInt(c, 8));
    return { n: "\n", r: "\r", t: "\t", b: "", f: "", "(": "(", ")": ")", "\\": "\\" }[c] ?? c;
  });
}

export function pdfText(buf) {
  const latin = buf.toString("latin1");
  const parts = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = streamRe.exec(latin))) {
    let content;
    try { content = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"); } catch { content = m[1]; }
    if (!/BT[\s\S]*?ET/.test(content)) continue;
    for (const bt of content.match(/BT[\s\S]*?ET/g) || []) {
      let line = "";
      for (const op of bt.matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")|(T\*|Td|TD|ET)/g)) {
        if (op[1] !== undefined) line += [...op[1].matchAll(/\(((?:[^()\\]|\\.)*)\)|(-?\d+(?:\.\d+)?)/g)]
          .map((x) => (x[1] !== undefined ? pdfString(x[1]) : Number(x[2]) < -200 ? " " : "")).join("");
        else if (op[2] !== undefined) line += pdfString(op[2]);
        else if (line) { parts.push(line); line = ""; }
      }
      if (line) parts.push(line);
    }
  }
  return parts.join("\n").replace(/[^\x20-\x7E\n -ɏ]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractText(filePath, mimeType = "") {
  const ext = extname(filePath).toLowerCase();
  try {
    const buf = readFileSync(filePath);
    let text = "";
    if (ext === ".txt" || ext === ".md" || mimeType.startsWith("text/")) text = buf.toString("utf8");
    else if (ext === ".docx") text = docxText(buf);
    else if (ext === ".pdf" || mimeType === "application/pdf") text = pdfText(buf);
    return text.slice(0, MAX_TEXT);
  } catch {
    return "";
  }
}
