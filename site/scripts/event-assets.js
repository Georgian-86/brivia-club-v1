// Event images (D-117): list_events returns an image_key, never a URL, so an event can only show an image the site
// ships. The images are the club's own cover set (already bundled for profile covers; Vite emits each file once).
import jam from '../media/Images/Cover images/3453059c-4864-46f7-ae45-6f7049939b9f.webp';
import tech from '../media/Images/Cover images/5ae622b1-88f5-481b-8856-eb2eba35e606.webp';
import chess from '../media/Images/Cover images/3157077F-6C3B-4D85-BC8B-4646C85B33D1.webp';
import dandiya from '../media/Images/Cover images/A6651B99-E0B9-472B-92FB-BABD5C87D2A0.webp';
import badminton from '../media/Images/Cover images/7C0B5EFA-4E04-4BEC-AB5D-F7FD8FAA3A52.webp';
import food from '../media/Images/Cover images/0F866BC9-857A-4BD6-A73F-70B0E3A1D787.webp';
import vinyl from '../media/Images/Cover images/66F669B5-3A06-4DDA-BDA9-C000623010CC.webp';
import photo from '../media/Images/Cover images/94978B9F-A399-43FC-AC48-0A41088B5D27.webp';
import desk from '../media/Images/Cover images/9358893B-8EAB-4FD2-8E2E-A4812398D008.webp';

const BY_KEY = Object.freeze({ jam, tech, chess, dandiya, badminton, food, vinyl, photo, desk });
const BY_CATEGORY = Object.freeze({ music: jam, tech, games: chess, culture: dandiya, sports: badminton, food, art: photo, networking: desk });

// The image for an event: its own key, else its category's, else '' (the card shows the wine gradient).
export const eventImageSrc = (event) => BY_KEY[event?.imageKey] || BY_CATEGORY[event?.category] || '';
