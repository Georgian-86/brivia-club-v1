// Sign-up error copy (live walkthrough 2026-10-08: the raw "email rate limit exceeded" reached the member).
import test from 'node:test';
import assert from 'node:assert/strict';
import { signupErrorCopy } from '../../site/scripts/signup-errors.js';

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

test('loginErrorCopy: plain words for each log-in failure (D-223)', async () => {
  const { loginErrorCopy, LOGIN_FAILED } = await import('../../site/scripts/signup-errors.js');
  assert.equal(loginErrorCopy({ code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 }), LOGIN_FAILED);
  assert.equal(loginErrorCopy({ message: 'Invalid login credentials' }), LOGIN_FAILED);
  assert.match(loginErrorCopy({ code: 'email_not_confirmed', message: 'Email not confirmed' }), /Confirm your email/);
  assert.match(loginErrorCopy(new TypeError('Failed to fetch')), /No connection/);
  assert.match(loginErrorCopy(new TypeError('Load failed')), /No connection/); // Safari's wording
  assert.match(loginErrorCopy({ message: 'anything' }, { online: false }), /No connection/);
  assert.match(loginErrorCopy({ status: 429, message: 'Request rate limit reached' }), /Too many tries/);
  assert.match(loginErrorCopy(new Error('Supabase is not configured.')), /unavailable/);
  assert.equal(loginErrorCopy({ message: 'Something else' }), 'Something else');
  assert.match(loginErrorCopy(null), /Could not sign you in/);
});
