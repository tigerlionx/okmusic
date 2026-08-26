// ============================================================
//  SEED DATA — founder profile + real tracks only.
//  Dummy artists (Nova Synth, Lumen, Kira Beats) and the 100
//  generated demo profiles have been removed.  All remaining
//  community content comes from real Firestore user accounts.
// ============================================================

const SEED_USERS = [
  { id:"u_okmusic", name:"OK Music", handle:"okmusic", bio:"AI music from the heart — Afghan & Persian roots. Founder of this community. 🌅", color:"#7c5cff", founder:true }
];

const SEED_TRACKS = [
  { id:"t_afghan",  userId:"u_okmusic", title:"Afghan Sunrise",   src:"audio/Afghan_Sunrise.mp3",   accent:"#7c5cff", ageHrs:5  },
  { id:"t_persian", userId:"u_okmusic", title:"Persian Dawn",     src:"audio/Persian_Dawn.mp3",     accent:"#5c8bff", ageHrs:30 },
  { id:"t_gray",    userId:"u_okmusic", title:"Gray Moon",        src:"audio/Gray_Moon.mp3",        accent:"#36d1c4", ageHrs:52 },
  { id:"t_spring",  userId:"u_okmusic", title:"Spring and Dream", src:"audio/Spring_and_Dream.mp3", accent:"#ff7ac6", ageHrs:80 }
];

const SEED_STATUSES = [
  { id:"s_ok1", userId:"u_okmusic", text:"I am so happy today — I posted my new tracks 🌅 Please listen to them, comment, like, and share to your own page! 💜", ageHrs:4 }
];

const SEED_STATS = {
  t_afghan: { plays:412, likes:58 },
  t_persian:{ plays:233, likes:31 },
  t_gray:   { plays:188, likes:24 },
  t_spring: { plays:97,  likes:12 }
};

const SEED_FOLLOWERS = {
  u_okmusic: 128
};

const SEED_ST_STATS = {
  s_ok1: { likes:42, dislikes:1 }
};
