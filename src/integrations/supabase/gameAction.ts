import { supabase } from "@/integrations/supabase/client";

export async function invokeGameAction(body: unknown): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.functions.invoke("game-action", { body });
  if (error) throw error;
  return data;
}

