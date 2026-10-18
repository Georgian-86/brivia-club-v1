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
