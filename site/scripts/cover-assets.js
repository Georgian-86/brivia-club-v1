import coverThirteen from '../media/Images/Cover images/AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.webp';
import coverTwentyTwo from '../media/Images/Cover images/7C0B5EFA-4E04-4BEC-AB5D-F7FD8FAA3A52.webp';
import coverFourteen from '../media/Images/Cover images/b66eff76-068e-4f2a-b789-a27051a11f5a.webp';
import coverFive from '../media/Images/Cover images/3453059c-4864-46f7-ae45-6f7049939b9f.webp';
import coverTwentyOne from '../media/Images/Cover images/66F669B5-3A06-4DDA-BDA9-C000623010CC.webp';
import coverTwentySix from '../media/Images/Cover images/A6651B99-E0B9-472B-92FB-BABD5C87D2A0.webp';
import coverFifteen from '../media/Images/Cover images/BDADEBC8-0C14-4E36-806F-9D23E61E3BD4.webp';
import coverNineteen from '../media/Images/Cover images/0F866BC9-857A-4BD6-A73F-70B0E3A1D787.webp';
import coverTwentyThree from '../media/Images/Cover images/84F018B6-29FB-4060-B2D9-E7DC157CE87E.webp';
import coverEleven from '../media/Images/Cover images/95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.webp';
import coverSeven from '../media/Images/Cover images/5ae622b1-88f5-481b-8856-eb2eba35e606.webp';
import coverTen from '../media/Images/Cover images/9358893B-8EAB-4FD2-8E2E-A4812398D008.webp';
import coverTwenty from '../media/Images/Cover images/2BA86035-CBE4-4609-8AFC-E74F149DF54E.webp';
import coverEighteen from '../media/Images/Cover images/F28EA63E-1BEB-49E9-BA01-F62127017DB1.webp';
import coverSeventeen from '../media/Images/Cover images/E7E0AFAA-B547-4228-97C0-88E527151123.webp';
import coverSix from '../media/Images/Cover images/3EBA748D-DAD8-4128-97A0-047E251FDAF4.webp';
import coverThree from '../media/Images/Cover images/2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.webp';
import coverEight from '../media/Images/Cover images/71EFFB34-6301-4196-A085-967D12BF30CE.webp';
import coverTwelve from '../media/Images/Cover images/9dc8500a-2dcf-47e6-a6b9-02e441edff68.webp';
import coverTwo from '../media/Images/Cover images/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.webp';
import coverTwentyFive from '../media/Images/Cover images/9761496E-AA69-4C9F-9F63-773B6FB53D94.webp';
import coverTwentySeven from '../media/Images/Cover images/EFFF6FA8-4DBE-44CC-8980-661B610AB1A2.webp';
import coverFour from '../media/Images/Cover images/3157077F-6C3B-4D85-BC8B-4646C85B33D1.webp';
import coverTwentyFour from '../media/Images/Cover images/94978B9F-A399-43FC-AC48-0A41088B5D27.webp';
import coverSixteen from '../media/Images/Cover images/DEB7869C-E852-450F-A371-65E2BF6167A2.webp';
import { resolveCoverKey } from './cover-name.js';

const coverAssets = {
  'AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG': coverThirteen,
  '7C0B5EFA-4E04-4BEC-AB5D-F7FD8FAA3A52.PNG': coverTwentyTwo,
  'b66eff76-068e-4f2a-b789-a27051a11f5a.png': coverFourteen,
  '3453059c-4864-46f7-ae45-6f7049939b9f.png': coverFive,
  '66F669B5-3A06-4DDA-BDA9-C000623010CC.PNG': coverTwentyOne,
  'A6651B99-E0B9-472B-92FB-BABD5C87D2A0.PNG': coverTwentySix,
  'BDADEBC8-0C14-4E36-806F-9D23E61E3BD4.PNG': coverFifteen,
  '0F866BC9-857A-4BD6-A73F-70B0E3A1D787.PNG': coverNineteen,
  '84F018B6-29FB-4060-B2D9-E7DC157CE87E.PNG': coverTwentyThree,
  '95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.PNG': coverEleven,
  '5ae622b1-88f5-481b-8856-eb2eba35e606.png': coverSeven,
  '9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG': coverTen,
  '2BA86035-CBE4-4609-8AFC-E74F149DF54E.PNG': coverTwenty,
  'F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG': coverEighteen,
  'E7E0AFAA-B547-4228-97C0-88E527151123.PNG': coverSeventeen,
  '3EBA748D-DAD8-4128-97A0-047E251FDAF4.PNG': coverSix,
  '2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg': coverThree,
  '71EFFB34-6301-4196-A085-967D12BF30CE.PNG': coverEight,
  '9dc8500a-2dcf-47e6-a6b9-02e441edff68.png': coverTwelve,
  '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG': coverTwo,
  '9761496E-AA69-4C9F-9F63-773B6FB53D94.PNG': coverTwentyFive,
  'EFFF6FA8-4DBE-44CC-8980-661B610AB1A2.PNG': coverTwentySeven,
  '3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG': coverFour,
  '94978B9F-A399-43FC-AC48-0A41088B5D27.PNG': coverTwentyFour,
  'DEB7869C-E852-450F-A371-65E2BF6167A2.PNG': coverSixteen,
};

// The default cover (preset-cover.js DEFAULT_COVER_KEY, SMASH THEORY): the signup picker's preselected one and what a
// member with no cover sees. D-128 moved it from first to 20th in the order; the picture did not change.
export const defaultCoverUrl = coverTwo;

const coverKeys = Object.keys(coverAssets);

// Stored values stay the original preset paths (/Images/Cover%20images/<name>, see supabase.js isPresetCoverUrl);
// legacy Vite-hashed values (/assets/<name>-<hash>.PNG) and optimized build URLs (<stem>-<hash>.webp) resolve too.
export const normalizeCoverUrl = (url = '') => {
  if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) return url;
  const key = resolveCoverKey(url, coverKeys);
  return key ? coverAssets[key] : url;
};
