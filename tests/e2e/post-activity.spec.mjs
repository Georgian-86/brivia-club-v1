// Post activity on Explore (D-101, migration 0015): counts and "Liked by <connection>" on the card, a like moves the
// count, threaded comments in the detail sheet (post, reply, a reply to a reply, delete with its replies), and a share
// sheet that sends the link to a connection as a chat message, copies the link, and counts the share once.
// PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/post-activity.spec.mjs   (Vite on :5182)
// POST_SHOTS=<dir> also saves the card and the detail sheet at 390 and 1440.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { axeViolations } from './a11y.mjs';
import { startAppStub, ME } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.POST_SHOTS || '';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const B = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
const POSTS = [
  { id: 'post-1', author_id: B, image_url: '/Images/Cover%20images/94978B9F-A399-43FC-AC48-0A41088B5D27.PNG', image_path: '', caption: 'Sunday rally at the courts.', created_at: ago(1) },
  { id: 'post-2', author_id: A, image_url: '/Images/Cover%20images/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG', image_path: '', caption: 'Chess night.', created_at: ago(3) },
];
const AUTHORS = [
  { id: A, name: 'Asha Band', photo_url: null, cover_url: null, experience: 'Designer', skills: [], looking_for: [] },
  { id: B, name: 'Bilal Place', photo_url: null, cover_url: null, experience: 'Engineer', skills: [], looking_for: [] },
];
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const freshState = () => ({
  matchIds: [A], posts: POSTS, routes: { 'rpc/get_candidates': { body: AUTHORS } },
  activity: [
    { post_id: 'post-1', like_count: 4, liked_by_me: false, comment_count: 2, share_count: 1, connection_likers: [A] },
    { post_id: 'post-2', like_count: 0, liked_by_me: false, comment_count: 0, share_count: 0, connection_likers: [] },
  ],
  comments: [
    { id: 'c1', post_id: 'post-1', author_id: A, parent_id: null, body: 'Great rally!', created_at: ago(0.8) },
    { id: 'c2', post_id: 'post-1', author_id: B, parent_id: 'c1', body: 'Thanks Asha', created_at: ago(0.5) },
  ],
});
const st = freshState();
const stub = await startAppStub({ port: 5182, state: st });
const browser = await chromium.launch();
const errors = [];
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    Object.assign(st, freshState());
    const ctx = await stub.newContext(browser, { width: w, height: h }, { reducedMotion: 'reduce', ...(w < 780 ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: stub.url });
    const page = await stub.open(ctx, { path: '/app.html?view=posts', errors });
    page.setDefaultTimeout(6000);
    await page.waitForSelector('.post-card[data-post-id="post-1"] .post-card-count');
    const card = page.locator('.post-card[data-post-id="post-1"]');
    const counts = async () => card.evaluate((c) => Object.fromEntries([...c.querySelectorAll('.post-card-count')].map((b) => [b.dataset.postCount, b.textContent])));
    check(`${w}: the card shows like, comment and share counts`, JSON.stringify(await counts()) === JSON.stringify({ like: '4', comment: '2', share: '1' }), JSON.stringify(await counts()));
    check(`${w}: a connection who liked is named`, (await card.locator('[data-post-likes]').textContent()) === 'Liked by Asha Band and 3 others');
    const quiet = page.locator('.post-card[data-post-id="post-2"]');
    check(`${w}: a post with no activity has no counts and invites the first like`, await quiet.locator('.post-card-count').count() === 0 && (await quiet.locator('.post-card-footer [data-post-likes]').textContent()) === 'Be the first to like this');
    const rows = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#community-post-list .post-card')];
      const byTop = new Map();
      cards.forEach((c) => { const t = Math.round(c.getBoundingClientRect().top); byTop.set(t, [...(byTop.get(t) || []), c]); });
      return { footers: cards.every((c) => c.querySelectorAll('.post-card-footer').length === 1), rows: [...byTop.values()].map((row) => [...new Set(row.map((c) => Math.round(c.querySelector('.post-card-actions').getBoundingClientRect().top)))].length), wraps: cards.some((c) => c.querySelector('.post-card-footer').offsetHeight !== 40) };
    });
    check(`${w}: every card has one 40 px footer and the action bars in a row line up (${JSON.stringify(rows)})`, rows.footers && !rows.wraps && rows.rows.every((n) => n === 1));

    await card.locator('.post-card-actions [data-post-action="like"]').click();
    await page.waitForTimeout(200);
    check(`${w}: a like moves the count and names me first`, (await counts()).like === '5' && (await card.locator('[data-post-likes]').textContent()) === 'Liked by You, Asha Band and 3 others', `${JSON.stringify(await counts())} ${await card.locator('[data-post-likes]').textContent()}`);
    await card.locator('.post-card-actions [data-post-action="like"]').click();
    await page.waitForTimeout(200);
    check(`${w}: unliking moves it back`, (await counts()).like === '4');

    // Comments: the thread, a reply, a reply to a reply (@name), delete.
    await card.locator('.post-card-comments-link').click();
    await page.waitForSelector('#post-detail[open] .post-comment[data-comment-id="c1"]');
    const thread = await page.evaluate(() => ({
      top: [...document.querySelectorAll('#post-detail .post-comments-thread > .post-comment')].map((c) => c.dataset.commentId),
      reply: document.querySelector('#post-detail .post-comment[data-comment-id="c1"] > .post-comment-replies > .post-comment')?.dataset.commentId,
      stats: document.querySelector('#post-detail [data-post-detail-stats]')?.innerText.replace(/\s+/g, ' ').trim(),
    }));
    check(`${w}: replies sit under their comment`, JSON.stringify(thread.top) === '["c1"]' && thread.reply === 'c2', JSON.stringify(thread));
    check(`${w}: the sheet shows likes and shares`, /Liked by Asha Band and 3 others/.test(thread.stats) && /1 share/.test(thread.stats), thread.stats);
    const input = page.locator('#post-comment-input');
    await input.fill('See you next week');
    await page.locator('.post-comment-send').click();
    await page.waitForSelector('#post-detail .post-comments-thread > .post-comment:nth-child(2)');
    check(`${w}: a new comment lands at the end of the thread`, (await page.locator('#post-detail .post-comments-thread > .post-comment').nth(1).locator('.post-comment-body').textContent()) === 'See you next week');
    check(`${w}: the card's comment count follows`, (await counts()).comment === '3', JSON.stringify(await counts()));
    await page.locator('#post-detail .post-comment[data-comment-id="c2"] [data-comment-reply]').first().click();
    check(`${w}: Reply says who is answered`, (await page.locator('[data-replying] span').textContent()) === 'Replying to Bilal Place');
    await input.fill('Count me in');
    await input.press('Enter');
    await page.waitForFunction(() => document.querySelector('#post-detail .post-comment[data-comment-id="c2"] .post-comment-replies .post-comment'));
    const deep = await page.evaluate(() => {
      const n = document.querySelector('#post-detail .post-comment[data-comment-id="c2"] .post-comment-replies .post-comment');
      return { depth: n?.dataset.depth, body: n?.querySelector('.post-comment-body')?.textContent };
    });
    const sentReply = st.comments.find((c) => c.body === 'Count me in');
    check(`${w}: a reply to a reply nests and names who it answers`, deep.depth === '2' && deep.body === '@Bilal Place Count me in' && sentReply?.parent_id === 'c2', JSON.stringify({ deep, sentReply }));
    check(`${w}: the reply chip clears after posting`, await page.locator('[data-replying]').isHidden());
    page.once('dialog', (d) => d.accept());
    await page.locator('#post-detail .post-comment[data-comment-id="c2"] [data-comment-delete]').first().click().catch(() => {});
    // c2 is Bilal's on Bilal's post: I am neither, so there is no Delete; delete my own comment instead.
    const mineId = st.comments.find((c) => c.body === 'See you next week')?.id;
    const hasDeleteOnTheirs = await page.locator('#post-detail .post-comment[data-comment-id="c1"] > .post-comment-main [data-comment-delete]').count();
    check(`${w}: no Delete on someone else's comment on someone else's post`, hasDeleteOnTheirs === 0);
    page.once('dialog', (d) => d.accept());
    await page.locator(`#post-detail .post-comment[data-comment-id="${mineId}"] [data-comment-delete]`).click();
    await page.waitForFunction((id) => !document.querySelector(`#post-detail .post-comment[data-comment-id="${id}"]`), mineId);
    check(`${w}: deleting my comment removes it`, !st.comments.some((c) => c.id === mineId));
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `detail-${w}.png`) }); }
    const axe = await axeViolations(page, { include: '#post-detail' });
    check(`${w}: axe on the sheet with comments`, axe.length === 0, JSON.stringify(axe.map((v) => v.id)));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#post-detail'));

    // Share: send to a connection, copy the link; the count goes up once.
    await card.locator('.post-card-actions [data-post-action="share"]').click();
    await page.waitForSelector('#post-share[open] [data-share-to]');
    const people = await page.$$eval('#post-share .post-share-name', (n) => n.map((x) => x.textContent));
    check(`${w}: the share sheet lists connections only`, JSON.stringify(people) === '["Asha Band"]', JSON.stringify(people));
    const axeShare = await axeViolations(page, { include: '#post-share' });
    check(`${w}: axe on the share sheet`, axeShare.length === 0, JSON.stringify(axeShare.map((v) => v.id)));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `share-${w}.png`) });
    await page.locator('#post-share [data-share-to]').click();
    await page.waitForFunction(() => document.querySelector('#post-share [data-share-to]')?.textContent === 'Sent');
    const sent = (st.sent || []).at(-1);
    check(`${w}: the connection gets the link as a message, with no caption or name`, sent?.recipient_id === A && /explore\.html\?post=post-1$/.test(sent.body) && !/Sunday|Bilal/.test(sent.body), JSON.stringify(sent));
    check(`${w}: the share is counted`, (await counts()).share === '2', JSON.stringify(await counts()));
    await page.locator('#post-share [data-share-copy]').click();
    await page.waitForTimeout(300);
    check(`${w}: Copy link copies the post's link`, /explore\.html\?post=post-1$/.test(await page.evaluate(() => navigator.clipboard.readText())));
    check(`${w}: a second share by me is not counted twice`, (await counts()).share === '2', JSON.stringify(await counts()));
    if (SHOTS) await page.locator('.post-card[data-post-id="post-1"]').screenshot({ path: path.join(SHOTS, `card-${w}.png`) });
    await ctx.close();
  }
  // A post shared in chat shows as a card (image, author, caption, View post), which opens the post; a post the member
  // cannot see (or that is gone) says so; the inbox row reads "Shared a post", not the link.
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    Object.assign(st, freshState());
    st.messages = [
      { id: 'm-share', sender_id: A, recipient_id: ME, body: `Shared a post with you on Brivia Club: https://thebriviaclub.live/explore.html?post=post-1`, created_at: ago(0.2) },
      { id: 'm-gone', sender_id: A, recipient_id: ME, body: 'https://thebriviaclub.live/explore.html?post=post-404', created_at: ago(0.1) },
    ];
    const ctx = await stub.newContext(browser, { width: w, height: h }, { reducedMotion: 'reduce', ...(w < 780 ? { isMobile: true, hasTouch: true } : {}) });
    const page = await stub.open(ctx, { path: '/app.html?view=chat', errors });
    page.setDefaultTimeout(8000);
    await page.waitForSelector('.chat-row .chat-row-copy strong');
    const row = await page.locator('.chat-row', { hasText: 'Asha Band' }).locator('.chat-row-copy > span').textContent();
    check(`${w}: the inbox row says "Shared a post", not the link`, row === 'Shared a post', row);
    await page.locator('.chat-row-open', { hasText: 'Asha Band' }).click();
    await page.waitForSelector('#chat-messages .message-post:not(.is-loading) .message-post-open');
    const card = await page.evaluate(() => {
      const c = document.querySelector('#chat-messages .message-post:not(.is-gone)');
      return { img: c?.querySelector('.message-post-media img')?.getAttribute('src'), author: c?.querySelector('.message-post-author')?.innerText.trim(), caption: c?.querySelector('.message-post-caption')?.textContent, link: document.querySelector('#chat-messages')?.innerText.includes('explore.html'), gone: document.querySelector('#chat-messages .message-post.is-gone')?.innerText.trim() };
    });
    check(`${w}: the shared post shows as a card with image, author and caption, not a raw link`, /94978B9F/.test(card.img || '') && card.author === 'Bilal Place' && card.caption === 'Sunday rally at the courts.' && !card.link, JSON.stringify(card));
    check(`${w}: a post that is gone says so`, /no longer available/.test(card.gone || ''), JSON.stringify(card));
    const axeCard = await axeViolations(page, { include: '#chat-messages .message-post' });
    check(`${w}: axe on the chat with the post card`, axeCard.length === 0, JSON.stringify(axeCard));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `chat-post-${w}.png`) });
    await page.locator('#chat-messages [data-shared-post-open]').click();
    await page.waitForSelector('#post-detail[open]');
    const opened = await page.evaluate(() => ({ view: document.body.dataset.appView, caption: document.querySelector('#post-detail[open] .post-detail-caption')?.textContent }));
    check(`${w}: View post opens the post on Explore`, opened.view === 'posts' && opened.caption === 'Sunday rally at the courts.', JSON.stringify(opened));
    await ctx.close();
  }
  check('no page errors', errors.length === 0, JSON.stringify(errors));
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
