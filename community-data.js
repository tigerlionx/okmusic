// ============================================================
//  SEED DATA for the community prototype.
//  These are demo artists so the platform feels alive on first
//  visit. Real artists + tracks will come from accounts + uploads
//  (localStorage now, Firebase later). "OK Music" is you, Emmanuel —
//  the founder and first creator.
// ============================================================

const SEED_USERS = [
  {
    id: "u_okmusic", name: "OK Music", handle: "okmusic",
    bio: "AI music from the heart — Afghan & Persian roots. Founder of this community. 🌅",
    color: "#7c5cff", founder: true
  },
  {
    id: "u_nova", name: "Nova Synth", handle: "novasynth",
    bio: "Late-night synthwave, generated at 3am. Neon dreams only.",
    color: "#36d1c4"
  },
  {
    id: "u_lumen", name: "Lumen", handle: "lumen",
    bio: "Ambient soundscapes for focus, sleep & calm.",
    color: "#ffb347"
  },
  {
    id: "u_kira", name: "Kira Beats", handle: "kira",
    bio: "Lo-fi & boom-bap. All AI, all vibe. 🎧",
    color: "#ff5c7c"
  }
];

// OK Music tracks use your real audio files (in the audio/ folder).
// Demo-artist tracks have no audio yet (they show a friendly note on play).
const SEED_TRACKS = [
  { id: "t_afghan",   userId: "u_okmusic", title: "Afghan Sunrise",   src: "audio/Afghan_Sunrise.mp3",   accent: "#7c5cff", ageHrs: 5 },
  { id: "t_persian",  userId: "u_okmusic", title: "Persian Dawn",     src: "audio/Persian_Dawn.mp3",     accent: "#5c8bff", ageHrs: 30 },
  { id: "t_gray",     userId: "u_okmusic", title: "Gray Moon",        src: "audio/Gray_Moon.mp3",        accent: "#36d1c4", ageHrs: 52 },
  { id: "t_spring",   userId: "u_okmusic", title: "Spring and Dream", src: "audio/Spring_and_Dream.mp3", accent: "#ff7ac6", ageHrs: 80 },

  { id: "t_nova1", userId: "u_nova",  title: "Neon Highway",   src: "", accent: "#36d1c4", ageHrs: 2 },
  { id: "t_nova2", userId: "u_nova",  title: "Midnight Drive", src: "", accent: "#36d1c4", ageHrs: 40 },
  { id: "t_lumen1", userId: "u_lumen", title: "Still Water",   src: "", accent: "#ffb347", ageHrs: 9 },
  { id: "t_lumen2", userId: "u_lumen", title: "Slow Light",    src: "", accent: "#ffb347", ageHrs: 70 },
  { id: "t_kira1", userId: "u_kira",  title: "Rainy Tape",     src: "", accent: "#ff5c7c", ageHrs: 14 },
  { id: "t_kira2", userId: "u_kira",  title: "Old Cassette",   src: "", accent: "#ff5c7c", ageHrs: 60 }
];
