import { describe, it, expect } from 'vitest';
import {
  HUMAN_HANDOFF_THRESHOLD,
  CLIP_EMBEDDING_DIMENSIONS,
  CLIP_MODEL_ID,
  MAX_RAG_CONTEXT_POSTERS,
} from './index.js';

describe('shared constants', () => {
  it('HUMAN_HANDOFF_THRESHOLD is 0.72', () => {
    expect(HUMAN_HANDOFF_THRESHOLD).toBe(0.72);
  });

  it('CLIP_EMBEDDING_DIMENSIONS is 768', () => {
    expect(CLIP_EMBEDDING_DIMENSIONS).toBe(768);
  });

  it('CLIP_MODEL_ID references the correct model', () => {
    expect(CLIP_MODEL_ID).toBe('openai/clip-vit-large-patch14');
  });

  it('MAX_RAG_CONTEXT_POSTERS is 5', () => {
    expect(MAX_RAG_CONTEXT_POSTERS).toBe(5);
  });
});
