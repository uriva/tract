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
import { AlertTriangle } from "lucide-react";

interface TractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (prompt: string) => void;
  isViewingOwnVersion: boolean;
  onGoToOwnVersion: () => void;
}

export function TractDialog({
  open,
  onOpenChange,
  onSubmit,
  isViewingOwnVersion,
  onGoToOwnVersion,
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

  function handleGoToOwnVersion() {
    onGoToOwnVersion();
    onOpenChange(false);
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

        {!isViewingOwnVersion ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-orange-500/50 bg-orange-500/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
              <p className="text-foreground/80">
                You&apos;re viewing another version. Tract will make changes
                based on <span className="font-medium">your</span> version, not
                the one you&apos;re looking at. Go to your version first so you
                can see the changes in context.
              </p>
            </div>
            <Button
              onClick={handleGoToOwnVersion}
              size="sm"
              className="w-full"
            >
              Go to your version
            </Button>
          </div>
        ) : (
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
        )}
      </DialogContent>
    </Dialog>
  );
}
