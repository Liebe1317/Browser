export interface YouTubeVideoResult {
  id: string;
  title: string;
  channel: string;
  channelAvatar?: string;
  views: string;
  time: string;
  duration: string;
  thumbnail: string;
  category?: string;
  verified: boolean;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  if (!record) return '';
  if (typeof record.simpleText === 'string') return record.simpleText;
  if (Array.isArray(record.runs)) {
    return record.runs
      .map((run) => {
        const item = asRecord(run);
        return item && typeof item.text === 'string' ? item.text : '';
      })
      .join('');
  }
  return '';
}

/** Parse ytInitialData without eval and without assuming the JSON is on one line. */
export function parseYouTubeInitialData(html: string): unknown | null {
  const marker = /ytInitialData\\s*=\\s*/g;
  const match = marker.exec(html);
  if (!match) return null;

  let start = marker.lastIndex;
  while (/\s/.test(html[start] || '')) start++;
  if (html[start] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Collect real videoRenderer entries from supported YouTube response layouts. */
export function extractYouTubeVideos(html: string, category?: string): YouTubeVideoResult[] {
  const root = asRecord(parseYouTubeInitialData(html));
  if (!root) return [];

  const results: YouTubeVideoResult[] = [];
  const seen = new Set<string>();
  const stack: unknown[] = [root];
  let visited = 0;

  while (stack.length && visited < 100_000 && results.length < 24) {
    const current = stack.pop();
    visited++;
    if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i--) stack.push(current[i]);
      continue;
    }
    const record = asRecord(current);
    if (!record) continue;

    const video = asRecord(record.videoRenderer);
    if (video) {
      const id = typeof video.videoId === 'string' ? video.videoId : '';
      if (/^[A-Za-z0-9_-]{11}$/.test(id) && !seen.has(id)) {
        const title = textValue(video.title);
        const channel = textValue(video.ownerText) || textValue(video.shortBylineText) || 'قناة غير معروفة';
        const thumbnails = asRecord(video.thumbnail)?.thumbnails;
        const thumbList = Array.isArray(thumbnails) ? thumbnails : [];
        const thumbnailCandidate = thumbList.length
          ? asRecord(thumbList[thumbList.length - 1])?.url
          : undefined;
        const thumbnail = typeof thumbnailCandidate === 'string' &&
          /^https:\/\/(?:i\.ytimg\.com|yt3\.ggpht\.com|lh3\.googleusercontent\.com)\//i.test(thumbnailCandidate)
          ? thumbnailCandidate
          : 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
        const avatarRoot = asRecord(video.channelThumbnailSupportedRendered);
        const avatarLink = asRecord(avatarRoot?.channelThumbnailWithLinkRenderer);
        const avatar = asRecord(avatarLink?.thumbnail);
        const avatarItems = Array.isArray(avatar?.thumbnails) ? avatar.thumbnails : [];
        const avatarUrl = asRecord(avatarItems[0])?.url;
        const safeAvatar = typeof avatarUrl === 'string' &&
          /^https:\/\/(?:yt3\.ggpht\.com|lh3\.googleusercontent\.com)\//i.test(avatarUrl)
          ? avatarUrl
          : undefined;

        seen.add(id);
        results.push({
          id,
          title: title.slice(0, 300) || 'فيديو بدون عنوان',
          channel: channel.slice(0, 160),
          ...(safeAvatar ? { channelAvatar: safeAvatar } : {}),
          views: (textValue(video.shortViewCountText) || '—').slice(0, 80),
          time: (textValue(video.publishedTimeText) || '').slice(0, 80),
          duration: (textValue(video.lengthText) || '—').slice(0, 30),
          thumbnail,
          ...(category ? { category } : {}),
          verified: Array.isArray(video.ownerBadges) && video.ownerBadges.length > 0,
        });
      }
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }

  return results;
}
