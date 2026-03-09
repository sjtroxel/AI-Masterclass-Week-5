import { describe, it, expect } from 'vitest';
import { buildNaraUrl, formatBreadcrumb } from '../pages/PosterDetailPage.js';

describe('buildNaraUrl', () => {
  it('constructs a valid NARA catalog URL from a NAID', () => {
    expect(buildNaraUrl('NAID-12345678')).toBe('https://catalog.archives.gov/id/12345678');
  });

  it('works with single-digit NAIDs', () => {
    expect(buildNaraUrl('NAID-1')).toBe('https://catalog.archives.gov/id/1');
  });

  it('returns null for DPLA-format IDs', () => {
    expect(buildNaraUrl('dpla-abc123def456')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(buildNaraUrl('')).toBeNull();
  });

  it('returns null for an ID with no prefix', () => {
    expect(buildNaraUrl('12345678')).toBeNull();
  });

  it('returns null for a partial NAID prefix without digits', () => {
    expect(buildNaraUrl('NAID-')).toBeNull();
  });
});

describe('formatBreadcrumb', () => {
  it('combines series title and poster title with a separator', () => {
    expect(formatBreadcrumb('WPA Posters', 'Park Safety Poster')).toBe(
      'WPA Posters › Park Safety Poster',
    );
  });

  it('returns only the title when series is null', () => {
    expect(formatBreadcrumb(null, 'Park Safety Poster')).toBe('Park Safety Poster');
  });

  it('truncates long breadcrumbs with an ellipsis', () => {
    const result = formatBreadcrumb('WPA Federal Art Project', 'A Very Long Poster Title That Will Be Clipped');
    expect(result.length).toBeLessThanOrEqual(61); // maxChars (60) + ellipsis char
    expect(result.endsWith('…')).toBe(true);
  });

  it('does not truncate breadcrumbs at exactly the limit', () => {
    // 60 chars exactly — should NOT truncate
    const title = 'A'.repeat(60);
    const result = formatBreadcrumb(null, title);
    expect(result).toBe(title);
    expect(result.endsWith('…')).toBe(false);
  });
});
