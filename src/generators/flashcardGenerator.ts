import axios from "axios";
import { Flashcard, ProcessedDocument } from "../types";
import { v4 as uuid } from "../utils/uuid";

function heuristicFlashcards(text: string, keywords: { term: string; context: string }[]): Flashcard[] {
    const cards: Flashcard[] = [];

    const defPatterns = [
        /([A-Z][a-zA-Z\s]{2,40})\s+(?:is|are|refers to|can be defined as|means?)\s+([^.!?]{20,200}[.!?])/g,
        /([A-Z][a-zA-Z\s]{2,30})\s*:\s*([^.!?\n]{20,200}[.!?])/g,
    ];

    for (const pattern of defPatterns) {
        let m;
        while ((m = pattern.exec(text)) !== null && cards.length < 15) {
            const term = m[1].trim();
            const def = m[2].trim();
            if (term.split(" ").length <= 6 && def.length > 20) {
                cards.push({
                    id: uuid(),
                    question: `What is ${term}?`,
                    answer: def,
                    concept: term,
                    difficulty: def.length > 100 ? "hard" : "medium",
                    tags: ["definition"],
                    reviewCount: 0,
                    confidence: 70,
                });
            }
        }
    }

    for (const kw of keywords.slice(0, 15)) {
        if (kw.context && kw.context.length > 40) {
            cards.push({
                id: uuid(),
                question: `What is the role of "${kw.term}" in this context?`,
                answer: kw.context,
                concept: kw.term,
                difficulty: "medium",
                tags: ["concept", kw.term],
                reviewCount: 0,
                confidence: 65,
            });
        }
    }

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 60 && s.trim().length < 300);
    for (const s of sentences.slice(0, 10)) {
        const words = s.trim().split(/\s+/);
        if (words.length > 10) {
            const blankIdx = Math.floor(words.length * 0.6);
            const blank = words.slice(blankIdx).join(" ");
            const stem = words.slice(0, blankIdx).join(" ");
            if (blank.length > 10) {
                cards.push({
                    id: uuid(),
                    question: `Complete: "${stem} ___"`,
                    answer: blank,
                    difficulty: "easy",
                    tags: ["completion"],
                    reviewCount: 0,
                    confidence: 75,
                });
            }
        }
    }

    return cards.slice(0, 25);
}

async function aiGenerateFlashcards(text: string, title: string, count: number = 15): Promise<Flashcard[]> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return [];

    const truncated = text.length > 5000 ? text.substring(0, 5000) + "\n[truncated]" : text;

    const prompt = `Generate ${count} high-quality study flashcards from this document titled "${title}".

For each card output EXACTLY this format (one per line, no extra text):
Q: [question]
A: [answer]
D: [easy|medium|hard]
T: [tag1,tag2]

Focus on: key concepts, definitions, important facts, processes, and relationships.
Cover a variety of difficulty levels.

Document:
${truncated}`;

    try {
        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 1500,
                temperature: 0.6,
            },
            { headers: { Authorization: `Bearer ${key}` } }
        );

        const content: string = res.data.choices[0].message.content.trim();
        const cards: Flashcard[] = [];

        const blocks = content.split(/\n(?=Q:)/);
        for (const block of blocks) {
            const qMatch = block.match(/^Q:\s*(.+)/m);
            const aMatch = block.match(/^A:\s*(.+)/m);
            const dMatch = block.match(/^D:\s*(easy|medium|hard)/mi);
            const tMatch = block.match(/^T:\s*(.+)/m);

            if (qMatch && aMatch) {
                cards.push({
                    id: uuid(),
                    question: qMatch[1].trim(),
                    answer: aMatch[1].trim(),
                    difficulty: (dMatch?.[1] as any) || "medium",
                    tags: tMatch ? tMatch[1].split(",").map(t => t.trim()) : ["ai-generated"],
                    reviewCount: 0,
                    confidence: 80,
                });
            }
        }

        return cards;
    } catch (_) {
        return [];
    }
}

export async function generateFlashcards(
    doc: ProcessedDocument,
    keywords: { term: string; context: string }[],
    log: (msg: string) => void
): Promise<Flashcard[]> {
    log("GENERATING FLASHCARDS...");

    const aiCards = await aiGenerateFlashcards(doc.cleanText, doc.title, 20);

    if (aiCards.length > 0) {
        log(`AI FLASHCARDS: ${aiCards.length} generated`);
        return aiCards;
    }

    const hCards = heuristicFlashcards(doc.cleanText, keywords);
    log(`HEURISTIC FLASHCARDS: ${hCards.length} generated`);
    return hCards;
}