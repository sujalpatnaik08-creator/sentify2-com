import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
// Home ships in the entry chunk: it is the landing route and owns the LCP hero,
// so deferring it behind a dynamic import would delay first paint.
import Home from "./pages/Home.tsx";
import { AuthProvider } from "./contexts/AuthContext";
import { PlayerProvider } from "./contexts/PlayerContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";

// Every non-landing route is code-split so the homepage no longer downloads the
// whole app (uploader, DSP worker, smart playlists, guides) before painting.
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Search = lazy(() => import("./pages/Search.tsx"));
const Library = lazy(() => import("./pages/Library.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const Downloads = lazy(() => import("./pages/Downloads.tsx"));
const Artist = lazy(() => import("./pages/Artist.tsx"));
const History = lazy(() => import("./pages/History.tsx"));
const Moods = lazy(() => import("./pages/Moods.tsx"));
const Upload = lazy(() => import("./pages/Upload.tsx"));
const SmartPlaylists = lazy(() => import("./pages/SmartPlaylists.tsx"));
const GuideOfflineListening = lazy(() => import("./pages/GuideOfflineListening.tsx"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent.tsx"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

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
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
                  {/* Home is the only public app page before sign-in */}
                  <Route path="/" element={<Public><Home /></Public>} />
                  <Route path="/guide/offline-listening" element={<Public><GuideOfflineListening /></Public>} />
                  {/* Everything else requires sign-in */}
                  <Route path="/search" element={<Protected><Search /></Protected>} />
                  <Route path="/moods" element={<Protected><Moods /></Protected>} />
                  <Route path="/artist/:id" element={<Protected><Artist /></Protected>} />
                  <Route path="/downloads" element={<Protected><Downloads /></Protected>} />
                  <Route path="/history" element={<Protected><History /></Protected>} />
                  <Route path="/library" element={<Protected><Library /></Protected>} />
                  <Route path="/upload" element={<Protected><Upload /></Protected>} />
                  <Route path="/smart-playlists" element={<Protected><SmartPlaylists /></Protected>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </PlayerProvider>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
