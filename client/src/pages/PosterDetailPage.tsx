import { useParams } from 'react-router-dom';

export default function PosterDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface">
      <p className="font-sans text-text-muted">Poster Detail — id: {id}</p>
    </main>
  );
}
