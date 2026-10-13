// Plain copy for Supabase Auth sign-up errors. Pure, no DOM. The live walkthrough (2026-10-08, D-049) showed the raw
// "email rate limit exceeded" to the member; with the default sender the limit is a few emails an hour.
const RATE_LIMITED = "We can't send the confirmation email right now: too many sign-ups at once. Your account was not created. Please try again in about an hour.";
const ALREADY_REGISTERED = 'An account with this email already exists. Log in instead, or reset your password.';

const isRateLimited = (error) => error?.code === 'over_email_send_rate_limit' || error?.status === 429 || /rate limit/i.test(String(error?.message || ''));

export const signupErrorCopy = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (isRateLimited(error)) return RATE_LIMITED;
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(message)) return ALREADY_REGISTERED;
  return message || 'Could not create your account. Please try again.';
};

// Email code (Phase E Task 3). Supabase answers a wrong code and an expired one alike (403 otp_expired, "Token has
// expired or is invalid"), so the client calls a code expired only when it is older than the code lifetime (Supabase's
// default email OTP expiry, 1 hour) or the server says "expired" without "invalid".
export const OTP_WRONG = "That code didn't work. Check it, or send a new one.";
export const OTP_EXPIRED = "That code has expired. We've sent you a new one.";
export const OTP_TTL_MS = 60 * 60 * 1000;

export const otpErrorKind = (error, msSinceSent = 0) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (error?.status === 429 || /rate_limit/.test(code) || /rate limit|too many/i.test(message)) return 'rate_limited';
  const otpError = code === 'otp_expired' || code === 'invalid_otp' || /token|otp|code/i.test(message);
  if (!otpError || (!error?.status && !code)) return 'other';
  if (/expired/i.test(message) && !/invalid/i.test(message)) return 'expired';
  return Number(msSinceSent) >= OTP_TTL_MS ? 'expired' : 'wrong';
};

// Sending a code (Phase E Task 3 review). On the Code screen (Resend and the automatic resend) a 429 says what to do
// next. On the Email screen it makes no claim about the account: signInWithOtp with shouldCreateUser may or may not
// have created the user before the send failed.
export const CODE_RATE_LIMITED = 'Too many codes requested. Wait a minute, then tap Resend.';
export const EMAIL_RATE_LIMITED = "We can't send a code right now. Please try again in a few minutes.";
export const codeSendErrorCopy = (error) => (isRateLimited(error) ? CODE_RATE_LIMITED : signupErrorCopy(error));
export const emailSendErrorCopy = (error) => (isRateLimited(error) ? EMAIL_RATE_LIMITED : signupErrorCopy(error));

// An expired code: a new one went out (sent), the send failed (error), or none was sent (inside the resend wait, or the
// automatic resend already ran on this screen). resendReady false: Resend is still counting down, so the copy never
// asks for a tap on a disabled button.
export const expiredCodeCopy = ({ sent = false, error = null, resendReady = true } = {}) => {
  if (sent) return OTP_EXPIRED;
  if (error) return `That code has expired. ${codeSendErrorCopy(error)}`;
  return resendReady ? 'That code has expired. Tap Resend for a new one.' : 'That code has expired. Resend will be available in a moment.';
};
