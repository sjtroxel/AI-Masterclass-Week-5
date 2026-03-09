import { useRef, useState } from 'react';
import type { QueryMode } from '@poster-pilot/shared';

interface SearchBarProps {
  query: string;
  mode: QueryMode;
  loading: boolean;
  onQueryChange: (q: string) => void;
  onModeChange: (m: QueryMode) => void;
  /** Called with optional base64/URL image data when the form is submitted */
  onSubmit: (imageData?: string) => void;
}

const MODES: { value: QueryMode; label: string }[] = [
  { value: 'text',   label: 'Text' },
  { value: 'image',  label: 'Image' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'vibe',   label: 'Vibe' },
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export default function SearchBar({
  query,
  mode,
  loading,
  onQueryChange,
  onModeChange,
  onSubmit,
}: SearchBarProps) {
  const [imageSource, setImageSource] = useState('');   // base64 URI or URL
  const [imageUrl, setImageUrl]       = useState('');   // URL paste input
  const [dragOver, setDragOver]       = useState(false);
  const [fileError, setFileError]     = useState<string | null>(null);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Debounced submit ──────────────────────────────────────────────────────

  function fireSubmit(image?: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSubmit(image);
    }, 300);
  }

  function fireSubmitNow(image?: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSubmit(image);
  }

  // ─── Image handling ────────────────────────────────────────────────────────

  function processFile(file: File) {
    setFileError(null);
    if (file.size > MAX_IMAGE_BYTES) {
      setFileError('Image must be 5 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImageSource(dataUrl);
      setImageUrl('');
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImageUrl(e.target.value);
    setImageSource('');
  }

  function clearImage() {
    setImageSource('');
    setImageUrl('');
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ─── Keyboard handler ──────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const img = imageSource || imageUrl || undefined;
      fireSubmitNow(img);
    }
    if (e.key === 'Escape') {
      onQueryChange('');
    }
  }

  // ─── Resolved image for submission ────────────────────────────────────────

  function resolvedImage() {
    return imageSource || imageUrl || undefined;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const placeholder =
    mode === 'vibe'
      ? 'Describe a feeling or aesthetic…'
      : mode === 'image'
        ? 'Describe the image you want to find…'
        : 'Search the archive…';

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Mode selector */}
      <div role="tablist" aria-label="Search mode" className="flex gap-1 rounded-card bg-surface-3 p-1 self-start">
        {MODES.map(({ value, label }) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={mode === value}
            aria-label={`${label} search mode`}
            onClick={() => onModeChange(value)}
            className={`
              rounded-button px-3 py-1 font-sans text-sm font-medium transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
              ${mode === value
                ? 'bg-surface text-text shadow-card'
                : 'text-text-muted hover:text-text'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search input row */}
      <div className="relative flex items-center">
        {/* Loading shimmer overlay */}
        {loading && (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-10 overflow-hidden rounded-card"
          >
            <div className="h-full w-full animate-pulse bg-surface-3/60" />
          </div>
        )}

        <input
          type="search"
          role="searchbox"
          aria-label="Search query"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={loading}
          className="
            flex-1 rounded-l-card border border-r-0 border-border bg-surface-2
            px-4 py-3 font-sans text-sm text-text placeholder:text-text-muted
            focus:border-primary-500 focus:outline-none
            disabled:opacity-60
          "
        />

        <button
          type="button"
          onClick={() => fireSubmit(resolvedImage())}
          disabled={loading || (mode !== 'image' && !query.trim())}
          aria-label="Submit search"
          className="
            rounded-r-card border border-border bg-primary-500 px-5 py-3
            text-surface transition-colors hover:bg-primary-600
            disabled:cursor-not-allowed disabled:opacity-50
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
          "
        >
          {/* Search icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
      </div>

      {/* Image dropzone — only visible in image or hybrid mode */}
      {(mode === 'image' || mode === 'hybrid') && (
        <div className="flex flex-col gap-2">
          {/* Dropzone */}
          {imageSource ? (
            <div className="flex items-center gap-3 rounded-card border border-border bg-surface-2 p-3">
              <img
                src={imageSource}
                alt="Selected image preview"
                className="h-14 w-14 rounded-button object-cover"
              />
              <p className="flex-1 font-sans text-xs text-text-muted">Image ready</p>
              <button
                type="button"
                onClick={clearImage}
                aria-label="Remove image"
                className="font-sans text-xs text-danger hover:underline focus-visible:outline-none"
              >
                Remove
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Image dropzone — click or drag an image here"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              className={`
                cursor-pointer rounded-card border-2 border-dashed p-6 text-center transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                ${dragOver ? 'border-primary-500 bg-primary-50' : 'border-border hover:border-primary-400'}
              `}
            >
              <p className="font-sans text-sm text-text-muted">
                Drop an image here or <span className="text-primary-500 underline">browse</span>
              </p>
              <p className="mt-1 font-sans text-xs text-text-muted">Max 5 MB</p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleFileInput}
            aria-hidden="true"
            tabIndex={-1}
          />

          {/* URL paste fallback */}
          <input
            type="url"
            placeholder="Or paste an image URL…"
            value={imageUrl}
            onChange={handleUrlChange}
            className="
              rounded-card border border-border bg-surface-2 px-4 py-2.5
              font-sans text-sm text-text placeholder:text-text-muted
              focus:border-primary-500 focus:outline-none
            "
          />

          {fileError && (
            <p role="alert" className="font-sans text-xs text-danger">
              {fileError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
