"use client";

import { useRef } from "react";
import { FileText, ImageIcon, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ExistingFile {
  id: string;
  fileName: string;
  url: string | null;
}

interface FileUploadProps {
  label: string;
  accept?: string;
  multiple?: boolean;
  variant?: "image" | "file";
  files: File[];
  onChange: (files: File[]) => void;
  existingFiles?: ExistingFile[];
  onRemoveExisting?: (id: string) => void;
  removingId?: string | null;
}

export function FileUpload({
  label,
  accept,
  multiple = true,
  variant = "file",
  files,
  onChange,
  existingFiles = [],
  onRemoveExisting,
  removingId,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePick = (fileList: FileList | null) => {
    if (!fileList) return;
    const next = multiple ? [...files, ...Array.from(fileList)] : Array.from(fileList).slice(0, 1);
    onChange(next);
  };

  const removeNew = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-sm font-medium">{label}</span>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors hover:border-secondary hover:bg-muted/40"
      >
        <Upload className="size-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Click to upload{multiple ? " one or more files" : ""}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          handlePick(e.target.files);
          e.target.value = "";
        }}
      />

      {(existingFiles.length > 0 || files.length > 0) && (
        <ul className="flex flex-col gap-2">
          {existingFiles.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2"
            >
              <FilePreview variant={variant} url={file.url} />
              <a
                href={file.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline"
              >
                {file.fileName}
              </a>
              {onRemoveExisting && (
                <button
                  type="button"
                  onClick={() => onRemoveExisting(file.id)}
                  disabled={removingId === file.id}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
                >
                  {removingId === file.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <X className="size-4" />
                  )}
                </button>
              )}
            </li>
          ))}
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2"
            >
              <FilePreview variant={variant} file={file} />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeNew(index)}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilePreview({
  variant,
  file,
  url,
}: {
  variant: "image" | "file";
  file?: File;
  url?: string | null;
}) {
  const src = file ? URL.createObjectURL(file) : url;

  if (variant === "image" && src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="size-9 shrink-0 rounded-md object-cover" />
    );
  }

  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
      )}
    >
      {variant === "image" ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
    </div>
  );
}
