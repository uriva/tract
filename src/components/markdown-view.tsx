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
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children, ...props }) => <p {...props} dir="auto">{children}</p>,
          h1: ({ children, ...props }) => <h1 {...props} dir="auto">{children}</h1>,
          h2: ({ children, ...props }) => <h2 {...props} dir="auto">{children}</h2>,
          h3: ({ children, ...props }) => <h3 {...props} dir="auto">{children}</h3>,
          h4: ({ children, ...props }) => <h4 {...props} dir="auto">{children}</h4>,
          h5: ({ children, ...props }) => <h5 {...props} dir="auto">{children}</h5>,
          h6: ({ children, ...props }) => <h6 {...props} dir="auto">{children}</h6>,
          li: ({ children, ...props }) => <li {...props} dir="auto">{children}</li>,
          ol: ({ children, ...props }) => <ol {...props} dir="auto">{children}</ol>,
          ul: ({ children, ...props }) => <ul {...props} dir="auto">{children}</ul>,
          blockquote: ({ children, ...props }) => <blockquote {...props} dir="auto">{children}</blockquote>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
