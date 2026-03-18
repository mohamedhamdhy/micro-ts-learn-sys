import fs from "fs";
import path from "path";
import axios from "axios";

export async function extractFromPDF(filePath: string): Promise<string> {
    try {
        const pdfParse = require("pdf-parse");
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse(buffer);
        return data.text || "";
    } catch (err: any) {
        throw new Error(`PDF extraction failed: ${err.message}`);
    }
}

export async function extractFromDOCX(filePath: string): Promise<string> {
    try {
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value || "";
    } catch (err: any) {
        throw new Error(`DOCX extraction failed: ${err.message}`);
    }
}

export function extractFromTXT(filePath: string): string {
    try {
        return fs.readFileSync(filePath, "utf-8");
    } catch (err: any) {
        throw new Error(`TXT extraction failed: ${err.message}`);
    }
}

export async function extractFromURL(url: string): Promise<string> {
    try {
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; LearnsysBot/1.0)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            timeout: 15000,
            maxRedirects: 5,
        });

        const html: string = res.data;

        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
            .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, " ")
            .replace(/<(p|h[1-6]|li|td|th|blockquote|pre|code)[^>]*>/gi, "\n")
            .replace(/<\/?(p|h[1-6]|li|td|th|blockquote|pre|code|div|section|article)[^>]*>/gi, "\n")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&[a-z]+;/gi, " ");

        text = text.split("\n")
            .map(l => l.trim())
            .filter(l => l.length > 20)
            .join("\n");

        return text;
    } catch (err: any) {
        throw new Error(`URL extraction failed: ${err.message}`);
    }
}

export async function extractText(
    source: string,
    sourceType: "pdf" | "docx" | "txt" | "url" | "markdown"
): Promise<string> {
    switch (sourceType) {
        case "pdf": return extractFromPDF(source);
        case "docx": return extractFromDOCX(source);
        case "txt":
        case "markdown": return extractFromTXT(source);
        case "url": return extractFromURL(source);
        default: throw new Error(`Unknown source type: ${sourceType}`);
    }
}

export function detectSourceType(source: string): "pdf" | "docx" | "txt" | "url" | "markdown" {
    if (source.startsWith("http://") || source.startsWith("https://")) return "url";
    const ext = path.extname(source).toLowerCase();
    if (ext === ".pdf") return "pdf";
    if (ext === ".docx") return "docx";
    if (ext === ".md") return "markdown";
    return "txt";
}