import axios from "axios";
import { ProcessedDocument, Section } from "../types";

function extractiveSummary(text: string, sentences: number = 8): string {
    const allSentences = text
        .replace(/\n+/g, " ")
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 40 && s.length < 600);

    if (allSentences.length <= sentences) return allSentences.join(" ");

    const words = text.toLowerCase().split(/\s+/);
    const wordFreq: Record<string, number> = {};
    for (const w of words) wordFreq[w] = (wordFreq[w] || 0) + 1;

    const scored = allSentences.map((s, i) => {
        const ws = s.toLowerCase().split(/\s+/);
        const freqScore = ws.reduce((sum, w) => sum + (wordFreq[w] || 0), 0) / ws.length;
        const posScore = i < 3 ? 3 : i < 6 ? 2 : 1; // first sentences matter more
        const lenScore = s.length > 100 && s.length < 300 ? 2 : 1;
        return { s, score: freqScore * posScore * lenScore, i };
    });

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, sentences)
        .sort((a, b) => a.i - b.i)
        .map(x => x.s)
        .join(" ");
}

function extractKeyPointsHeuristic(text: string): string[] {
    const sentences = text.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/);
    const signalWords = [
        "importantly", "significantly", "key", "main", "primary", "critical",
        "essential", "fundamental", "notably", "conclusion", "therefore", "thus",
        "result", "finding", "demonstrate", "prove", "show", "achieve",
        "novel", "propose", "present", "introduce", "develop", "improve",
        "outperform", "better", "superior", "advantage", "benefit",
    ];

    const keyPoints: string[] = [];
    for (const s of sentences) {
        const lower = s.toLowerCase();
        if (signalWords.some(w => lower.includes(w)) && s.length > 40 && s.length < 400) {
            keyPoints.push(s.trim());
        }
        if (keyPoints.length >= 10) break;
    }

    if (keyPoints.length < 5) {
        const paras = text.split(/\n\n+/);
        for (const p of paras) {
            const first = p.trim().split(/(?<=[.!?])\s+/)[0];
            if (first && first.length > 50) keyPoints.push(first);
            if (keyPoints.length >= 8) break;
        }
    }

    return [...new Set(keyPoints)].slice(0, 10);
}

async function aiSummarize(text: string, title: string, mode: "summary" | "keypoints" | "insights" | "section"): Promise<string> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return "";

    const truncated = text.length > 6000 ? text.substring(0, 6000) + "\n[truncated]" : text;

    const prompts: Record<string, string> = {
        summary: `You are a research assistant. Write a comprehensive 3-5 paragraph summary of this document titled "${title}". Be specific, academic, and cover all major points.\n\n${truncated}`,
        keypoints: `Extract 8-10 key points from this document titled "${title}". Format as a numbered list. Each point should be one clear, specific sentence.\n\n${truncated}`,
        insights: `Extract 5-7 actionable insights from this document titled "${title}". Format as a numbered list. Focus on what a reader should DO or LEARN from this.\n\n${truncated}`,
        section: `Summarize this section in 2-3 sentences:\n\n${truncated}`,
    };

    try {
        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompts[mode] }],
                max_tokens: mode === "summary" ? 600 : 400,
                temperature: 0.5,
            },
            { headers: { Authorization: `Bearer ${key}` } }
        );
        return res.data.choices[0].message.content.trim();
    } catch (_) {
        return "";
    }
}

export async function summarizeDocument(
    doc: ProcessedDocument,
    log: (msg: string) => void
): Promise<{
    summary: string;
    keyPoints: string[];
    actionableInsights: string[];
    sections: Section[];
}> {
    log("GENERATING SUMMARY...");

    const aiSummary = await aiSummarize(doc.cleanText, doc.title, "summary");
    const summary = aiSummary || extractiveSummary(doc.cleanText, 8);
    log(aiSummary ? "AI SUMMARY GENERATED" : "EXTRACTIVE SUMMARY GENERATED");

    log("EXTRACTING KEY POINTS...");
    const aiKeyPoints = await aiSummarize(doc.cleanText, doc.title, "keypoints");
    let keyPoints: string[] = [];
    if (aiKeyPoints) {
        keyPoints = aiKeyPoints.split("\n").filter(l => l.trim() && /^\d+\./.test(l.trim()))
            .map(l => l.replace(/^\d+\.\s*/, "").trim());
        log(`KEY POINTS: ${keyPoints.length} extracted via AI`);
    } else {
        keyPoints = extractKeyPointsHeuristic(doc.cleanText);
        log(`KEY POINTS: ${keyPoints.length} extracted heuristically`);
    }

    log("GENERATING ACTIONABLE INSIGHTS...");
    const aiInsights = await aiSummarize(doc.cleanText, doc.title, "insights");
    let actionableInsights: string[] = [];
    if (aiInsights) {
        actionableInsights = aiInsights.split("\n").filter(l => /^\d+\./.test(l.trim()))
            .map(l => l.replace(/^\d+\.\s*/, "").trim());
    } else {
        actionableInsights = keyPoints.slice(0, 5).map(kp => `Apply: ${kp}`);
    }

    log("SUMMARIZING SECTIONS...");
    const sectionsWithSummaries: Section[] = [];
    for (const section of doc.sections.slice(0, 8)) {
        if (section.content.length > 200) {
            const aiSecSum = await aiSummarize(section.content, section.title, "section");
            sectionsWithSummaries.push({
                ...section,
                summary: aiSecSum || extractiveSummary(section.content, 2),
            });
        } else {
            sectionsWithSummaries.push(section);
        }
    }

    return { summary, keyPoints, actionableInsights, sections: sectionsWithSummaries };
}