// Password reset (D-090), pure helpers for the login card's "Forgot password?" flow. No DOM, no Supabase client.
// The flow: request a link (resetPasswordForEmail, redirect back to auth.html) -> Supabase's email -> auth.html with
// `#...&type=recovery` (implicit flow) -> choose a new password (updateUser) -> the app.
export const MIN_PASSWORD = 8; // the signup's minimum (signup-screens.js, script.js)

export const LINK_EXPIRED = 'That reset link has expired or was already used. Enter your email to get a new one.';
// The same line whether or not an account exists, so the form never reveals who is a member.
export const RESET_SENT = (email) => `If an account exists for ${email}, a reset link is on its way. Check your inbox and spam folder.`;

// Reads the URL hash Supabase returns to: a recovery session (`type=recovery`) or an error (an expired or used link).
export const readAuthHash = (hash) => {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const errorCode = params.get('error_code');
  const description = params.get('error_description');
  let error = null;
  if (errorCode === 'otp_expired' || /expired|invalid/i.test(description || '')) error = LINK_EXPIRED;
  else if (description || params.get('error')) error = description || params.get('error');
  return { recovery: params.get('type') === 'recovery' && params.has('access_token'), error };
};

// null when the new password can be saved, else the line to show beside the form.
export const newPasswordProblem = (password, confirm) => {
  if (String(password).length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for your password.`;
  if (password !== confirm) return "The two passwords don't match.";
  return null;
};

export const resetRequestError = (error) => {
  const message = error?.message || '';
  if (/only request this after/i.test(message)) return message;
  if (error?.status === 429 || /rate limit/i.test(`${error?.code || ''} ${message}`)) return 'Too many reset emails were requested. Please wait a few minutes and try again.';
  return "We couldn't send the reset link. Please try again in a moment.";
};

export const passwordUpdateError = (error) => {
  const code = error?.code || '';
  const message = error?.message || '';
  if (code === 'same_password' || /different from the old password/i.test(message)) return 'Choose a password different from your current one.';
  if (error?.name === 'AuthSessionMissingError' || /session missing|session_not_found/i.test(`${code} ${message}`)) return LINK_EXPIRED;
  if (code === 'weak_password' && message) return message;
  return "We couldn't save your new password. Please try again.";
};
