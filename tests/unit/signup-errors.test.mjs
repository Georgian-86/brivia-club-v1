// Sign-up error copy (live walkthrough 2026-10-08: the raw "email rate limit exceeded" reached the member).
import test from 'node:test';
import assert from 'node:assert/strict';
import { signupErrorCopy, otpErrorKind, OTP_WRONG, OTP_EXPIRED, OTP_TTL_MS } from '../../signup-errors.js';

test('the auth email rate limit gets plain copy and a when-to-retry', () => {
  const copy = signupErrorCopy({ code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' });
  assert.equal(copy, "We can't send the confirmation email right now: too many sign-ups at once. Your account was not created. Please try again in about an hour.");
  assert.equal(signupErrorCopy({ status: 429, message: 'Too many requests' }), copy);
});
test('an email that is already registered points to log in', () => {
  const copy = 'An account with this email already exists. Log in instead, or reset your password.';
  assert.equal(signupErrorCopy({ code: 'user_already_exists', status: 422, message: 'User already registered' }), copy);
  assert.equal(signupErrorCopy({ message: 'User already registered' }), copy);
});
// Final fix Minor 5: an unknown error never shows Supabase's raw message.
test('unknown errors get a generic line, never the raw server message', () => {
  const generic = 'Something went wrong. Please try again.';
  assert.equal(signupErrorCopy({ message: 'Password should be at least 8 characters.' }), generic);
  assert.equal(signupErrorCopy({ status: 500, message: 'Database error saving new user' }), generic);
  assert.equal(signupErrorCopy(null), generic);
});

// Phase E Task 3: Supabase answers a wrong code and an old code alike (403 otp_expired, "Token has expired or is
// invalid"), so a code is called expired only when it is older than the OTP lifetime (or the server says only "expired").
test('otpErrorKind tells a wrong code from an expired one', () => {
  const either = { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' };
  assert.equal(otpErrorKind(either, 5_000), 'wrong');
  assert.equal(otpErrorKind(either, OTP_TTL_MS + 1), 'expired');
  assert.equal(otpErrorKind({ code: 'otp_expired', status: 403, message: 'Token has expired' }, 5_000), 'expired');
  assert.equal(otpErrorKind({ code: 'over_request_rate_limit', status: 429, message: 'Too many requests' }, 5_000), 'rate_limited');
  assert.equal(otpErrorKind({ status: 0, message: 'Failed to fetch' }, 5_000), 'other');
  assert.equal(OTP_WRONG, "That code didn't work. Check it, or send a new one.");
  assert.equal(OTP_EXPIRED, "That code has expired. We've sent you a new one.");
});

// Phase E Task 3 review (I1, M1): a 429 on the Code screen (Resend or the automatic resend) says how long to wait and
// where to tap; on the Email screen it never claims whether an account exists.
test('code and email send errors get screen-specific rate-limit copy', async () => {
  const { codeSendErrorCopy, emailSendErrorCopy, CODE_RATE_LIMITED, EMAIL_RATE_LIMITED } = await import('../../signup-errors.js');
  assert.equal(CODE_RATE_LIMITED, 'Too many codes requested. Wait a minute, then tap Resend.');
  assert.equal(EMAIL_RATE_LIMITED, "We can't send a code right now. Please try again in a few minutes.");
  const limited = { code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' };
  assert.equal(codeSendErrorCopy(limited), CODE_RATE_LIMITED);
  assert.equal(codeSendErrorCopy({ status: 429, message: 'Too many requests' }), CODE_RATE_LIMITED);
  assert.equal(emailSendErrorCopy(limited), EMAIL_RATE_LIMITED);
  assert.ok(!/not created/.test(emailSendErrorCopy(limited)));
  assert.equal(emailSendErrorCopy({ message: 'Signups not allowed for otp' }), 'Something went wrong. Please try again.');
  assert.equal(codeSendErrorCopy({ message: 'Failed to fetch' }), 'Something went wrong. Please try again.');
});
test('expiredCodeCopy says whether a new code went out', async () => {
  const { expiredCodeCopy, CODE_RATE_LIMITED } = await import('../../signup-errors.js');
  assert.equal(expiredCodeCopy({ sent: true }), OTP_EXPIRED);
  assert.equal(expiredCodeCopy({ sent: false, error: { status: 429, message: 'email rate limit exceeded' } }), `That code has expired. ${CODE_RATE_LIMITED}`);
  assert.equal(expiredCodeCopy({ sent: false }), 'That code has expired. Tap Resend for a new one.');
});

test('expiredCodeCopy never asks for a tap on Resend while it is still counting down', async () => {
  const { expiredCodeCopy } = await import('../../signup-errors.js');
  assert.equal(expiredCodeCopy({ sent: false, resendReady: false }), 'That code has expired. Resend will be available in a moment.');
  assert.equal(expiredCodeCopy({ sent: false, resendReady: true }), 'That code has expired. Tap Resend for a new one.');
  assert.equal(expiredCodeCopy({ sent: true, resendReady: false }), "That code has expired. We've sent you a new one.");
});

// Phase E Task 5: too many verify attempts is not "too many codes" and never says the account was not created.
test('a 429 on verifying a code has its own copy, for signup and login alike', async () => {
  const { verifyErrorCopy, VERIFY_RATE_LIMITED } = await import('../../signup-errors.js');
  assert.equal(VERIFY_RATE_LIMITED, 'Too many attempts. Wait a minute, then try the code again.');
  assert.equal(verifyErrorCopy({ status: 429, code: 'over_request_rate_limit', message: 'Request rate limit reached' }), VERIFY_RATE_LIMITED);
  assert.equal(verifyErrorCopy({ message: 'too many requests' }), VERIFY_RATE_LIMITED);
  assert.ok(!/not created/.test(verifyErrorCopy({ status: 429 })));
});

// Login by code: shouldCreateUser false refuses an unknown address. Final fix Minor 1: that refusal is answered exactly
// like a sent code (null: go to the Code screen), so the reply never reveals whether an account exists. A genuine 429
// and a network failure keep their copy.
test('login code send errors: an unknown address looks like a sent code; rate limit and network keep their copy', async () => {
  const { loginCodeErrorCopy, LOGIN_CODE_RATE_LIMITED, LOGIN_CODE_MAYBE_SENT } = await import('../../signup-errors.js');
  assert.equal(LOGIN_CODE_MAYBE_SENT, 'If an account exists for that email, we sent a code.');
  assert.equal(loginCodeErrorCopy({ status: 429, code: 'over_email_send_rate_limit' }), LOGIN_CODE_RATE_LIMITED);
  assert.equal(loginCodeErrorCopy({ status: 422, code: 'otp_disabled', message: 'Signups not allowed for otp' }), null);
  assert.equal(loginCodeErrorCopy({ status: 400, message: 'User not found' }), null);
  assert.equal(loginCodeErrorCopy({ status: 404, code: 'user_not_found', message: 'User not found' }), null);
  assert.equal(loginCodeErrorCopy({ status: 0, message: 'Failed to fetch' }), "We couldn't send a code. Check your connection and try again.");
  assert.ok(!/not created|already exists|exist/i.test(loginCodeErrorCopy({ status: 500, message: 'boom' })));
});
