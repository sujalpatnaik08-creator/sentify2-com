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
import ResetPassword from "./pages/ResetPassword.tsx";
import Downloads from "./pages/Downloads.tsx";
import Artist from "./pages/Artist.tsx";
import History from "./pages/History.tsx";
import Moods from "./pages/Moods.tsx";
import { AuthProvider } from "./contexts/AuthContext";
import { PlayerProvider } from "./contexts/PlayerContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";

const queryClient = new QueryClient();

// Home is always accessible (signed-out users see only Home + Auth).
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
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <PlayerProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                {/* Home is the only public app page before sign-in */}
                <Route path="/" element={<Public><Home /></Public>} />
                {/* Everything else requires sign-in */}
                <Route path="/search" element={<Protected><Search /></Protected>} />
                <Route path="/moods" element={<Protected><Moods /></Protected>} />
                <Route path="/artist/:id" element={<Protected><Artist /></Protected>} />
                <Route path="/downloads" element={<Protected><Downloads /></Protected>} />
                <Route path="/history" element={<Protected><History /></Protected>} />
                <Route path="/library" element={<Protected><Library /></Protected>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </PlayerProvider>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
