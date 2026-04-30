// Tracks this browser/device as a "session" the user can review in Settings.
// Stable per-browser id stored in localStorage. Best-effort IP geolocation
// via a public endpoint. Pure client-side; backed by RLS-protected table.

import { supabase } from "@/integrations/supabase/client";

const DEVICE_ID_KEY = "sentify_device_id";
const SESSION_ROW_KEY = "sentify_session_row_id";

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "anon-device";
  }
}

function detectDeviceLabel(): { label: string; platform: string } {
  const ua = navigator.userAgent;
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let platform = "Unknown";
  if (/Windows/.test(ua)) platform = "Windows";
  else if (/Mac OS X/.test(ua)) platform = "macOS";
  else if (/Android/.test(ua)) platform = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) platform = "iOS";
  else if (/Linux/.test(ua)) platform = "Linux";

  return { label: `${browser} on ${platform}`, platform };
}

async function fetchIpLocation(): Promise<{ city?: string; country?: string }> {
  try {
    const res = await fetch("https://ipapi.co/json/", { cache: "force-cache" });
    if (!res.ok) return {};
    const j = await res.json();
    return { city: j?.city, country: j?.country_name };
  } catch { return {}; }
}

export interface UserSessionRow {
  id: string;
  device_label: string;
  user_agent: string | null;
  platform: string | null;
  ip_country: string | null;
  ip_city: string | null;
  last_active_at: string;
  created_at: string;
}

export async function registerCurrentSession(userId: string): Promise<void> {
  const deviceId = getDeviceId();
  const existing = localStorage.getItem(SESSION_ROW_KEY);
  const { label, platform } = detectDeviceLabel();
  const ua = navigator.userAgent;

  // If we already registered this device, just refresh last_active
  if (existing) {
    await supabase
      .from("user_sessions")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", existing)
      .eq("user_id", userId);
    return;
  }

  const loc = await fetchIpLocation();
  const { data, error } = await supabase
    .from("user_sessions")
    .insert({
      user_id: userId,
      device_label: `${label} · ${deviceId.slice(0, 6)}`,
      user_agent: ua,
      platform,
      ip_country: loc.country ?? null,
      ip_city: loc.city ?? null,
    })
    .select("id")
    .single();
  if (!error && data?.id) {
    try { localStorage.setItem(SESSION_ROW_KEY, data.id); } catch { /* */ }
  }
}

export async function listSessions(userId: string): Promise<UserSessionRow[]> {
  const { data, error } = await supabase
    .from("user_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("last_active_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as UserSessionRow[];
}

export async function revokeSession(rowId: string): Promise<void> {
  await supabase.from("user_sessions").delete().eq("id", rowId);
  if (localStorage.getItem(SESSION_ROW_KEY) === rowId) {
    try { localStorage.removeItem(SESSION_ROW_KEY); } catch { /* */ }
  }
}

export function getCurrentSessionRowId(): string | null {
  try { return localStorage.getItem(SESSION_ROW_KEY); } catch { return null; }
}
