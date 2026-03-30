"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownViewProps {
  content: string;
}

export function MarkdownView({ content }: MarkdownViewProps) {
  if (!content.trim()) {
    return (
      <div className="text-sm text-muted-foreground italic py-8 text-center">
        Empty document
      </div>
    );
  }

  return (
    <div className="prose-contract">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
