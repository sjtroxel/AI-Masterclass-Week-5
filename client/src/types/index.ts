/**
 * All shared domain types and constants, re-exported through this barrel so
 * client components always import from '@/types' — never directly from '@poster-pilot/shared'.
 * This preserves the module boundary between client/ and shared/.
 */
export * from '@poster-pilot/shared';
