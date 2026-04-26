import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import Home from "./pages/Home.tsx";
import Search from "./pages/Search.tsx";
import Library from "./pages/Library.tsx";
import Auth from "./pages/Auth.tsx";
import Downloads from "./pages/Downloads.tsx";
import Artist from "./pages/Artist.tsx";
import { AuthProvider } from "./contexts/AuthContext";
import { PlayerProvider } from "./contexts/PlayerContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";

const queryClient = new QueryClient();

// Public route — wraps in AppLayout but does NOT force auth.
const Public = ({ children }: { children: React.ReactNode }) => (
  <AppLayout>{children}</AppLayout>
);

// Protected route — requires auth, then AppLayout.
const Protected = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <PlayerProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              {/* Public — anyone can browse / play */}
              <Route path="/" element={<Public><Home /></Public>} />
              <Route path="/search" element={<Public><Search /></Public>} />
              <Route path="/artist/:id" element={<Public><Artist /></Public>} />
              <Route path="/downloads" element={<Public><Downloads /></Public>} />
              {/* Protected — your personal data */}
              <Route path="/library" element={<Protected><Library /></Protected>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </PlayerProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
