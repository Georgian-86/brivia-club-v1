// privacy.html: after an account deletion Task 9 lands members on /privacy.html?deleted=1 (R5). The status region is
// in the page from the start (empty), so assistive tech announces the text once it is filled in.
export const DELETED_MESSAGE = 'Your account and everything in it has been deleted. Sorry to see you go.';
const banner = document.getElementById('deleted-banner');
if (banner && new URLSearchParams(window.location.search).get('deleted') === '1') {
  banner.textContent = DELETED_MESSAGE;
  // The member is signed out by now: a link into the app would only bounce them to the login.
  document.querySelector('.header-link')?.setAttribute('hidden', '');
}
