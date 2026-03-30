"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface TractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractName: string;
  currentContent: string;
  onCommit: (content: string, message: string) => Promise<void>;
}

export function TractDialog({
  open,
  onOpenChange,
  contractName,
  currentContent,
  onCommit,
}: TractDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [error, setError] = useState("");

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setPreview(null);

    try {
      const res = await fetch("/api/tract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: currentContent,
          prompt: prompt.trim(),
          contractName,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate");
      }

      const data = await res.json();
      setPreview(data.content);
      setCommitMsg(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    if (!preview) return;
    setLoading(true);
    try {
      await onCommit(preview, commitMsg);
      setPrompt("");
      setPreview(null);
      setCommitMsg("");
      onOpenChange(false);
    } catch {
      setError("Failed to create commit");
    } finally {
      setLoading(false);
    }
  }

  function handleClose(val: boolean) {
    if (!val) {
      setPrompt("");
      setPreview(null);
      setCommitMsg("");
      setError("");
    }
    onOpenChange(val);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-accent), color-mix(in oklch, var(--color-accent) 60%, #6d9eeb))",
                color: "white",
              }}
            >
              T
            </span>
            Ask Tract
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Prompt input */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              Describe the changes you want
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='e.g. "Add a termination clause with 30-day notice" or "Make the payment terms net-60 instead of net-30"'
              className="min-h-[80px] resize-y"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey) handleGenerate();
              }}
              disabled={loading}
              autoFocus
            />
            {!preview && (
              <Button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                size="sm"
                className="w-full"
              >
                {loading ? "Generating..." : "Generate changes"}
              </Button>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-500 p-2 rounded bg-red-500/10 border border-red-500/20">
              {error}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Proposed changes preview
                </label>
                <div className="max-h-[300px] overflow-y-auto p-3 rounded-lg border border-border bg-card text-sm font-mono whitespace-pre-wrap">
                  {preview}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleAccept}
                  disabled={loading}
                  size="sm"
                  className="flex-1"
                >
                  {loading ? "Creating commit..." : "Accept & commit"}
                </Button>
                <Button
                  onClick={() => {
                    setPreview(null);
                    setCommitMsg("");
                  }}
                  variant="outline"
                  size="sm"
                >
                  Discard
                </Button>
                <Button
                  onClick={handleGenerate}
                  variant="outline"
                  size="sm"
                  disabled={loading}
                >
                  Regenerate
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
