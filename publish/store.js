// ============================================================
//  STORE — visitor count, likes/dislikes, and comments.
//
//  RIGHT NOW this saves data in THIS browser only (localStorage),
//  so while testing you see your own numbers. Perfect for design.
//
//  TO MAKE IT SHARED across all visitors worldwide (one real visit
//  count, public comments everyone sees, combined like totals), we
//  plug in a free Firebase database later. ONLY this file changes —
//  the rest of the site stays exactly the same. Search "FIREBASE"
//  below for where that goes.
// ============================================================

const Store = (function () {
  const KEY = "okmusic";

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch { return {}; }
  }
  function write(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
  function ensure(d) {
    if (d.visits == null) d.visits = 0;
    if (!d.votes) d.votes = {};
    if (!d.myVotes) d.myVotes = {};
    if (!d.comments) d.comments = [];
    return d;
  }

  return {
    // ---------- visitor count ----------
    async registerVisit() {
      const d = ensure(read());
      // count each browser session once, not every page refresh
      if (!sessionStorage.getItem(KEY + "_seen")) {
        d.visits += 1;
        write(d);
        sessionStorage.setItem(KEY + "_seen", "1");
      }
      return d.visits;
    },

    // ---------- likes / dislikes per track ----------
    async getVotes(trackId) {
      const d = ensure(read());
      const v = d.votes[trackId] || { likes: 0, dislikes: 0 };
      return { likes: v.likes, dislikes: v.dislikes, mine: d.myVotes[trackId] || null };
    },
    async vote(trackId, dir) {                 // dir = "like" or "dislike"
      const d = ensure(read());
      const v = d.votes[trackId] || { likes: 0, dislikes: 0 };
      const prev = d.myVotes[trackId] || null;

      if (prev === "like") v.likes = Math.max(0, v.likes - 1);
      if (prev === "dislike") v.dislikes = Math.max(0, v.dislikes - 1);

      let mine;
      if (prev === dir) {
        mine = null;                           // clicking the same button again removes your vote
      } else {
        mine = dir;
        if (dir === "like") v.likes += 1; else v.dislikes += 1;
      }

      d.votes[trackId] = v;
      d.myVotes[trackId] = mine;
      write(d);
      return { likes: v.likes, dislikes: v.dislikes, mine };
    },

    // ---------- comments ----------
    async getComments() {
      return ensure(read()).comments;
    },
    async addComment(name, text) {
      const d = ensure(read());
      d.comments.unshift({
        name: (name || "Anonymous").slice(0, 40),
        text: text.slice(0, 500),
        time: Date.now()
      });
      write(d);
      return d.comments;
    }
  };

  // ===========================================================
  //  FIREBASE (later): replace the localStorage logic above with
  //  Firestore reads/writes so the data is shared by everyone.
  //  I'll wire this up when you create the free project.
  // ===========================================================
})();
