import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedSupabase: SupabaseClient | null = null;

/**
 * Supabaseクライアントを遅延初期化する関数。
 */
export function getSupabaseClient(): SupabaseClient {
    if (cachedSupabase) {
        return cachedSupabase;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabaseの環境変数が設定されていません。.env.local を確認してください。');
    }

    cachedSupabase = createClient(supabaseUrl, supabaseAnonKey);
    return cachedSupabase;
}