import express from "express";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

let appToken = null;
let appTokenExpiresAt = 0;

// Get/refresh app-only token using Client Credentials
async function getAppToken() {
  const now = Date.now();
  if (appToken && now < appTokenExpiresAt - 10_000) return appToken;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
  });

  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const { data } = await axios.post(
    "https://accounts.spotify.com/api/token",
    body.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
    }
  );

  appToken = data.access_token;
  appTokenExpiresAt = Date.now() + data.expires_in * 1000;
  return appToken;
}

// Helper: Spotify Web API GET
async function spGet(path, params = {}) {
  const token = await getAppToken();
  const { data } = await axios.get(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  return data;
}

/**
 * Example routes you can call from your front end or via curl
 */

// Search artists
app.get("/api/search-artists", async (req, res) => {
  try {
    const q = req.query.q ?? "taylor swift";
    const data = await spGet("/search", { q, type: "artist", limit: 10 });
    res.json(data.artists.items);
  } catch (e) {
    res.status(500).json({ error: e?.response?.data ?? e.message });
  }
});

// Related artists (good for building the network)
app.get("/api/related/:artistId", async (req, res) => {
  try {
    const data = await spGet(`/artists/${req.params.artistId}/related-artists`);
    res.json(data.artists);
  } catch (e) {
    res.status(500).json({ error: e?.response?.data ?? e.message });
  }
});

// Simple “collaborators” example: fetch an artist’s top tracks and
// list co-credited artists on those tracks
app.get("/api/collaborators/:artistId", async (req, res) => {
  try {
    const market = req.query.market ?? "US";
    const top = await spGet(`/artists/${req.params.artistId}/top-tracks`, { market });
    const collabCounts = new Map();
    for (const t of top.tracks) {
      const others = t.artists.filter(a => a.id !== req.params.artistId);
      for (const a of others) {
        collabCounts.set(a.id, {
          ...a,
          count: (collabCounts.get(a.id)?.count ?? 0) + 1
        });
      }
    }
    res.json([...collabCounts.values()].sort((a,b)=>b.count-a.count));
  } catch (e) {
    res.status(500).json({ error: e?.response?.data ?? e.message });
  }
});

const port = process.env.PORT ?? 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
