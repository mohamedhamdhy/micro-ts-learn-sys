import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import multer from "multer";
import dotenv from "dotenv";

import { extractText, detectSourceType } from "./extractors/textExtractor";
import { processDocument, extractKeywords, extractCitations } from "./processors/textProcessor";
import { summarizeDocument } from "./generators/summarizer";
import { generateFlashcards } from "./generators/flashcardGenerator";
import {
    generateMarkdownReport, generateCSVFlashcards,
    generateAnkiExport, generateQuizletExport,
    calcReadabilityScore, calcComplexityScore
} from "./reporters/reportGenerator";
import { saveToLibrary, loadLibrary, getReport, deleteFromLibrary } from "./library";
import { ResearchReport } from "./types";
import { v4 as uuid } from "./utils/uuid";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, "../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (_req, file, cb) => {
        const allowed = [".pdf", ".docx", ".txt", ".md"];
        const ext = path.extname(file.originalname).toLowerCase();
        allowed.includes(ext) ? cb(null, true) : cb(new Error(`File type ${ext} not supported`));
    },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

async function runPipeline(
    source: string,
    sourceType: "pdf" | "docx" | "txt" | "url" | "markdown",
    title: string,
    res: any,
    log: (msg: string) => void
): Promise<void> {
    log(`SOURCE: ${source}`);
    log(`TYPE: ${sourceType.toUpperCase()}`);

    log("EXTRACTING TEXT...");
    const rawText = await extractText(source, sourceType);
    log(`EXTRACTED: ${rawText.length.toLocaleString()} characters`);

    if (rawText.length < 100) throw new Error("Extracted text is too short — check the source.");

    log("CLEANING & PROCESSING TEXT...");
    const doc = processDocument(rawText, title, source, sourceType);
    log(`PROCESSED: ${doc.wordCount.toLocaleString()} words · ${doc.sections.length} sections detected`);

    const { summary, keyPoints, actionableInsights, sections } = await summarizeDocument(doc, log);

    log("EXTRACTING KEYWORDS...");
    const keywords = extractKeywords(doc.cleanText);
    log(`KEYWORDS: ${keywords.length} extracted`);

    log("EXTRACTING CITATIONS...");
    const citations = extractCitations(doc.cleanText);
    log(`CITATIONS: ${citations.length} found`);

    const flashcards = await generateFlashcards(doc, keywords, log);

    const readabilityScore = calcReadabilityScore(doc.cleanText);
    const complexityScore = calcComplexityScore(doc.cleanText, keywords);

    log("BUILDING REPORT...");
    const report: ResearchReport = {
        id: uuid(),
        documentId: doc.id,
        title,
        source,
        sourceType,
        wordCount: doc.wordCount,
        processedAt: doc.processedAt,
        summary,
        keyPoints,
        actionableInsights,
        keywords,
        citations,
        flashcards,
        sections,
        readabilityScore,
        complexityScore,
        citationCount: citations.length,
        markdownReport: "",
        csvFlashcards: "",
        ankiExport: "",
    };

    report.markdownReport = generateMarkdownReport(report);
    report.csvFlashcards = generateCSVFlashcards(flashcards);
    report.ankiExport = generateAnkiExport(flashcards, title);

    log("SAVING TO LIBRARY...");
    saveToLibrary(report);

    log("TRANSMITTING TO DASHBOARD...");
    io.emit("report-ready", report);

    log("──────────────────────────────────────");
    log(`✅ COMPLETE — ${flashcards.length} flashcards · ${keywords.length} keywords · ${citations.length} citations`);
}

app.post("/process-url", async (req, res) => {
    const { url } = req.body;
    if (!url) { res.status(400).json({ error: "No URL provided" }); return; }

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    const log = (msg: string) => { res.write(msg + "\n"); console.log(`[LEARNSYS] ${msg}`); };

    try {
        const title = url.split("/").filter(Boolean).pop()?.replace(/[_-]/g, " ") || "Web Article";
        await runPipeline(url, "url", title, res, log);
    } catch (err: any) {
        log(`❌ ERROR: ${err.message}`);
    }
    res.end("DONE");
});

app.post("/process-file", upload.single("file"), async (req, res) => {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    const log = (msg: string) => { res.write(msg + "\n"); console.log(`[LEARNSYS] ${msg}`); };

    try {
        const sourceType = detectSourceType(req.file.originalname);
        const title = path.basename(req.file.originalname, path.extname(req.file.originalname))
            .replace(/[_-]/g, " ");
        await runPipeline(req.file.path, sourceType, title, res, log);
    } catch (err: any) {
        log(`❌ ERROR: ${err.message}`);
    } finally {
        try { fs.unlinkSync(req.file!.path); } catch (_) { }
    }
    res.end("DONE");
});

app.post("/process-text", async (req, res) => {
    const { text, title } = req.body;
    if (!text) { res.status(400).json({ error: "No text provided" }); return; }

    const tmpPath = path.join(UPLOAD_DIR, `paste-${Date.now()}.txt`);
    fs.writeFileSync(tmpPath, text);

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    const log = (msg: string) => { res.write(msg + "\n"); console.log(`[LEARNSYS] ${msg}`); };

    try {
        await runPipeline(tmpPath, "txt", title || "Pasted Text", res, log);
    } catch (err: any) {
        log(`❌ ERROR: ${err.message}`);
    } finally {
        try { fs.unlinkSync(tmpPath); } catch (_) { }
    }
    res.end("DONE");
});

app.get("/library", (_req, res) => {
    res.json(loadLibrary());
});

app.get("/report/:id", (req, res) => {
    const report = getReport(req.params.id);
    if (!report) { res.status(404).json({ error: "Report not found" }); return; }
    res.json(report);
});

app.delete("/library/:id", (req, res) => {
    deleteFromLibrary(req.params.id);
    res.json({ success: true });
});

app.post("/download", (req, res) => {
    const { content, filename, mime } = req.body;
    if (!content) { res.status(400).send("No content"); return; }
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", mime || "text/plain");
    res.send(content);
});

io.on("connection", () => console.log("[LEARNSYS] Dashboard connected"));

server.listen(PORT, () => console.log(`[LEARNSYS] Server → http://localhost:${PORT}`));