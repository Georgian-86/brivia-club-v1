// Which image a community post shows (Phase D Task 2). Post images auto-load in every viewer's browser, so only two
// kinds render: the author's own community-posts Storage file, and a preset illustration identifier (0008 section 4
// lets only test members store one; the seed's posts use it), resolved to the shipped asset by normalizeCoverUrl.
// Anything else, including a preset-shaped name with no shipped asset, returns '' and the feed shows its placeholder.
// Pure: the browser helpers are passed in (supabase.js, cover-assets.js), so node can test it.
export const postImageSrc = (post, { isStorageImageUrl, isPresetCoverUrl, normalizeCoverUrl }) => {
  const url = post?.image_url;
  if (!url) return '';
  if (isStorageImageUrl(url, 'community-posts', post.author_id)) return url;
  if (isPresetCoverUrl(url)) {
    const resolved = normalizeCoverUrl(url);
    return resolved && resolved !== url ? resolved : '';
  }
  return '';
};
