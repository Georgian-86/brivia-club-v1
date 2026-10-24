// Password reset client logic (D-090). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { readAuthHash, newPasswordProblem, resetRequestError, passwordUpdateError, RESET_SENT, LINK_EXPIRED, MIN_PASSWORD } from '../../site/scripts/password-reset.js';

test('readAuthHash: a Supabase recovery link is recognised', () => {
  const r = readAuthHash('#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=recovery');
  assert.equal(r.recovery, true);
  assert.equal(r.error, null);
});

test('readAuthHash: a Google or signup return is not a recovery', () => {
  assert.equal(readAuthHash('#access_token=abc&refresh_token=def&token_type=bearer').recovery, false);
  assert.equal(readAuthHash('#access_token=abc&type=signup').recovery, false);
  assert.equal(readAuthHash('').recovery, false);
  assert.equal(readAuthHash('#login').recovery, false);
});

test('readAuthHash: an expired or used link is an error with plain copy', () => {
  const r = readAuthHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  assert.equal(r.recovery, false);
  assert.equal(r.error, LINK_EXPIRED);
});

test('readAuthHash: another hash error keeps its own description', () => {
  assert.equal(readAuthHash('#error=server_error&error_description=Something+broke').error, 'Something broke');
});

test('newPasswordProblem: at least the signup minimum and both fields equal', () => {
  assert.equal(MIN_PASSWORD, 8);
  assert.match(newPasswordProblem('short', 'short'), /at least 8 characters/);
  assert.match(newPasswordProblem('longenough1', 'longenough2'), /don't match/);
  assert.equal(newPasswordProblem('longenough1', 'longenough1'), null);
});

test('resetRequestError: rate limits read as a wait, anything else as a retry', () => {
  assert.match(resetRequestError({ status: 429, message: 'For security purposes, you can only request this after 42 seconds.' }), /42 seconds/);
  assert.match(resetRequestError({ code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' }), /Too many reset emails/);
  assert.match(resetRequestError({ message: 'boom' }), /couldn't send the reset link/);
});

test('passwordUpdateError: same password, expired session and other failures', () => {
  assert.match(passwordUpdateError({ code: 'same_password', message: 'New password should be different from the old password.' }), /different from your current one/);
  assert.equal(passwordUpdateError({ name: 'AuthSessionMissingError', message: 'Auth session missing!' }), LINK_EXPIRED);
  assert.match(passwordUpdateError({ code: 'weak_password', message: 'Password should contain at least one character of each: abc' }), /Password should contain/);
  assert.match(passwordUpdateError({ message: 'boom' }), /couldn't save your new password/);
});

test('the sent message never says whether the account exists', () => {
  assert.match(RESET_SENT('a@b.co'), /If an account exists for a@b\.co/);
});
