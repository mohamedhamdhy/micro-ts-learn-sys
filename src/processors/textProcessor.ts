import { Section, Keyword, Citation, ProcessedDocument } from "../types";
import { v4 as uuid } from "../utils/uuid";

export function cleanText(raw: string): string {
    let text = raw;
    text = text.replace(/^\s*\d+\s*$/gm, "");
    text = text.replace(/^(page\s+\d+|chapter\s+\d+|\d+\s+of\s+\d+)$/gim, "");
    text = text.replace(/https?:\/\/[^\s)]+/g, "[URL]");
    text = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
    text = text.replace(/[\u2013\u2014]/g, "-");
    text = text.replace(/\.{4,}/g, "...");
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    text = text.replace(/\n{4,}/g, "\n\n\n");
    text = text.replace(/[ \t]{3,}/g, "  ");
    text = text.split("\n")
        .filter(line => {
            const t = line.trim();
            if (t.length === 0) return true;
            if (t.length < 3 && /^[^a-zA-Z0-9]/.test(t)) return false;
            if (/^[=\-_*~]{3,}$/.test(t)) return false;
            return true;
        })
        .join("\n");

    return text.trim();
}

export function detectSections(text: string): Section[] {
    const lines = text.split("\n");
    const sections: Section[] = [];

    const headingRegex = /^(#{1,4}\s+.+|[A-Z][A-Z\s]{5,50}:?\s*$|\d+\.\s+[A-Z].{3,60}$)/;

    let currentTitle = "Introduction";
    let currentLines: string[] = [];

    for (const line of lines) {
        if (headingRegex.test(line.trim()) && line.trim().length < 100) {
            if (currentLines.join("").trim().length > 50) {
                const content = currentLines.join("\n").trim();
                sections.push({
                    title: currentTitle,
                    content,
                    wordCount: content.split(/\s+/).filter(Boolean).length,
                });
            }
            currentTitle = line.trim().replace(/^#+\s*/, "").replace(/:$/, "");
            currentLines = [];
        } else {
            currentLines.push(line);
        }
    }

    if (currentLines.join("").trim().length > 50) {
        const content = currentLines.join("\n").trim();
        sections.push({
            title: currentTitle,
            content,
            wordCount: content.split(/\s+/).filter(Boolean).length,
        });
    }

    if (sections.length <= 1) {
        const paras = text.split(/\n\n+/).filter(p => p.trim().length > 100);
        return paras.slice(0, 20).map((p, i) => ({
            title: `Section ${i + 1}`,
            content: p.trim(),
            wordCount: p.split(/\s+/).filter(Boolean).length,
        }));
    }

    return sections.slice(0, 30);
}

export function extractKeywords(text: string): Keyword[] {
    const stopWords = new Set([
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "will", "would",
        "could", "should", "may", "might", "shall", "can", "this", "that",
        "these", "those", "it", "its", "we", "they", "their", "our", "as",
        "if", "then", "than", "when", "where", "which", "who", "what", "how",
        "not", "no", "so", "such", "also", "each", "both", "all", "any",
        "more", "most", "other", "some", "into", "through", "about", "between",
        "after", "before", "during", "while", "although", "because", "since",
        "use", "used", "using", "based", "paper", "study", "research", "result",
        "results", "method", "methods", "approach", "proposed", "show", "shows",
        "shown", "data", "model", "models", "system", "systems", "new", "work",
    ]);

    const words = text.toLowerCase()
        .replace(/[^a-z0-9\s\-]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w) && !/^\d+$/.test(w));

    const freq: Record<string, number> = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;

    const rawWords = text.replace(/[^a-zA-Z0-9\s\-]/g, " ").split(/\s+/).filter(w => w.length > 2);
    for (let i = 0; i < rawWords.length - 1; i++) {
        const w1 = rawWords[i].toLowerCase();
        const w2 = rawWords[i + 1].toLowerCase();
        if (!stopWords.has(w1) && !stopWords.has(w2) && w1.length > 3 && w2.length > 3) {
            const bigram = `${w1} ${w2}`;
            freq[bigram] = (freq[bigram] || 0) + 1;
        }
    }

    const totalWords = words.length;
    const sorted = Object.entries(freq)
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30);

    return sorted.map(([term, frequency]) => {
        const sentences = text.split(/[.!?]+/);
        const ctx = sentences.find(s => s.toLowerCase().includes(term))?.trim().substring(0, 150) || "";

        return {
            term,
            frequency,
            importance: Math.min(100, Math.round((frequency / totalWords) * 5000 + Math.min(50, frequency * 2))),
            context: ctx,
        };
    });
}

export function extractCitations(text: string): Citation[] {
    const citations: Citation[] = [];
    const lines = text.split("\n");

    const refSectionIdx = lines.findIndex(l =>
        /^(references|bibliography|works cited|sources)\s*$/i.test(l.trim())
    );

    const refLines = refSectionIdx > -1 ? lines.slice(refSectionIdx + 1) : [];

    const numberedRef = /^\[?\d+\]?\s+(.+)/;
    for (const line of refLines) {
        const m = line.trim().match(numberedRef);
        if (m && m[1].length > 20) {
            const raw = m[1].trim();
            const yearMatch = raw.match(/\b(19|20)\d{2}\b/);
            citations.push({
                authors: raw.split(/[,;]/)[0]?.trim() || "",
                title: raw.split(/[,;]/)[1]?.trim() || raw.substring(0, 80),
                year: yearMatch?.[0],
                raw,
            });
        }
    }

    const inlineRegex = /([A-Z][a-zA-Z]+(?:\s+et\s+al\.?)?)\s*\((\d{4})\)/g;
    let match;
    while ((match = inlineRegex.exec(text)) !== null && citations.length < 30) {
        if (!citations.some(c => c.raw.includes(match[0]))) {
            citations.push({
                authors: match[1],
                title: "",
                year: match[2],
                raw: match[0],
            });
        }
    }

    return citations.slice(0, 25);
}

function detectLanguage(text: string): string {
    const sample = text.substring(0, 1000).toLowerCase();
    const enWords = ["the", "and", "of", "to", "a", "in", "is", "that"];
    const enCount = enWords.filter(w => sample.includes(` ${w} `)).length;
    return enCount >= 4 ? "English" : "Unknown";
}

export function processDocument(
    rawText: string,
    title: string,
    source: string,
    sourceType: "pdf" | "docx" | "txt" | "url" | "markdown"
): ProcessedDocument {
    const cleanedText = cleanText(rawText);
    const sections = detectSections(cleanedText);
    const wordCount = cleanedText.split(/\s+/).filter(Boolean).length;

    return {
        id: uuid(),
        title,
        source,
        sourceType,
        rawText,
        cleanText: cleanedText,
        sections,
        wordCount,
        charCount: cleanedText.length,
        language: detectLanguage(cleanedText),
        processedAt: new Date().toISOString(),
    };
}