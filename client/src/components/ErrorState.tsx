interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-card border border-danger/40 bg-danger/5 px-6 py-8 text-center"
    >
      <p className="font-sans text-sm text-text">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="
          rounded-button bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-surface
          transition-colors hover:bg-primary-600
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
        "
      >
        Try again
      </button>
    </div>
  );
}
