// Spotify-style settings menu.
// A single sheet that opens to a "section list" (Account, Content and display,
// Privacy and social, Playback, Notifications, Apps and devices, Data-saving
// and offline, Sound quality, Advertisements, About and support) where each
// row shows a leading icon, the section title, and a subtitle listing two
// representative options. Tapping a row pushes a sub-panel with the actual
// controls (re-using the same prefs already wired in TopBar).
//
// We keep this self-contained: TopBar just renders <SettingsMenu />.

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  CalendarClock,
  ChevronRight,
  CircleUserRound,
  Download,
  Info,
  ListMusic,
  Lock,
  LogIn,
  LogOut,
  Megaphone,
  Moon,
  Music2,
  Settings as SettingsIcon,
  Smartphone,
  Sparkles,
  Sun,
  Volume2,
  Waves,
  Zap,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { getPerfMode, setPerfMode } from "@/lib/user-prefs";
import { SessionsPanel } from "@/components/SessionsPanel";
import { cn } from "@/lib/utils";

type SectionId =
  | "root"
  | "account"
  | "content"
  | "privacy"
  | "playback"
  | "notifications"
  | "apps"
  | "data"
  | "quality"
  | "ads"
  | "about";

interface RowDef {
  id: Exclude<SectionId, "root">;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}

const ROWS: RowDef[] = [
  { id: "account", icon: CircleUserRound, title: "Account", subtitle: "Username · Close account" },
  { id: "content", icon: Music2, title: "Content and display", subtitle: "Canvas · Languages for music" },
  { id: "privacy", icon: Lock, title: "Privacy and social", subtitle: "Private session · Public playlists" },
  { id: "playback", icon: Volume2, title: "Playback", subtitle: "Gapless playback · Autoplay" },
  { id: "notifications", icon: Bell, title: "Notifications", subtitle: "Push · Email" },
  { id: "apps", icon: Smartphone, title: "Apps and devices", subtitle: "Google Maps · Spotify Connect control" },
  { id: "data", icon: Download, title: "Data-saving and offline", subtitle: "Data Saver mode · Downloads over cellular" },
  { id: "quality", icon: ListMusic, title: "Sound quality", subtitle: "Wi-Fi streaming quality · Audio download quality" },
  { id: "ads", icon: Megaphone, title: "Advertisements", subtitle: "Tailored ads" },
  { id: "about", icon: Info, title: "About and support", subtitle: "Version · Privacy Policy" },
];

