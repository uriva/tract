"use client";

import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSign: (legalName: string, signatureData: string) => void;
  existingName?: string;
}

export function SignDialog({
  open,
  onOpenChange,
  onSign,
  existingName,
}: SignDialogProps) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [legalName, setLegalName] = useState(existingName ?? "");
  const [isEmpty, setIsEmpty] = useState(true);

  function handleClear() {
    sigRef.current?.clear();
    setIsEmpty(true);
  }

  function handleSign() {
    if (!legalName.trim() || isEmpty) return;
    const dataUrl = sigRef.current
      ?.getTrimmedCanvas()
      .toDataURL("image/png") ?? "";
    onSign(legalName.trim(), dataUrl);
    onOpenChange(false);
  }

  function handleClose(val: boolean) {
    if (!val) {
      setLegalName(existingName ?? "");
      handleClear();
    }
    onOpenChange(val);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Your signature</DialogTitle>
          <DialogDescription>
            Enter your full legal name and draw your signature. This will be
            included when you download the contract as PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Full legal name
            </label>
            <Input
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="e.g. John A. Smith"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Signature
              </label>
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="border border-border rounded-lg bg-white overflow-hidden">
              <SignatureCanvas
                ref={sigRef}
                canvasProps={{
                  className: "w-full",
                  width: 400,
                  height: 160,
                  style: { width: "100%", height: "160px" },
                }}
                penColor="#1a1a1a"
                minWidth={1.5}
                maxWidth={3}
                onBegin={() => setIsEmpty(false)}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Draw your signature using your mouse or finger
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSign}
            disabled={!legalName.trim() || isEmpty}
            size="sm"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
