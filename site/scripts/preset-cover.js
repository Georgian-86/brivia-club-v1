// Bundled preset covers and illustrations (cover-assets.js): same-site paths, never a third-party host. The same shape
// as brivia_is_preset_cover in the database (0003). Pure, so node can test it (supabase.js re-exports it).
import { resolveCoverKey } from './cover-name.js';

export const isPresetCoverUrl = (value) => {
  const raw = String(value || '').trim();
  return !raw.includes('..') && /^\/(assets\/|Images\/Cover(%20| )images\/)[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(raw);
};

// The covers Brivia provides (D-080): members choose from these only, never their own picture. The order and titles are
// the signup picker's (auth.html). The same 18 names are brivia_private.brivia_offered_cover_keys() in 0014 and the
// keys of cover-assets.js; tests/unit/preset-cover.test.mjs pins all four equal.
export const PRESET_COVERS = [
  { key: '163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG', title: 'THE THOUGHTFUL ROOM' },
  { key: '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG', title: 'MAKE SOMETHING' },
  { key: '2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg', title: 'CREATIVE ENERGY' },
  { key: '3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG', title: 'FIND YOUR MOMENTUM' },
  { key: '3453059c-4864-46f7-ae45-6f7049939b9f.png', title: 'OPEN HORIZONS' },
  { key: '3EBA748D-DAD8-4128-97A0-047E251FDAF4.PNG', title: 'THE NEXT CHAPTER' },
  { key: '5ae622b1-88f5-481b-8856-eb2eba35e606.png', title: 'QUIETLY BOLD' },
  { key: '71EFFB34-6301-4196-A085-967D12BF30CE.PNG', title: 'GOOD ENERGY' },
  { key: '7423007B-E17D-4D46-A19F-499CC9A8DB99.PNG', title: 'OPEN MINDS' },
  { key: '9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG', title: 'MAKE ROOM' },
  { key: '95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.PNG', title: 'STAY CURIOUS' },
  { key: '9dc8500a-2dcf-47e6-a6b9-02e441edff68.png', title: 'NEW PERSPECTIVES' },
  { key: 'AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG', title: 'THE LONG VIEW' },
  { key: 'b66eff76-068e-4f2a-b789-a27051a11f5a.png', title: 'BUILD TOGETHER' },
  { key: 'BDADEBC8-0C14-4E36-806F-9D23E61E3BD4.PNG', title: 'FRESH START' },
  { key: 'DEB7869C-E852-450F-A371-65E2BF6167A2.PNG', title: 'FIND YOUR PACE' },
  { key: 'E7E0AFAA-B547-4228-97C0-88E527151123.PNG', title: 'BETTER TOGETHER' },
  { key: 'F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG', title: 'MAKE IT MATTER' },
];
export const PRESET_COVER_KEYS = PRESET_COVERS.map((cover) => cover.key);
const PREFIX = '/Images/Cover%20images/';
export const presetCoverStoredPath = (key) => `${PREFIX}${key}`;

// The one stored form of a cover (what 0014 accepts): exactly '/Images/Cover%20images/<key>'.
export const isOfferedCoverPath = (value) => typeof value === 'string' && value.startsWith(PREFIX) && PRESET_COVER_KEYS.includes(value.slice(PREFIX.length));

// The stored path a value stands for (any form the client ever stored or rendered: the canonical path, a spaced one,
// an old Vite-hashed /assets/ build URL, a dev /media/ URL), or '' when it is not one of the provided covers (an upload,
// another host, data:/blob:, an unknown path). The client twin of brivia_private.brivia_offered_cover_for (0014).
export const presetCoverPath = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || raw.includes('..') || /^(https?:|data:|blob:|\/\/)/i.test(raw)) return '';
  const key = resolveCoverKey(raw, PRESET_COVER_KEYS);
  return key ? presetCoverStoredPath(key) : '';
};
