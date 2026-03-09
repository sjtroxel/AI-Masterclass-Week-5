export default function AboutPage() {
  return (
    <main className="min-h-screen bg-surface px-4 py-12 md:px-8">
      <div className="mx-auto max-w-3xl flex flex-col gap-10">

        {/* Page heading */}
        <header>
          <h1 className="font-serif text-3xl font-semibold text-text">
            About Poster Pilot
          </h1>
        </header>

        {/* What is Poster Pilot */}
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-xl font-semibold text-text">What is Poster Pilot?</h2>
          <p className="font-sans text-sm text-text leading-relaxed">
            Poster Pilot is a multimodal discovery engine for historical poster collections —
            WPA art, NASA mission graphics, 19th-century patent medicine advertisements,
            WWII propaganda, and more. It combines visual similarity search (via CLIP embeddings)
            with a grounded AI research assistant called <em>The Archivist</em> to help scholars,
            designers, and curious minds explore America's visual heritage.
          </p>
          <p className="font-sans text-sm text-text leading-relaxed">
            You can search by text description, upload a reference image, or describe a visual
            feeling — the engine retrieves historically significant posters that match across
            all three dimensions.
          </p>
        </section>

        {/* NARA attribution */}
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-xl font-semibold text-text">Source: NARA & DPLA</h2>
          <p className="font-sans text-sm text-text leading-relaxed">
            All poster records in this collection originate from the{' '}
            <a
              href="https://www.archives.gov/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 underline underline-offset-2 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
            >
              National Archives and Records Administration (NARA)
            </a>
            , aggregated via the{' '}
            <a
              href="https://dp.la/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 underline underline-offset-2 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
            >
              Digital Public Library of America (DPLA)
            </a>
            . DPLA unifies holdings from NARA, the Library of Congress, the Smithsonian
            Institution, and hundreds of regional libraries and archives into a single,
            open API. All records are used for non-commercial educational and research purposes
            in accordance with NARA's public domain policy.
          </p>
          <p className="font-sans text-sm text-text leading-relaxed">
            To explore primary source documents directly, visit the{' '}
            <a
              href="https://catalog.archives.gov/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 underline underline-offset-2 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
            >
              NARA Catalog
            </a>
            .
          </p>
        </section>

        {/* Technology */}
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-xl font-semibold text-text">Technology</h2>
          <p className="font-sans text-sm text-text leading-relaxed">
            Visual search is powered by{' '}
            <strong className="font-semibold text-text">CLIP</strong>{' '}
            (<code className="font-mono text-xs bg-surface-2 px-1 py-0.5 rounded">clip-vit-large-patch14</code>),
            a multimodal embedding model that encodes both images and text into a shared
            semantic space — enabling text-to-image, image-to-image, and hybrid queries.
            Embeddings are stored in{' '}
            <strong className="font-semibold text-text">pgvector</strong> via Supabase and
            retrieved using cosine similarity.
          </p>
          <p className="font-sans text-sm text-text leading-relaxed">
            <em>The Archivist</em> is a grounded RAG chatbot built on{' '}
            <strong className="font-semibold text-text">Claude claude-sonnet-4-6</strong> by Anthropic. It is
            strictly instructed to cite specific NARA metadata fields and to acknowledge the
            limits of its knowledge — it will never invent historical facts, dates, or creators.
          </p>
        </section>

        {/* Footer note */}
        <footer className="border-t border-border pt-6">
          <p className="font-sans text-xs text-text-muted">
            Poster Pilot is an independent research project. It is not affiliated with or
            endorsed by NARA, the Digital Public Library of America, or Anthropic.
          </p>
        </footer>

      </div>
    </main>
  );
}
