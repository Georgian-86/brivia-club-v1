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
test('other errors keep their message, with a fallback', () => {
  assert.equal(signupErrorCopy({ message: 'Password should be at least 8 characters.' }), 'Password should be at least 8 characters.');
  assert.equal(signupErrorCopy(null), 'Could not create your account. Please try again.');
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
