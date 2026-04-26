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
  audioUrl: string;
  duration: number; // seconds
  source: "jamendo" | "deezer";
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
  { id: "happy", label: "Happy", emoji: "😊", gradient: "var(--gradient-mood-happy)", tag: "pop" },
  { id: "chill", label: "Chill", emoji: "🌊", gradient: "var(--gradient-mood-chill)", tag: "chillout" },
  { id: "focus", label: "Focus", emoji: "🎯", gradient: "var(--gradient-mood-focus)", tag: "ambient" },
  { id: "workout", label: "Workout", emoji: "💪", gradient: "var(--gradient-mood-workout)", tag: "rock" },
  { id: "sad", label: "Sad", emoji: "💧", gradient: "var(--gradient-mood-sad)", tag: "acoustic" },
  { id: "party", label: "Party", emoji: "🎉", gradient: "var(--gradient-mood-party)", tag: "electronic" },
  { id: "romance", label: "Romance", emoji: "💕", gradient: "var(--gradient-mood-romance)", tag: "love" },
  { id: "sleep", label: "Sleep", emoji: "🌙", gradient: "var(--gradient-mood-sleep)", tag: "instrumental" },
];
