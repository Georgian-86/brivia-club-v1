// Plain copy for Supabase Auth sign-up errors. Pure, no DOM. The live walkthrough (2026-10-08, D-049) showed the raw
// "email rate limit exceeded" to the member; with the default sender the limit is a few emails an hour.
const RATE_LIMITED = "We can't send the confirmation email right now: too many sign-ups at once. Your account was not created. Please try again in about an hour.";
const ALREADY_REGISTERED = 'An account with this email already exists. Log in instead, or reset your password.';

export const signupErrorCopy = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (code === 'over_email_send_rate_limit' || error?.status === 429 || /rate limit/i.test(message)) return RATE_LIMITED;
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(message)) return ALREADY_REGISTERED;
  return message || 'Could not create your account. Please try again.';
};

// D-222: plain copy for log-in errors (Supabase's "Invalid login credentials" or a browser's "Failed to fetch" were
// shown raw). `online` is navigator.onLine.
export const LOGIN_FAILED = 'That email and password do not match. Try again, or reset your password below.';
export const loginErrorCopy = (error, { online = true } = {}) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (!online || /failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return 'No connection right now. Check your internet and try again.';
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return LOGIN_FAILED;
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return 'Confirm your email first: open the link we sent you, then log in here.';
  }
  if (code === 'over_request_rate_limit' || error?.status === 429 || /rate limit/i.test(message)) {
    return 'Too many tries in a row. Wait a minute, then try again.';
  }
  if (/not configured/i.test(message)) return 'Log in is unavailable right now. Please try again shortly.';
  return message || 'Could not sign you in. Check your email and password.';
};
