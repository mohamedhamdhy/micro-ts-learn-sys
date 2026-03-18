import fs from "fs";
import path from "path";
import { LibraryEntry, ResearchReport } from "./types";

const LIBRARY_PATH = path.join(__dirname, "../library/index.json");
const REPORTS_DIR = path.join(__dirname, "../library/reports");

function ensureDirs() {
    if (!fs.existsSync(path.dirname(LIBRARY_PATH))) fs.mkdirSync(path.dirname(LIBRARY_PATH), { recursive: true });
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

export function loadLibrary(): LibraryEntry[] {
    ensureDirs();
    try {
        if (fs.existsSync(LIBRARY_PATH)) {
            return JSON.parse(fs.readFileSync(LIBRARY_PATH, "utf-8"));
        }
    } catch (_) { }
    return [];
}

export function saveToLibrary(report: ResearchReport): void {
    ensureDirs();
    const entries = loadLibrary();

    const grade = report.readabilityScore >= 70 ? "A"
        : report.readabilityScore >= 55 ? "B"
            : report.readabilityScore >= 40 ? "C" : "D";

    const entry: LibraryEntry = {
        id: report.id,
        title: report.title,
        source: report.source,
        sourceType: report.sourceType,
        summary: report.summary.substring(0, 300) + "...",
        keywords: report.keywords.slice(0, 8).map(k => k.term),
        wordCount: report.wordCount,
        flashcardCount: report.flashcards.length,
        processedAt: report.processedAt,
        grade,
        reportId: report.id,
    };

    const idx = entries.findIndex(e => e.source === report.source);
    if (idx > -1) entries[idx] = entry;
    else entries.unshift(entry);

    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(entries.slice(0, 200), null, 2));

    fs.writeFileSync(
        path.join(REPORTS_DIR, `${report.id}.json`),
        JSON.stringify(report, null, 2)
    );
}

export function getReport(id: string): ResearchReport | null {
    ensureDirs();
    try {
        const p = path.join(REPORTS_DIR, `${id}.json`);
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch (_) { }
    return null;
}

export function deleteFromLibrary(id: string): void {
    ensureDirs();
    const entries = loadLibrary().filter(e => e.id !== id);
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(entries, null, 2));
    try { fs.unlinkSync(path.join(REPORTS_DIR, `${id}.json`)); } catch (_) { }
}