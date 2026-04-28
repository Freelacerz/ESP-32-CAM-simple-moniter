import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatMessageRow } from "@/integrations/supabase/types";
import { SendHorizontal } from "lucide-react";

type ProfileMap = Record<string, { username: string; avatar_url: string | null }>;

export function GameChat({ gameId, title = "Chat" }: { gameId: string; title?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const userIds = useMemo(() => Array.from(new Set(messages.map((m) => m.user_id))), [messages]);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("game_chat_messages")
        .select("id, game_id, user_id, message, created_at")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) {
        toast({ title: "Chat failed to load", description: error.message, variant: "destructive" });
        return;
      }
      if (!cancelled) setMessages((data ?? []) as ChatMessageRow[]);
    };

    void load();

    const ch = supabase
      .channel(`chat:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_chat_messages", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [gameId, toast]);

  useEffect(() => {
    if (!userIds.length) return;
    let cancelled = false;

    const missing = userIds.filter((id) => !profiles[id]);
    if (!missing.length) return;

    const loadProfiles = async () => {
      const { data, error } = await supabase.from("profiles").select("id, username, avatar_url").in("id", missing).limit(200);
      if (error) return;
      if (cancelled) return;
      setProfiles((prev) => {
        const next = { ...prev };
        (data ?? []).forEach((p: { id: string; username: string; avatar_url: string | null }) => {
          next[p.id] = { username: p.username, avatar_url: p.avatar_url ?? null };
        });
        return next;
      });
    };
    void loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [userIds, profiles]);

  useEffect(() => {
    // auto-scroll to bottom on new message
    const el = listRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const send = async () => {
    if (!user) return;
    const msg = text.trim();
    if (!msg) return;
    setSending(true);
    try {
      const { error } = await supabase.from("game_chat_messages").insert({ game_id: gameId, user_id: user.id, message: msg });
      if (error) throw error;
      setText("");
    } catch (e: unknown) {
      toast({ title: "Message failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="font-display text-lg font-bold mb-3">{title}</div>
      <ScrollArea className="h-56 pr-3">
        <div className="space-y-2">
          {messages.map((m) => {
            const mine = !!user && m.user_id === user.id;
            const name = mine ? "You" : profiles[m.user_id]?.username ?? "Player";
            return (
              <div key={m.id} className={`text-sm leading-snug ${mine ? "text-right" : ""}`}>
                <div className="text-[0.7rem] text-muted-foreground">{name}</div>
                <div className={`inline-block rounded-md px-2 py-1 ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.message}
                </div>
              </div>
            );
          })}
          <div ref={listRef} />
        </div>
      </ScrollArea>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={500}
          disabled={!user || sending}
        />
        <Button type="submit" disabled={!user || sending || !text.trim()}>
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}

