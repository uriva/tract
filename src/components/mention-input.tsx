"use client";

import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface MentionProps {
  value: string;
  onChange: (val: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export function MentionInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  onKeyDown,
  ...props
}: MentionProps & Omit<React.ComponentProps<typeof Input>, "onChange" | "value">) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = suggestions.filter((s) =>
    s.toLowerCase().includes(query.toLowerCase())
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    const selectionStart = e.target.selectionStart || 0;
    setCursorPos(selectionStart);
    checkMention(val, selectionStart);
  };

  const handleSelectChange = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const selectionStart = e.currentTarget.selectionStart || 0;
    setCursorPos(selectionStart);
    checkMention(e.currentTarget.value, selectionStart);
  };

  const checkMention = (val: string, selectionStart: number) => {
    const beforeCursor = val.slice(0, selectionStart);
    const match = beforeCursor.match(/@(\w*)$/);
    if (match) {
      setShowDropdown(true);
      setQuery(match[1]);
      setSelectedIndex(0);
    } else {
      setShowDropdown(false);
    }
  };

  const insertMention = (suggestion: string) => {
    if (!inputRef.current) return;
    const beforeCursor = value.slice(0, cursorPos);
    const afterCursor = value.slice(cursorPos);
    const match = beforeCursor.match(/@(\w*)$/);
    if (!match) return;

    const start = match.index || 0;
    const newValue = value.slice(0, start) + `@${suggestion} ` + afterCursor;
    onChange(newValue);
    setShowDropdown(false);

    // Reset focus and cursor position after the insert
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newCursorPos = start + suggestion.length + 2; // +2 for @ and space
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown && filteredSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredSuggestions[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }
    }
    if (onKeyDown) onKeyDown(e);
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <Input
        ref={inputRef}
        type="text"
        dir="auto"
        value={value}
        onChange={handleTextChange}
        onSelect={handleSelectChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        {...props}
      />
      {showDropdown && filteredSuggestions.length > 0 && (
        <div className="absolute left-0 right-0 bottom-full z-50 mb-1 max-h-40 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md text-xs">
          {filteredSuggestions.map((suggestion, idx) => {
            const isTract = suggestion.toLowerCase() === "tract";
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={suggestion}
                type="button"
                onClick={() => insertMention(suggestion)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                  isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
                }`}
              >
                {isTract ? (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-accent to-[#6d9eeb] text-[9px] font-bold text-white shadow-sm shrink-0">
                    T
                  </span>
                ) : (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-muted text-[9px] font-semibold text-muted-foreground shrink-0 uppercase">
                    {suggestion.slice(0, 2)}
                  </span>
                )}
                <span className="font-medium text-foreground">{suggestion}</span>
                {isTract && <span className="ml-auto text-[9px] text-muted-foreground">AI assistant</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MentionTextarea({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  onKeyDown,
  ...props
}: MentionProps & Omit<React.ComponentProps<typeof Textarea>, "onChange" | "value">) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredSuggestions = suggestions.filter((s) =>
    s.toLowerCase().includes(query.toLowerCase())
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);

    const selectionStart = e.target.selectionStart || 0;
    setCursorPos(selectionStart);
    checkMention(val, selectionStart);
  };

  const handleSelectChange = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const selectionStart = e.currentTarget.selectionStart || 0;
    setCursorPos(selectionStart);
    checkMention(e.currentTarget.value, selectionStart);
  };

  const checkMention = (val: string, selectionStart: number) => {
    const beforeCursor = val.slice(0, selectionStart);
    const match = beforeCursor.match(/@(\w*)$/);
    if (match) {
      setShowDropdown(true);
      setQuery(match[1]);
      setSelectedIndex(0);
    } else {
      setShowDropdown(false);
    }
  };

  const insertMention = (suggestion: string) => {
    if (!textareaRef.current) return;
    const beforeCursor = value.slice(0, cursorPos);
    const afterCursor = value.slice(cursorPos);
    const match = beforeCursor.match(/@(\w*)$/);
    if (!match) return;

    const start = match.index || 0;
    const newValue = value.slice(0, start) + `@${suggestion} ` + afterCursor;
    onChange(newValue);
    setShowDropdown(false);

    // Reset focus and cursor position after the insert
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = start + suggestion.length + 2; // +2 for @ and space
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && filteredSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredSuggestions[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }
    }
    if (onKeyDown) onKeyDown(e);
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <Textarea
        ref={textareaRef}
        dir="auto"
        value={value}
        onChange={handleTextChange}
        onSelect={handleSelectChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        {...props}
      />
      {showDropdown && filteredSuggestions.length > 0 && (
        <div className="absolute left-0 right-0 bottom-full z-50 mb-1 max-h-40 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md text-xs">
          {filteredSuggestions.map((suggestion, idx) => {
            const isTract = suggestion.toLowerCase() === "tract";
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={suggestion}
                type="button"
                onClick={() => insertMention(suggestion)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                  isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
                }`}
              >
                {isTract ? (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-accent to-[#6d9eeb] text-[9px] font-bold text-white shadow-sm shrink-0">
                    T
                  </span>
                ) : (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-muted text-[9px] font-semibold text-muted-foreground shrink-0 uppercase">
                    {suggestion.slice(0, 2)}
                  </span>
                )}
                <span className="font-medium text-foreground">{suggestion}</span>
                {isTract && <span className="ml-auto text-[9px] text-muted-foreground">AI assistant</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
