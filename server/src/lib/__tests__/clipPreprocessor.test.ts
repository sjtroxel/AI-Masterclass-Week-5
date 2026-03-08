import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Poster } from '@poster-pilot/shared';
import { preprocessText, buildCompositeText } from '../clipPreprocessor.js';

// ─── preprocessText ───────────────────────────────────────────────────────────

describe('preprocessText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converts text to lowercase', () => {
    expect(preprocessText('Hello World')).toBe('hello world');
  });

  it('strips punctuation, replacing it with spaces to preserve word boundaries', () => {
    expect(preprocessText('Buy War-Bonds! Now.')).toBe('buy war bonds now');
  });

  it('collapses extra whitespace left by punctuation removal', () => {
    expect(preprocessText('Federal Art Project:  Treasury Dept.')).toBe(
      'federal art project treasury dept',
    );
  });

  it('is idempotent — running it twice on the same input produces identical output', () => {
    const input = 'Federal Art Project: Treasury Dept.';
    expect(preprocessText(preprocessText(input))).toBe(preprocessText(input));
  });

  it('logs a warning and truncates when text exceeds 77 tokens', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const longText = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');

    const result = preprocessText(longText);

    expect(result.split(' ')).toHaveLength(77);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[clipPreprocessor]'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('truncated'));
  });

  it('does NOT log a warning when text is exactly 77 tokens', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const exactText = Array.from({ length: 77 }, (_, i) => `word${i}`).join(' ');

    preprocessText(exactText);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT log a warning when text is fewer than 77 tokens', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    preprocessText('short text');

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns an empty string for empty input', () => {
    expect(preprocessText('')).toBe('');
  });
});

// ─── buildCompositeText ───────────────────────────────────────────────────────

describe('buildCompositeText', () => {
  it('includes all present fields in the correct labeled format', () => {
    const poster: Partial<Poster> = {
      title: 'Buy War Bonds',
      creator: 'Federal Art Project',
      date_created: 'ca. 1942',
      series_title: 'WPA Posters',
      description: 'A bold graphic image showing an eagle.',
      subject_tags: ['World War II', 'War Bonds', 'Patriotism'],
      physical_description: 'Silkscreen print, 71 x 56 cm',
    };

    const result = buildCompositeText(poster);

    expect(result).toContain('[TITLE]: Buy War Bonds');
    expect(result).toContain('[CREATOR]: Federal Art Project');
    expect(result).toContain('[DATE]: ca. 1942');
    expect(result).toContain('[SERIES]: WPA Posters');
    expect(result).toContain('[DESCRIPTION]: A bold graphic image showing an eagle.');
    expect(result).toContain('[SUBJECTS]: World War II, War Bonds, Patriotism');
    expect(result).toContain('[PHYSICAL]: Silkscreen print, 71 x 56 cm');
  });

  it('omits null fields without throwing', () => {
    const poster: Partial<Poster> = {
      title: 'Only Title',
      creator: null,
      date_created: null,
      description: null,
      series_title: null,
      physical_description: null,
    };

    const result = buildCompositeText(poster);

    expect(result).toBe('[TITLE]: Only Title');
    expect(result).not.toContain('[CREATOR]');
    expect(result).not.toContain('[DATE]');
    expect(result).not.toContain('[DESCRIPTION]');
  });

  it('omits undefined fields without throwing', () => {
    const poster: Partial<Poster> = {};
    expect(() => buildCompositeText(poster)).not.toThrow();
    expect(buildCompositeText(poster)).toBe('');
  });

  it('omits subject_tags when the array is empty', () => {
    const poster: Partial<Poster> = { title: 'No Subjects', subject_tags: [] };
    const result = buildCompositeText(poster);
    expect(result).not.toContain('[SUBJECTS]');
  });

  it('joins multiple subject_tags with ", "', () => {
    const poster: Partial<Poster> = { subject_tags: ['Eagles', 'Patriotism'] };
    expect(buildCompositeText(poster)).toContain('[SUBJECTS]: Eagles, Patriotism');
  });

  it('preserves field order: TITLE → CREATOR → DATE → SERIES → DESCRIPTION → SUBJECTS → PHYSICAL', () => {
    const poster: Partial<Poster> = {
      title: 'T',
      creator: 'C',
      date_created: 'D',
      series_title: 'S',
      description: 'Desc',
      subject_tags: ['Sub'],
      physical_description: 'P',
    };

    const result = buildCompositeText(poster);
    const lines = result.split('\n');

    expect(lines[0]).toMatch(/^\[TITLE\]/);
    expect(lines[1]).toMatch(/^\[CREATOR\]/);
    expect(lines[2]).toMatch(/^\[DATE\]/);
    expect(lines[3]).toMatch(/^\[SERIES\]/);
    expect(lines[4]).toMatch(/^\[DESCRIPTION\]/);
    expect(lines[5]).toMatch(/^\[SUBJECTS\]/);
    expect(lines[6]).toMatch(/^\[PHYSICAL\]/);
  });
});
