import { useParams } from 'react-router-dom';

export default function SeriesPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface">
      <p className="font-sans text-text-muted">Series — {slug}</p>
    </main>
  );
}
