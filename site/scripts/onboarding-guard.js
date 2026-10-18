// Onboarding guards (final fix F2). Pure: no DOM, no Supabase.
//
// isUnderReview(status, row): my_onboarding_status() says completed = false although every step the client can see is
// done (a real name, the member's own adult_declared_at, a home cell, 1-12 interests worth exactly 20 points). With
// the R1/D-030 rules that only happens while an operator review flag ('suspended_pending_review') is on the member, so
// the app shows a neutral notice instead of sending them through onboarding again (each pass would burn an interest
// rewrite). The notice never says why or who reported them.
export const UNDER_REVIEW_COPY = 'Your profile is being reviewed. This usually takes up to 72 hours. Questions? Email thebrivia.club@gmail.com.';

const realName = (value) => { const name = String(value || '').trim(); return name && name !== 'New Member' ? name : ''; };

export const isUnderReview = (status, row) => {
  if (!status || !row || status.completed !== false) return false;
  const interests = Number(status.interests);
  return Boolean(realName(row.name) && row.adult_declared_at && status.has_cell === true
    && interests >= 1 && interests <= 12 && Number(status.points) === 20);
};

// shouldWithdrawConsent: after a failed interest save, the consent given by THIS submit is rolled back only when the
// member had no consent before it (consentBefore === null). A consent that existed before (or an unknown prior state,
// undefined) is never withdrawn: that would delete their private interests and log a withdrawal they never made.
export const shouldWithdrawConsent = ({ gaveConsent, consentBefore }) => Boolean(gaveConsent) && consentBefore === null;
