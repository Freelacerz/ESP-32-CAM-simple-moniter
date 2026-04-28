import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import LobbyView from "./Lobby";
import { Loader2 } from "lucide-react";

export default function LobbyRoute() {
  const { user, loading } = useAuth();
  const { gameId } = useParams();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!gameId) return <Navigate to="/" replace />;
  return <LobbyView />;
}
