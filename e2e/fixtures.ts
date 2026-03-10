/**
 * E2E test fixture data — deterministic API responses used by page.route() mocks.
 *
 * Shapes mirror the shared/ types exactly so the real client-side parsing code
 * exercises the same paths it would against a live backend.
 *
 * TESTING.md rule: E2E tests must never call real Anthropic / Supabase APIs.
 */

// ─── Poster IDs ───────────────────────────────────────────────────────────────

export const POSTER_ID        = 'aaaaaaaa-0001-4000-a000-000000000001';
export const POSTER_ID_2      = 'aaaaaaaa-0002-4000-a000-000000000002';
export const POSTER_ID_3      = 'aaaaaaaa-0003-4000-a000-000000000003';
export const NARA_ID          = 'NAID-516179';
export const NARA_ID_2        = 'NAID-516180';
export const NARA_ID_3        = 'NAID-516181';

// ─── Search: happy path (high confidence, no handoff) ─────────────────────────

export const SEARCH_RESULTS = {
  results: [
    {
      poster: {
        id:                 POSTER_ID,
        nara_id:            NARA_ID,
        title:              'Work Pays America — WPA Labor Poster',
        date_created:       '1936–1941',
        creator:            'Federal Art Project',
        thumbnail_url:      'https://placehold.co/300x400/3b4863/ffffff?text=WPA+Poster',
        series_title:       'WPA Posters',
        overall_confidence: 0.91,
        similarity_score:   0.91,
      },
      similarity_score: 0.91,
      confidence_level: 'high',
    },
    {
      poster: {
        id:                 POSTER_ID_2,
        nara_id:            NARA_ID_2,
        title:              'Build for Defense — WPA Poster',
        date_created:       '1941',
        creator:            'Federal Art Project',
        thumbnail_url:      'https://placehold.co/300x450/3b4863/ffffff?text=WPA+Defense',
        series_title:       'WPA Posters',
        overall_confidence: 0.85,
        similarity_score:   0.85,
      },
      similarity_score: 0.85,
      confidence_level: 'high',
    },
    {
      poster: {
        id:                 POSTER_ID_3,
        nara_id:            NARA_ID_3,
        title:              "America's Answer — WPA Art",
        date_created:       '1942',
        creator:            'Federal Art Project',
        thumbnail_url:      'https://placehold.co/300x380/3b4863/ffffff?text=WPA+Art',
        series_title:       'WPA Posters',
        overall_confidence: 0.79,
        similarity_score:   0.79,
      },
      similarity_score: 0.79,
      confidence_level: 'medium',
    },
  ],
  query_mode:           'text',
  human_handoff_needed: false,
} as const;

// ─── Search: handoff path (low confidence, human_handoff_needed=true) ─────────

export const SEARCH_HANDOFF = {
  results: [
    {
      poster: {
        id:                 'bbbbbbbb-0001-4000-b000-000000000001',
        nara_id:            'NAID-999001',
        title:              'Partial Match Result',
        date_created:       null,
        creator:            null,
        thumbnail_url:      'https://placehold.co/300x400/999999/ffffff?text=Low+Confidence',
        series_title:       null,
        overall_confidence: 0.45,
        similarity_score:   0.45,
      },
      similarity_score: 0.45,
      confidence_level: 'low',
    },
  ],
  query_mode:           'text',
  human_handoff_needed: true,
  handoff_reason:       'low_similarity',
} as const;

// ─── Full poster — detail page ─────────────────────────────────────────────────

export const POSTER = {
  id:                   POSTER_ID,
  nara_id:              NARA_ID,
  title:                'Work Pays America — WPA Labor Poster',
  date_created:         '1936–1941',
  date_normalized:      '1936',
  creator:              'Federal Art Project',
  description:          'A WPA poster promoting labor and employment programs during the New Deal era.',
  subject_tags:         ['labor', 'New Deal', 'WPA', 'employment'],
  series_title:         'WPA Posters',
  series_id:            '96357e58-178e-453b-a55d-ab64a95e7a70',
  physical_description: 'Silkscreen, 28 × 22 in.',
  reproduction_number:  'LC-USZC2-5384',
  rights_statement:     'No known restrictions on reproduction.',
  image_url:            'https://placehold.co/600x800/3b4863/ffffff?text=WPA+Poster',
  thumbnail_url:        'https://placehold.co/300x400/3b4863/ffffff?text=WPA+Poster',
  embedding_confidence: 0.92,
  metadata_completeness: 0.88,
  overall_confidence:   0.91,
  ingested_at:          '2026-01-01T00:00:00Z',
  last_updated_at:      '2026-01-01T00:00:00Z',
  ingest_version:       1,
} as const;

// ─── Visual siblings ───────────────────────────────────────────────────────────

export const SIBLINGS = [
  {
    id:               POSTER_ID_2,
    nara_id:          NARA_ID_2,
    title:            'Build for Defense — WPA Poster',
    thumbnail_url:    'https://placehold.co/300x450/3b4863/ffffff?text=WPA+Defense',
    similarity_score: 0.94,
  },
  {
    id:               POSTER_ID_3,
    nara_id:          NARA_ID_3,
    title:            "America's Answer — WPA Art",
    thumbnail_url:    'https://placehold.co/300x380/3b4863/ffffff?text=WPA+Art',
    similarity_score: 0.89,
  },
] as const;

// ─── Series page response ──────────────────────────────────────────────────────

export const SERIES_RESPONSE = {
  series: {
    id:               '96357e58-178e-453b-a55d-ab64a95e7a70',
    slug:             'wpa-posters',
    title:            'WPA Posters',
    description:      'Works Progress Administration poster collection from the New Deal era.',
    nara_series_ref:  null,
    poster_count:     3,
    created_at:       '2026-01-01T00:00:00Z',
  },
  posters: [
    {
      id:                 POSTER_ID,
      nara_id:            NARA_ID,
      title:              'Work Pays America — WPA Labor Poster',
      thumbnail_url:      'https://placehold.co/300x400/3b4863/ffffff?text=WPA+Poster',
      series_title:       'WPA Posters',
      overall_confidence: 0.91,
    },
    {
      id:                 POSTER_ID_2,
      nara_id:            NARA_ID_2,
      title:              'Build for Defense — WPA Poster',
      thumbnail_url:      'https://placehold.co/300x450/3b4863/ffffff?text=WPA+Defense',
      series_title:       'WPA Posters',
      overall_confidence: 0.85,
    },
    {
      id:                 POSTER_ID_3,
      nara_id:            NARA_ID_3,
      title:              "America's Answer — WPA Art",
      thumbnail_url:      'https://placehold.co/300x380/3b4863/ffffff?text=WPA+Art',
      series_title:       'WPA Posters',
      overall_confidence: 0.79,
    },
  ],
  total: 3,
  page:  1,
  limit: 20,
} as const;

// ─── Archivist SSE stream ─────────────────────────────────────────────────────
//
// The api.ts chat() parser splits on \n\n and expects frames of the form:
//   data: {"delta":"..."}\n\n          — streaming token
//   data: {"done":true,...}\n\n        — final event with citations + confidence

export const CHAT_SSE_BODY = [
  'data: {"delta":"The WPA poster "}\n\n',
  'data: {"delta":"promoted labor programs "}\n\n',
  'data: {"delta":"during the New Deal era."}\n\n',
  `data: {"done":true,"citations":[{"nara_id":"${NARA_ID}","field":"title","value":"Work Pays America — WPA Labor Poster"}],"confidence":0.88}\n\n`,
].join('');
