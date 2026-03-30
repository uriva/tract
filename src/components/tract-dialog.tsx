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
  onSubmit: (prompt: string) => void;
}

export function TractDialog({
  open,
  onOpenChange,
  onSubmit,
}: TractDialogProps) {
  const [prompt, setPrompt] = useState("");

  function handleSubmit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setPrompt("");
    onOpenChange(false);
  }

  function handleClose(val: boolean) {
    if (!val) setPrompt("");
    onOpenChange(val);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
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

        <div className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='e.g. "Add a termination clause with 30-day notice"'
            className="min-h-[80px] resize-y"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleSubmit();
            }}
            autoFocus
          />
          <Button
            onClick={handleSubmit}
            disabled={!prompt.trim()}
            size="sm"
            className="w-full"
          >
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
