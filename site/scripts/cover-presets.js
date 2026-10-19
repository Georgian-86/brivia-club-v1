// The preset cover images members choose from (D-070): the only covers on offer, in signup and in Edit profile.
// There is no upload from the gallery. `stored` is what profiles.cover_url keeps (the original preset path, accepted by
// isPresetCoverUrl and the database's brivia_is_preset_cover); cover-assets.js maps each key to its optimized image.
// Pure, so node can test it.
const PRESETS = [
  { key: '163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG', label: 'THE THOUGHTFUL ROOM' },
  { key: '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG', label: 'MAKE SOMETHING' },
  { key: '2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg', label: 'CREATIVE ENERGY' },
  { key: '3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG', label: 'FIND YOUR MOMENTUM' },
  { key: '3453059c-4864-46f7-ae45-6f7049939b9f.png', label: 'OPEN HORIZONS' },
  { key: '3EBA748D-DAD8-4128-97A0-047E251FDAF4.PNG', label: 'THE NEXT CHAPTER' },
  { key: '5ae622b1-88f5-481b-8856-eb2eba35e606.png', label: 'QUIETLY BOLD' },
  { key: '71EFFB34-6301-4196-A085-967D12BF30CE.PNG', label: 'GOOD ENERGY' },
  { key: '7423007B-E17D-4D46-A19F-499CC9A8DB99.PNG', label: 'OPEN MINDS' },
  { key: '9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG', label: 'MAKE ROOM' },
  { key: '95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.PNG', label: 'STAY CURIOUS' },
  { key: '9dc8500a-2dcf-47e6-a6b9-02e441edff68.png', label: 'NEW PERSPECTIVES' },
  { key: 'AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG', label: 'THE LONG VIEW' },
  { key: 'b66eff76-068e-4f2a-b789-a27051a11f5a.png', label: 'BUILD TOGETHER' },
  { key: 'BDADEBC8-0C14-4E36-806F-9D23E61E3BD4.PNG', label: 'FRESH START' },
  { key: 'DEB7869C-E852-450F-A371-65E2BF6167A2.PNG', label: 'FIND YOUR PACE' },
  { key: 'E7E0AFAA-B547-4228-97C0-88E527151123.PNG', label: 'BETTER TOGETHER' },
  { key: 'F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG', label: 'MAKE IT MATTER' },
];

export const COVER_PRESETS = PRESETS.map(({ key, label }) => ({ key, label, stored: `/Images/Cover%20images/${key}` }));
