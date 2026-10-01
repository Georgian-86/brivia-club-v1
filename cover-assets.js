import coverOne from './Images/Cover images/163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG';
import coverTwo from './Images/Cover images/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG';
import coverThree from './Images/Cover images/2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg';
import coverFour from './Images/Cover images/3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG';
import coverFive from './Images/Cover images/3453059c-4864-46f7-ae45-6f7049939b9f.png';
import coverSix from './Images/Cover images/3EBA748D-DAD8-4128-97A0-047E251FDAF4.PNG';
import coverSeven from './Images/Cover images/5ae622b1-88f5-481b-8856-eb2eba35e606.png';
import coverEight from './Images/Cover images/71EFFB34-6301-4196-A085-967D12BF30CE.PNG';
import coverNine from './Images/Cover images/7423007B-E17D-4D46-A19F-499CC9A8DB99.PNG';
import coverTen from './Images/Cover images/9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG';
import coverEleven from './Images/Cover images/95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.PNG';
import coverTwelve from './Images/Cover images/9dc8500a-2dcf-47e6-a6b9-02e441edff68.png';
import coverThirteen from './Images/Cover images/AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG';
import coverFourteen from './Images/Cover images/b66eff76-068e-4f2a-b789-a27051a11f5a.png';
import coverFifteen from './Images/Cover images/BDADEBC8-0C14-4E36-806F-9D23E61E3BD4.PNG';
import coverSixteen from './Images/Cover images/DEB7869C-E852-450F-A371-65E2BF6167A2.PNG';
import coverSeventeen from './Images/Cover images/E7E0AFAA-B547-4228-97C0-88E527151123.PNG';
import coverEighteen from './Images/Cover images/F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG';

const coverAssets = {
  '163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG': coverOne,
  '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG': coverTwo,
  '2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg': coverThree,
  '3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG': coverFour,
  '3453059c-4864-46f7-ae45-6f7049939b9f.png': coverFive,
  '3EBA748D-DAD8-4128-97A0-047E251FDAF4.PNG': coverSix,
  '5ae622b1-88f5-481b-8856-eb2eba35e606.png': coverSeven,
  '71EFFB34-6301-4196-A085-967D12BF30CE.PNG': coverEight,
  '7423007B-E17D-4D46-A19F-499CC9A8DB99.PNG': coverNine,
  '9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG': coverTen,
  '95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.PNG': coverEleven,
  '9dc8500a-2dcf-47e6-a6b9-02e441edff68.png': coverTwelve,
  'AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG': coverThirteen,
  'b66eff76-068e-4f2a-b789-a27051a11f5a.png': coverFourteen,
  'BDADEBC8-0C14-4E36-806F-9D23E61E3BD4.PNG': coverFifteen,
  'DEB7869C-E852-450F-A371-65E2BF6167A2.PNG': coverSixteen,
  'E7E0AFAA-B547-4228-97C0-88E527151123.PNG': coverSeventeen,
  'F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG': coverEighteen,
};

export const defaultCoverUrl = coverOne;

export const normalizeCoverUrl = (url = '') => {
  if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) return url;
  const decoded = decodeURIComponent(url);
  return coverAssets[decoded.split('/').pop()] || url;
};
