export type GuestSong = {
  name: string;
  artist: string;
  genre: string;
};

export function distinctGenres(songs: readonly GuestSong[]): string[] {
  const seen = new Map<string, string>();
  for (const song of songs) {
    const trimmed = song.genre.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

export function filterGuestSongs<T extends GuestSong>(
  songs: readonly T[],
  query: string,
  genre: string,
): T[] {
  const q = query.trim().toLowerCase();
  const wantedGenre = genre.trim().toLowerCase();
  return songs.filter((song) => {
    if (wantedGenre && song.genre.trim().toLowerCase() !== wantedGenre) {
      return false;
    }
    if (!q) return true;
    const hay = `${song.name} ${song.artist} ${song.genre}`.toLowerCase();
    return hay.includes(q);
  });
}
