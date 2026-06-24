# OK Music — first draft

A single page where visitors **play & share your music** on one side and
**scroll your Printify store** on the other, then check out without leaving
the page. No login required to listen or browse.

## How to open it right now

Just double-click `index.html`, or in the terminal:

```
open index.html
```

Everything runs in the browser — no install, no build. It uses sample
tracks and products so you can see the design immediately.

## Files

| File | What it is |
|------|-----------|
| `index.html` | The page structure |
| `styles.css` | All the styling / animations |
| `app.js` | Player logic, store, share, checkout modal |
| `data.js` | **Your content lives here** — tracks & products |

## Add your own music & products (no coding needed)

Open `data.js` and edit the lists:

- **Music**: set `title`, `artist`, `cover` (image path) and `src` (audio file
  path). Put the files in a `covers/` and `audio/` folder next to the page.
- **Products**: for the draft you can type them in by hand. Later they'll be
  pulled automatically from Printify (see below) so you only manage them in
  one place.

## How the money actually works (your setup)

Because you're based in South Sudan with a **Haiti-registered Payoneer**, you
cannot legally charge cards directly on this site — Stripe, PayPal-receive,
Printify Pop-Up, and Etsy are all blocked by country/account rules. So the
merch sale happens on a print-on-demand **marketplace that pays out to
Payoneer**: **Spring (Teespring)** or **Redbubble**.

The real flow:

1. A fan listens & shares your music **here** (free, works from anywhere).
2. They tap a product → it opens that item on your **Spring/Redbubble** store.
3. The marketplace takes the card payment, **prints and ships** the item.
4. Your profit is paid into your **Payoneer (Haiti)** account.

You never touch card data, never run a server, never manually pay anyone.
The marketplace is the fulfiller in this model (not Printify), so re-upload
your existing designs there.

## To switch the Buy buttons on

1. Open a **Spring** (recommended) or **Redbubble** creator account.
2. Set your Payoneer as the payout method.
3. Upload your designs; create your products.
4. Copy each product's link and paste it into `buyUrl` in `data.js`.
5. Set `STORE_NAME` in `data.js` to "Spring" or "Redbubble".

That's it — the Buy buttons go live, no code or server needed.
