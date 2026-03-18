export interface Flashcard {
    id: string;
    question: string;
    answer: string;
    concept?: string;
    difficulty: "easy" | "medium" | "hard";
    tags: string[];
    nextReview?: string;
    reviewCount: number;
    confidence: number;
}

export interface Keyword {
    term: string;
    frequency: number;
    importance: number;
    context: string;
}

export interface Citation {
    authors: string;
    title: string;
    year?: string;
    source?: string;
    raw: string;
}

export interface Section {
    title: string;
    content: string;
    wordCount: number;
    summary?: string;
}

export interface ProcessedDocument {
    id: string;
    title: string;
    source: string;
    sourceType: "pdf" | "docx" | "txt" | "url" | "markdown";
    rawText: string;
    cleanText: string;
    sections: Section[];
    wordCount: number;
    charCount: number;
    language: string;
    processedAt: string;
}

export interface ResearchReport {
    id: string;
    documentId: string;
    title: string;
    source: string;
    sourceType: string;
    wordCount: number;
    processedAt: string;
    summary: string;
    keyPoints: string[];
    actionableInsights: string[];
    keywords: Keyword[];
    citations: Citation[];
    flashcards: Flashcard[];
    sections: Section[];
    readabilityScore: number;
    complexityScore: number;
    citationCount: number;
    markdownReport: string;
    csvFlashcards: string;
    ankiExport: string;
}

export interface LibraryEntry {
    id: string;
    title: string;
    source: string;
    sourceType: string;
    summary: string;
    keywords: string[];
    wordCount: number;
    flashcardCount: number;
    processedAt: string;
    grade: string;
    reportId: string;
}