export const SettingsMenu = () => {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SectionId>("root");

  // Reset to root each time the sheet closes.
  useEffect(() => {
    if (!open) {
      // tiny delay so users don't see the back-flash during close animation
      const t = setTimeout(() => setSection("root"), 220);
      return () => clearTimeout(t);
    }
  }, [open]);

  const activeRow = useMemo(
    () => ROWS.find((r) => r.id === section) ?? null,
    [section],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full h-9 w-9 bg-secondary/60 hover:bg-secondary border border-border"
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col gap-0 bg-background"
      >
        <SheetHeader className="px-4 py-4 border-b border-border/60 flex flex-row items-center gap-2 space-y-0">
          {section !== "root" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -ml-1"
              onClick={() => setSection("root")}
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <SheetTitle className="text-base font-semibold">
            {section === "root" ? "Settings" : activeRow?.title}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {section === "root" ? (
            <ul className="py-2">
              {ROWS.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSection(r.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-accent/50 transition-colors"
                  >
                    <r.icon className="w-6 h-6 text-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-semibold truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {r.subtitle}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-4">
              <SectionPanel section={section} closeSheet={() => setOpen(false)} />
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

// =============================================================================
// Sub-panels
// =============================================================================

const Field = ({
  label,
  description,
  icon: Icon,
  control,
}: {
  label: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  control: React.ReactNode;
}) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b border-border/40 last:border-0">
    <div className="min-w-0 flex-1">
      <Label className="text-sm font-medium flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        {label}
      </Label>
      {description && (
        <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
      )}
    </div>
    <div className="shrink-0">{control}</div>
  </div>
);

const SectionPanel = ({
  section,
  closeSheet,
}: {
  section: SectionId;
  closeSheet: () => void;
}) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme, autoTheme, setAutoTheme } = useTheme();
  const {
    crossfadeSec,
    normalize,
    autoplayContinuity,
    audioEnhance,
    soundQuality,
    bassBoost,
    backgroundPlayback,
    setCrossfade,
    setNormalize,
    setAutoplayContinuity,
    setAudioEnhance,
    setSoundQuality,
    setBassBoost,
    setBackgroundPlayback,
  } = usePlayer();

  const [perf, setPerf] = useState(getPerfMode());
  const [pushPerm, setPushPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [emailNotif, setEmailNotif] = useState(true);
  const [privateSession, setPrivateSession] = useState(false);
  const [publicPlaylists, setPublicPlaylists] = useState(true);
  const [dataSaver, setDataSaver] = useState(false);
  const [downloadsOverCellular, setDownloadsOverCellular] = useState(false);
  const [tailoredAds, setTailoredAds] = useState(false);

  const requestPush = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const p = await Notification.requestPermission();
      setPushPerm(p);
    } catch {
      // ignore
    }
  };

  switch (section) {
    case "account":
      return (
        <div className="space-y-1">
          {user ? (
            <>
              <div className="pb-3 mb-2 border-b border-border/40">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Signed in as</p>
                <p className="text-sm font-medium truncate">{user.email}</p>
              </div>
              <Button
                variant="ghost"
                className="w-full justify-start h-10"
                onClick={() => { closeSheet(); navigate("/library"); }}
              >
                Your library
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start h-10"
                onClick={() => { closeSheet(); navigate("/downloads"); }}
              >
                Downloads
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start h-10 text-destructive hover:text-destructive"
                onClick={signOut}
              >
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </Button>
              <div className="pt-3 mt-2 border-t border-border/40">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Devices & sessions
                </p>
                <SessionsPanel />
              </div>
            </>
          ) : (
            <Button onClick={() => { closeSheet(); navigate("/auth"); }} className="w-full gap-1.5">
              <LogIn className="w-4 h-4" /> Log in
            </Button>
          )}
        </div>
      );

    case "content":
      return (
        <div>
          <Field
            icon={theme === "dark" ? Moon : Sun}
            label={theme === "dark" ? "Dark mode" : "Light mode"}
            description="Switch between light and dark color themes"
            control={
              <Switch
                checked={theme === "light"}
                onCheckedChange={toggleTheme}
                disabled={autoTheme}
              />
            }
          />
          <Field
            icon={CalendarClock}
            label="Auto theme"
            description="Light 6 AM–6 PM, Dark 6 PM–6 AM"
            control={<Switch checked={autoTheme} onCheckedChange={setAutoTheme} />}
          />
          <p className="text-xs text-muted-foreground pt-3">
            Languages for music are configured per-track in the Now Playing lyrics view.
          </p>
        </div>
      );

    case "privacy":
      return (
        <div>
          <Field
            label="Private session"
            description="Don't show what you're listening to in your activity"
            control={<Switch checked={privateSession} onCheckedChange={setPrivateSession} />}
          />
          <Field
            label="Public playlists"
            description="Allow others to discover playlists you create"
            control={<Switch checked={publicPlaylists} onCheckedChange={setPublicPlaylists} />}
          />
        </div>
      );

    case "playback":
      return (
        <div>
          <div className="py-3 border-b border-border/40">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Crossfade</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {crossfadeSec === 0 ? "Off" : `${crossfadeSec}s`}
              </span>
            </div>
            <Slider
              value={[crossfadeSec]}
              min={0}
              max={12}
              step={1}
              onValueChange={(v) => setCrossfade(v[0])}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Smoothly fade between tracks (gapless playback)
            </p>
          </div>
          <Field
            label="Audio normalization"
            description="Match loudness across tracks (~−14 LUFS)"
            control={<Switch checked={normalize} onCheckedChange={setNormalize} />}
          />
          <Field
            label="Autoplay similar songs"
            description="Keep playing related tracks when the queue ends"
            control={<Switch checked={autoplayContinuity} onCheckedChange={setAutoplayContinuity} />}
          />
          <Field
            icon={Sparkles}
            label="Audio enhancer"
            description="Auto EQ, compression & stereo widening"
            control={<Switch checked={audioEnhance} onCheckedChange={setAudioEnhance} />}
          />
          <Field
            icon={Smartphone}
            label="Background playback"
            description="Keep playing when minimized; lock-screen controls"
            control={<Switch checked={backgroundPlayback} onCheckedChange={setBackgroundPlayback} />}
          />
          <Field
            icon={Zap}
            label="Performance mode"
            description="Lower latency, faster preloads"
            control={
              <Switch checked={perf} onCheckedChange={(v) => { setPerf(v); setPerfMode(v); }} />
            }
          />
        </div>
      );

    case "notifications":
      return (
        <div>
          <Field
            label="Push notifications"
            description={
              pushPerm === "granted"
                ? "Enabled"
                : pushPerm === "denied"
                  ? "Blocked in your browser settings"
                  : pushPerm === "unsupported"
                    ? "Not supported in this browser"
                    : "Show now-playing & song updates"
            }
            control={
              pushPerm === "granted" ? (
                <Switch checked disabled />
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={requestPush}
                  disabled={pushPerm === "denied" || pushPerm === "unsupported"}
                >
                  Enable
                </Button>
              )
            }
          />
          <Field
            label="Email"
            description="Updates and recommendations to your inbox"
            control={<Switch checked={emailNotif} onCheckedChange={setEmailNotif} />}
          />
        </div>
      );

    case "apps":
      return (
        <div>
          <p className="text-xs text-muted-foreground pb-2">
            Active devices and external app integrations.
          </p>
          <SessionsPanel />
        </div>
      );

    case "data":
      return (
        <div>
          <Field
            label="Data Saver mode"
            description="Reduce streaming bitrate to save mobile data"
            control={<Switch checked={dataSaver} onCheckedChange={setDataSaver} />}
          />
          <Field
            label="Downloads over cellular"
            description="Allow downloads when not on Wi-Fi"
            control={
              <Switch
                checked={downloadsOverCellular}
                onCheckedChange={setDownloadsOverCellular}
              />
            }
          />
          <div className="pt-3">
            <Button
              variant="ghost"
              className="w-full justify-start h-10"
              onClick={() => { closeSheet(); navigate("/downloads"); }}
            >
              <Download className="w-4 h-4 mr-2" /> Manage downloads
            </Button>
          </div>
        </div>
      );

    case "quality":
      return (
        <div>
          <div className="py-3 border-b border-border/40">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Wi-Fi streaming quality</Label>
              <Select
                value={soundQuality}
                onValueChange={(v) => setSoundQuality(v as "high" | "medium" | "low")}
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high" className="text-xs">High</SelectItem>
                  <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                  <SelectItem value="low" className="text-xs">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Higher quality uses more data
            </p>
          </div>
          <Field
            icon={Waves}
            label="Bass boost"
            description="+7 dB low-shelf below 80 Hz"
            control={<Switch checked={bassBoost} onCheckedChange={setBassBoost} />}
          />
          <Field
            label="Audio download quality"
            description="Same as streaming quality unless changed"
            control={
              <Select
                value={soundQuality}
                onValueChange={(v) => setSoundQuality(v as "high" | "medium" | "low")}
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high" className="text-xs">High</SelectItem>
                  <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                  <SelectItem value="low" className="text-xs">Low</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </div>
      );

    case "ads":
      return (
        <div>
          <Field
            label="Tailored ads"
            description="Personalize ads based on your listening"
            control={<Switch checked={tailoredAds} onCheckedChange={setTailoredAds} />}
          />
          <p className="text-xs text-muted-foreground pt-3">
            Sentify is ad-free for signed-in users. This setting only affects future
            promotional content.
          </p>
        </div>
      );

    case "about":
      return (
        <div className="space-y-1">
          <Field
            label="Version"
            control={<span className="text-xs text-muted-foreground">1.0.0</span>}
          />
          <Field
            label="Privacy Policy"
            control={
              <a
                href="https://www.lovable.dev/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Open
              </a>
            }
          />
          <Field
            label="Terms of Service"
            control={
              <a
                href="https://www.lovable.dev/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Open
              </a>
            }
          />
        </div>
      );

    default:
      return null;
  }
};

// suppress unused-import warning when bundler is strict
void cn;
