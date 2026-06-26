// ============================================================
//  SEED DATA — demo creators so the community feels alive.
//  4 hand-made artists + 100 generated demo profiles (sample
//  content for launch). "OK Music" is you, the founder.
//  All seed stats (followers/plays/likes/statuses) live here too,
//  so community.js reads one source of seed data.
// ============================================================

const SEED_USERS = [
  { id:"u_okmusic", name:"OK Music", handle:"okmusic", bio:"AI music from the heart — Afghan & Persian roots. Founder of this community. 🌅", color:"#7c5cff", founder:true },
  { id:"u_nova", name:"Nova Synth", handle:"novasynth", bio:"Late-night synthwave, generated at 3am. Neon dreams only.", color:"#36d1c4" },
  { id:"u_lumen", name:"Lumen", handle:"lumen", bio:"Ambient soundscapes for focus, sleep & calm.", color:"#ffb347" },
  { id:"u_kira", name:"Kira Beats", handle:"kira", bio:"Lo-fi & boom-bap. All AI, all vibe. 🎧", color:"#ff5c7c" }
];

const SEED_TRACKS = [
  { id:"t_afghan",   userId:"u_okmusic", title:"Afghan Sunrise",   src:"audio/Afghan_Sunrise.mp3",   accent:"#7c5cff", ageHrs:5 },
  { id:"t_persian",  userId:"u_okmusic", title:"Persian Dawn",     src:"audio/Persian_Dawn.mp3",     accent:"#5c8bff", ageHrs:30 },
  { id:"t_gray",     userId:"u_okmusic", title:"Gray Moon",        src:"audio/Gray_Moon.mp3",        accent:"#36d1c4", ageHrs:52 },
  { id:"t_spring",   userId:"u_okmusic", title:"Spring and Dream", src:"audio/Spring_and_Dream.mp3", accent:"#ff7ac6", ageHrs:80 },
  { id:"t_nova1", userId:"u_nova",  title:"Neon Highway",   src:"", accent:"#36d1c4", ageHrs:2 },
  { id:"t_nova2", userId:"u_nova",  title:"Midnight Drive", src:"", accent:"#36d1c4", ageHrs:40 },
  { id:"t_lumen1", userId:"u_lumen", title:"Still Water",   src:"", accent:"#ffb347", ageHrs:9 },
  { id:"t_lumen2", userId:"u_lumen", title:"Slow Light",    src:"", accent:"#ffb347", ageHrs:70 },
  { id:"t_kira1", userId:"u_kira",  title:"Rainy Tape",     src:"", accent:"#ff5c7c", ageHrs:14 },
  { id:"t_kira2", userId:"u_kira",  title:"Old Cassette",   src:"", accent:"#ff5c7c", ageHrs:60 }
];

const SEED_STATUSES = [
  { id:"s_ok1",   userId:"u_okmusic", text:"I am so happy today — I posted my new tracks 🌅 Please listen to them, comment, like, and share to your own page! 💜", ageHrs:4 },
  { id:"s_nova1", userId:"u_nova",    text:"New synthwave just dropped tonight. Crank it up 🌃 Tell me your favorite track!", ageHrs:9 },
  { id:"s_kira1", userId:"u_kira",    text:"Lo-fi beats for your study session ☕ Feedback welcome — what should I make next?", ageHrs:22 }
];

const SEED_STATS = {
  t_afghan:{plays:412,likes:58}, t_persian:{plays:233,likes:31}, t_gray:{plays:188,likes:24}, t_spring:{plays:97,likes:12},
  t_nova1:{plays:1203,likes:210}, t_nova2:{plays:540,likes:77}, t_lumen1:{plays:860,likes:140}, t_lumen2:{plays:320,likes:41},
  t_kira1:{plays:1500,likes:260}, t_kira2:{plays:610,likes:95}
};
const SEED_FOLLOWERS = { u_okmusic:128, u_nova:4200, u_lumen:2100, u_kira:8800 };
const SEED_ST_STATS = { s_ok1:{likes:42,dislikes:1}, s_nova1:{likes:120,dislikes:3}, s_kira1:{likes:88,dislikes:0} };

// ---------- generate 100 demo creators ----------
(function(){
  const adjs=["Neon","Midnight","Golden","Crystal","Velvet","Electric","Lunar","Solar","Cosmic","Silent","Frozen","Burning","Hidden","Wild","Royal","Sacred","Broken","Endless","Crimson","Azure","Emerald","Shadow","Radiant","Distant","Echoing"];
  const nouns=["Echo","Pulse","Wave","Bloom","Drift","Ember","Tide","Sky","Storm","Dawn","Dusk","Falcon","Wolf","Lotus","River","Flame","Frost","Halo","Vortex","Mirage","Nova","Comet","Aura","Garden","Tower"];
  const genres=["synthwave","lo-fi","ambient","trap","deep house","cinematic","drill","afrobeat","jazz-hop","chillstep","orchestral","phonk","future bass","downtempo","hyperpop"];
  const colors=["#FB7A28","#7c5cff","#36d1c4","#ff5c7c","#ffb347","#5c8bff","#ff7ac6","#2bbf4e","#e2554f","#9b6dff","#1fb6a6","#f0a93b"];
  const tags=["pure vibes only ✨","made with love, by AI 🤖","new drops every week","dreaming in sound 🎧","turn it up 🔊","for the late nights","feel-good frequencies","experimental & free","your new favorite","sound is my language"];
  const msgs=[
    "Just dropped a new track — would love your feedback! 🎶",
    "Working on something special tonight 🌙 stay tuned.",
    "Thank you all for 1000 plays this week! 🙏",
    "What genre should I try next? Comment below 👇",
    "New profile background, who dis 😎 check my page!",
    "Collab anyone? Looking to make magic together ✨",
    "This one's for the dreamers 💫 hope it moves you.",
    "Late night session done. New sound incoming 🔥"
  ];
  for(let i=0;i<100;i++){
    const id="u_demo"+i;
    const name=adjs[i%adjs.length]+" "+nouns[(i*7+3)%nouns.length];
    const handle=name.toLowerCase().replace(/[^a-z0-9]/g,"")+i;
    SEED_USERS.push({ id, name, handle, bio:"AI "+genres[i%genres.length]+" creator — "+tags[i%tags.length], color:colors[i%colors.length] });
    SEED_FOLLOWERS[id]=((i*137+53)%9500)+30;
    const nt=1+(i%2);
    for(let k=0;k<nt;k++){
      const tid="t_demo"+i+"_"+k;
      SEED_TRACKS.push({ id:tid, userId:id, title:nouns[(i*3+k*5)%nouns.length]+" "+adjs[(i*5+k+2)%adjs.length], src:"", accent:colors[i%colors.length], ageHrs:(i*2+k*7)%170 });
      const pl=((i*91+k*40)%5200)+40; SEED_STATS[tid]={ plays:pl, likes:Math.floor(pl/6) };
    }
    if(i%4===0){
      const sid="s_demo"+i;
      SEED_STATUSES.push({ id:sid, userId:id, text:msgs[i%msgs.length], ageHrs:(i*5)%120 });
      SEED_ST_STATS[sid]={ likes:((i*53)%400)+5, dislikes:i%5 };
    }
  }
})();
