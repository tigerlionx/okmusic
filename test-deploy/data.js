// ============================================================
//  SAMPLE DATA  —  replace these with your real content later.
//
//  TRACKS: one entry per song.
//    title  : song name
//    artist : you / collaborator
//    cover  : path or URL to the square cover image (the thumbnail
//             that magnifies). Leave "" to use the ◎ placeholder.
//    src    : path or URL to the audio file (mp3/m4a/wav).
//
//  PRODUCTS: one entry per merch item.
//    buyUrl : the link to this product on your Spring / Redbubble
//             store. That marketplace takes the payment, prints &
//             ships, and pays your profit to Payoneer. Leave "#" for
//             now; paste the real product link once your store is up.
// ============================================================

// The name shown on the "Buy" button, e.g. "Spring" or "Redbubble".
const STORE_NAME = "my store";

// ----- Donations (Zelle / other QR) -----
//  qrImage : drop your QR code picture in the donate/ folder and put its
//            path here, e.g. "donate/zelle-qr.png".
//  handle  : the email or phone shown under the code (optional).
//  Change `method` to whatever the QR is for (Zelle, PayPal, etc.).
const DONATE = {
  enabled: true,
  method: "Zelle",
  qrImage: "donate/zelle-qr.png",   // save your QR picture here with this exact name
  handle: "",             // optional: the email/phone to show under the code
  usCaption: "🇺🇸 U.S. fans — scan with Zelle",
  // International donations (Europe & worldwide) by card.
  // Paste your Payoneer payment-request link here:
  intlUrl: "",                                  // e.g. "https://pay.payoneer.com/..."
  intlLabel: "Donate by card",
  intlCaption: "🌍 Europe & worldwide — pay by card",
  title: "Support the music 💜",
  message:
    "Every song here is made with love and shared with you for free. " +
    "If the music brightened your day, a small donation helps me keep " +
    "creating, cover the cost of running this site, and bring you new " +
    "tracks. Any amount means the world — thank you for being part of " +
    "the journey."
};

// One entry per song.
//
//  >>> TO POST A NEW SONG <<<
//  1. Drop the .mp3 in the audio/ folder (and a square image in covers/).
//  2. Copy any line below, paste it as a NEW line, and change the fields.
//  3. Set `added` to today's date (YYYY-MM-DD).
//  The page automatically sorts newest-first and shows a glowing "NEW"
//  badge on songs added within the last 14 days. You don't touch any
//  other file — just add the line here.
const TRACKS = [
  { id: "t1",  title: "Afghan Sunrise",          artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/afghan-sunrise.m4a",                       accent: "#7c5cff" },
  { id: "t2",  title: "Astan-e Modar",           artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/astan-e-modar.m4a",                        accent: "#ff7ac6" },
  { id: "t3",  title: "Bahar va Arman",          artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/bahar-va-arman.m4a",                        accent: "#36d1c4" },
  { id: "t4",  title: "Gray Moon",               artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/gray-moon.m4a",                           accent: "#ffb347" },
  { id: "t5",  title: "Hasiba's Serenade",       artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/hasiba-s-serenade.m4a",                 accent: "#5c8bff" },
  { id: "t6",  title: "Pulse of the Night",      artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/pulse-of-the-night.m4a",          accent: "#ff5c7c" },
  { id: "t7",  title: "Hazabe Groove",           artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/hazabe-groove.m4a",                       accent: "#7c5cff" },
  { id: "t8",  title: "Hessi's Chorus",          artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/hessi-s-chorus.m4a",                       accent: "#ff7ac6" },
  { id: "t9",  title: "Lida Jan",                artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/lida-jan.m4a",                            accent: "#36d1c4" },
  { id: "t10", title: "Persian Dawn",            artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/persian-dawn.m4a",                        accent: "#ffb347" },
  { id: "t11", title: "Pomegranate Door",        artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/pomegranate-door.m4a",                    accent: "#5c8bff" },
  { id: "t12", title: "Rubab Kompa",             artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/rubab-kompa.m4a",                         accent: "#ff5c7c" },
  { id: "t13", title: "Spirits of the Highland", artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/spirits-of-the-highland.m4a",            accent: "#7c5cff" },
  { id: "t14", title: "Spring and Dream",        artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/spring-and-dream.m4a",                    accent: "#ff7ac6" },
  { id: "t15", title: "Mother's Celebration",    artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/mother-s-celebration.m4a",       accent: "#36d1c4" },
  { id: "t16", title: "Khodaye Mehraban",        artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/khodaye-mehraban.m4a",                       accent: "#ffb347" },
  { id: "t17", title: "Didar-e Lida",            artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/didar-e-lida.m4a",                        accent: "#5c8bff" },
  { id: "t18", title: "Your Courage Lives in Us", artist: "OK Music", added: "2026-06-05", cover: "", src: "audio/your-courage-lives-in-us.m4a",            accent: "#ff5c7c" }
];

const PRODUCTS = [
  {
    id: "p1",
    title: "Midnight Avenue Tee",
    price: 28.0,
    buyUrl: "#",               // paste your Spring/Redbubble product link
    image: "",                 // e.g. "products/tee-midnight.jpg"
    description: "Soft 100% cotton tee with the Midnight Avenue cover art printed front and center. Unisex fit.",
    accent: "#7c5cff"
  },
  {
    id: "p2",
    title: "Golden Hour Hoodie",
    price: 49.0,
    buyUrl: "#",
    image: "",
    description: "Cozy fleece-lined hoodie in warm sand. Embroidered logo on the chest.",
    accent: "#ff7ac6"
  },
  {
    id: "p3",
    title: "Paper Planes Mug",
    price: 16.0,
    buyUrl: "#",
    image: "",
    description: "11oz ceramic mug. Dishwasher and microwave safe. Wrap-around artwork.",
    accent: "#36d1c4"
  },
  {
    id: "p4",
    title: "Neon Rain Poster",
    price: 22.0,
    buyUrl: "#",
    image: "",
    description: "18×24 matte poster on heavyweight paper. Looks great over a desk or bed.",
    accent: "#ffb347"
  },
  {
    id: "p5",
    title: "Tote Bag",
    price: 19.0,
    buyUrl: "#",
    image: "",
    description: "Sturdy canvas tote for records, books, or groceries. Carry the sound with you.",
    accent: "#5c8bff"
  },
  {
    id: "p6",
    title: "Sticker Pack",
    price: 9.0,
    buyUrl: "#",
    image: "",
    description: "Set of 5 weatherproof vinyl stickers featuring every cover in the collection.",
    accent: "#ff5c7c"
  }
];
