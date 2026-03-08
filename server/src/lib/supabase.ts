import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Single Supabase client using the SERVICE ROLE key.
// This key bypasses Row Level Security — keep it server-side only.
// Never import this module from client/ code.
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
