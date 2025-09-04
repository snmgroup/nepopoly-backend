
import { supabaseAdmin } from './db/supabaseClient';
// Verify JWT by using Supabase's public keys or by using Supabase Admin client to get user
// For this scaffold we'll perform a simple verification via Supabase /user endpoint as placeholder.

export async function verifyJwtGetUser(token: string) {
  if (!token) throw new Error('No token');
  // Try to get user from supabase auth
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error) throw error;
    return data.user;
  } catch (err) {
    console.log(err)
    throw new Error('Invalid token');
  }
}
