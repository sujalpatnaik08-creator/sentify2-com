export type Mood =
  | "happy"
  | "chill"
  | "focus"
  | "workout"
  | "sad"
  | "party"
  | "romance"
  | "sleep";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork: string;
  audioUrl: string; // direct audio url (audius) OR youtube video id when source==="youtube"
  duration: number; // seconds
  source: "audius" | "youtube";
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  cover: string;
  mood?: Mood;
  tracks: Track[];
}

export const MOODS: { id: Mood; label: string; emoji: string; gradient: string; tag: string }[] = [
  { id: "happy", label: "Happy", emoji: "😊", gradient: "var(--gradient-mood-happy)", tag: "happy hits" },
  { id: "chill", label: "Chill", emoji: "🌊", gradient: "var(--gradient-mood-chill)", tag: "chill lofi" },
  { id: "focus", label: "Focus", emoji: "🎯", gradient: "var(--gradient-mood-focus)", tag: "focus instrumental" },
  { id: "workout", label: "Workout", emoji: "💪", gradient: "var(--gradient-mood-workout)", tag: "workout hits" },
  { id: "sad", label: "Sad", emoji: "💧", gradient: "var(--gradient-mood-sad)", tag: "sad songs" },
  { id: "party", label: "Party", emoji: "🎉", gradient: "var(--gradient-mood-party)", tag: "party hits" },
  { id: "romance", label: "Romance", emoji: "💕", gradient: "var(--gradient-mood-romance)", tag: "romantic hindi songs" },
  { id: "sleep", label: "Sleep", emoji: "🌙", gradient: "var(--gradient-mood-sleep)", tag: "sleep music" },
];
