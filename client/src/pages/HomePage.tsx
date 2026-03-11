import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { QueryMode } from '@poster-pilot/shared';
import SearchBar from '../components/SearchBar.js';
import logoSrc from '../images/PosterPilotLogo.png';

export default function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [mode, setMode]   = useState<QueryMode>('text');

  function handleSubmit(imageData?: string) {
    const params = new URLSearchParams({ q: query, mode });
    if (imageData) params.set('image', imageData);
    navigate(`/search?${params.toString()}`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface pl-4 pr-10">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8">
        {/* Wordmark */}
        <div className="flex flex-col items-center gap-4 text-center">
          <img src={logoSrc} alt="Poster Pilot" className="h-32 w-auto" />
          <div>
            <h1 className="font-serif text-5xl font-bold text-text">
              Poster Pilot
            </h1>
            <p className="mt-2 font-sans text-sm text-text-muted">
              A Discovery Engine for visual history
            </p>
          </div>
        </div>

        {/* Search bar */}
        <SearchBar
          query={query}
          mode={mode}
          loading={false}
          onQueryChange={setQuery}
          onModeChange={setMode}
          onSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}
