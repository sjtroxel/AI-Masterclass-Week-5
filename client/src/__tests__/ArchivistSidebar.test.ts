import { describe, it, expect } from 'vitest';
import { SIDEBAR_OPEN_KEY } from '../lib/archivistContext.js';
import { RELATED_QUESTION } from '../components/ArchivistSidebar.js';

describe('SIDEBAR_OPEN_KEY', () => {
  it('matches the expected localStorage key', () => {
    expect(SIDEBAR_OPEN_KEY).toBe('archivist-open');
  });

  it('is a non-empty string', () => {
    expect(typeof SIDEBAR_OPEN_KEY).toBe('string');
    expect(SIDEBAR_OPEN_KEY.length).toBeGreaterThan(0);
  });
});

describe('RELATED_QUESTION', () => {
  it('is the pre-seeded question for "How are these related?"', () => {
    expect(RELATED_QUESTION).toBe('How are these two posters related?');
  });

  it('is a non-empty string', () => {
    expect(typeof RELATED_QUESTION).toBe('string');
    expect(RELATED_QUESTION.length).toBeGreaterThan(0);
  });

  it('ends with a question mark', () => {
    expect(RELATED_QUESTION.endsWith('?')).toBe(true);
  });
});
