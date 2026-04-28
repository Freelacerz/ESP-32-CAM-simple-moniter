import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { MonoployezLogo } from "@/components/MonoployezLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/hooks/use-toast";
import { formatError } from "@/lib/errors";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function Auth() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  // sign-in
  const [siEmail, setSiEmail] = useState("");
  const [siPwd, setSiPwd] = useState("");

  // sign-up
  const [suEmail, setSuEmail] = useState("");
  const [suPwd, setSuPwd] = useState("");
  const [suUsername, setSuUsername] = useState("");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: siEmail,
        password: siPwd,
      });
      if (error) throw error;
      await refresh();
      navigate("/");
    } catch (err: unknown) {
      toast({ title: "Sign in failed", description: formatError(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (suUsername.trim().length < 3) {
      toast({ title: "Username too short", description: "At least 3 characters.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const username = suUsername.trim();
      const { data, error } = await supabase.auth.signUp({
        email: suEmail,
        password: suPwd,
        options: { data: { username } },
      });
      if (error) throw error;
      const newUserId = data.user?.id;
      if (newUserId) {
        // Best-effort profile bootstrap; also enforced by DB trigger in migrations.
        await supabase.from("profiles").upsert({
          id: newUserId,
          username,
          avatar_url: null,
          games_played: 0,
          games_won: 0,
          xp: 0,
        });
      }

      await refresh();
      toast({ title: "Welcome!", description: "You're signed in." });
      navigate("/");
    } catch (err: unknown) {
      toast({ title: "Sign up failed", description: formatError(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (data.url) window.location.assign(data.url);
    } catch (err: unknown) {
      const message = formatError(err);
      toast({
        title: "Google sign in is not enabled",
        description: message.includes("Unsupported provider")
          ? "Enable the Google provider in Supabase Auth, then add your Google Client ID and Secret."
          : message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-felt flex items-center justify-center p-4">
      <div className="absolute right-4 top-4 rounded-md bg-card/90 text-card-foreground shadow-card">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <MonoployezLogo size="md" />
        </div>
        <Card className="p-6 shadow-elevated">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" type="email" required value={siEmail}
                    onChange={(e) => setSiEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="si-pwd">Password</Label>
                  <Input id="si-pwd" type="password" required value={siPwd}
                    onChange={(e) => setSiPwd(e.target.value)} />
                </div>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <Label htmlFor="su-username">Username</Label>
                  <Input id="su-username" required minLength={3} maxLength={20}
                    value={suUsername} onChange={(e) => setSuUsername(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" type="email" required value={suEmail}
                    onChange={(e) => setSuEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="su-pwd">Password</Label>
                  <Input id="su-pwd" type="password" required minLength={6}
                    value={suPwd} onChange={(e) => setSuPwd(e.target.value)} />
                </div>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={handleGoogle}>
            Continue with Google
          </Button>
        </Card>
      </div>
    </div>
  );
}
