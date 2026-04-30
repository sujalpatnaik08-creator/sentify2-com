// Devices & Sessions panel: lists where this account is signed in.
// Shown inside the Settings popover. Each device row shows browser, platform,
// approximate location and last-active time, with a "Sign out" action.

import { useEffect, useState } from "react";
import { Loader2, Monitor, MapPin, RefreshCw, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  listSessions,
  revokeSession,
  getCurrentSessionRowId,
  type UserSessionRow,
} from "@/lib/device-session";
import { toast } from "sonner";

const fmtRelative = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export const SessionsPanel = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<UserSessionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const currentId = getCurrentSessionRowId();

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try { setRows(await listSessions(user.id)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [user?.id]);

  const onRevoke = async (id: string) => {
    if (id === currentId) {
      toast.message("Tip: use the Sign Out button to end this device's session.");
      return;
    }
    await revokeSession(id);
    toast.success("Device removed");
    void refresh();
  };

  if (!user) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Devices & sessions
        </h5>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={refresh} aria-label="Refresh devices">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>
      {rows === null ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading devices…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No devices recorded yet.</p>
      ) : (
        <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {rows.map((r) => {
            const isCurrent = r.id === currentId;
            const place = [r.ip_city, r.ip_country].filter(Boolean).join(", ");
            return (
              <li key={r.id} className="flex items-start gap-2 p-2 rounded-md border border-border/60 bg-card/40">
                <Monitor className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate flex items-center gap-1">
                    {r.device_label}
                    {isCurrent && (
                      <span className="text-[9px] uppercase tracking-wide bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                        This device
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    {place && (<><MapPin className="w-2.5 h-2.5" /> {place} ·</>)}
                    <span>{fmtRelative(r.last_active_at)}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => onRevoke(r.id)}
                  title={isCurrent ? "Use Sign Out for this device" : "Remove this device"}
                  aria-label="Remove device"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
