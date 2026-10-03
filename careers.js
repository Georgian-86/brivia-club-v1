import { supabase } from './supabase.js';

const roles = {
  'Software Developer Intern': { department: 'Product & Engineering', copy: 'Help us build calm, thoughtful products that make it easier for people to discover their kind and do meaningful work together.', do: ['Build and refine product features with the team.', 'Turn ideas into clean, reliable interfaces.', 'Learn quickly, ask good questions, and ship thoughtfully.'], looking: ['Comfort with JavaScript and modern web fundamentals.', 'Curiosity for product, design, and user experience.', 'A strong bias toward learning and ownership.'], why: ['Work closely with a small, ambitious team.', 'Shape a product from the inside out.', 'Grow through real responsibility and generous feedback.'] },
  'Community & Partnerships Intern': { department: 'Community & Partnerships', copy: 'Help grow a warmer professional network through thoughtful conversations, community programs, and meaningful partnerships.', do: ['Build relationships with members and potential partners.', 'Support community moments, campaigns, and collaborations.', 'Bring structure and care to every interaction.'], looking: ['Clear, confident written and verbal communication.', 'Empathy, initiative, and strong follow-through.', 'Interest in people, culture, and creative communities.'], why: ['Meet thoughtful people doing interesting work.', 'Help define how a new community feels.', 'Grow with a team that values intention over noise.'] },
};

const modal = document.querySelector('#career-apply-modal');
const form = document.querySelector('#career-application-form');
const setPage = (page) => { modal?.querySelectorAll('[data-apply-page]').forEach((item) => item.classList.toggle('is-active', item.dataset.applyPage === page)); modal?.querySelectorAll('[data-apply-tab]').forEach((item) => item.classList.toggle('is-active', item.dataset.applyTab === page)); };
const openApply = (roleName) => {
  const role = roles[roleName] || roles['Software Developer Intern'];
  modal?.classList.add('is-open'); modal?.setAttribute('aria-hidden', 'false');
  document.querySelector('#career-role-title').textContent = roleName; document.querySelector('#career-role-department').textContent = role.department; document.querySelector('#career-overview-role').textContent = roleName; document.querySelector('#career-form-role').value = roleName;
  document.querySelector('#career-overview-copy').innerHTML = `<p>${role.copy}</p>`; document.querySelector('#career-overview-do').innerHTML = role.do.map((item) => `<li>${item}</li>`).join(''); document.querySelector('#career-overview-looking').innerHTML = role.looking.map((item) => `<li>${item}</li>`).join(''); document.querySelector('#career-overview-why').innerHTML = role.why.map((item) => `<li>${item}</li>`).join(''); document.querySelector('#career-form-status').textContent = ''; setPage('overview');
};
const closeApply = () => { modal?.classList.remove('is-open'); modal?.setAttribute('aria-hidden', 'true'); };
document.querySelectorAll('[data-apply-role]').forEach((button) => button.addEventListener('click', () => openApply(button.dataset.applyRole)));
modal?.querySelectorAll('[data-apply-close]').forEach((button) => button.addEventListener('click', closeApply));
modal?.querySelectorAll('[data-apply-tab]').forEach((button) => button.addEventListener('click', () => setPage(button.dataset.applyTab)));
document.querySelector('#career-resume')?.addEventListener('change', (event) => { document.querySelector('#career-resume-name').textContent = event.target.files?.[0]?.name || 'No file selected'; });

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const resume = document.querySelector('#career-resume').files?.[0];
  const status = document.querySelector('#career-form-status');
  if (!resume || resume.size > 3 * 1024 * 1024) { status.textContent = 'Please choose a PDF, DOC, or DOCX resume up to 3MB.'; return; }
  if (!supabase) { status.textContent = 'Applications are temporarily unavailable. Please try again shortly.'; return; }
  const submitButton = form.querySelector('.career-form-submit');
  const data = new FormData(form);
  const role = String(data.get('role') || '');
  const resumeMime = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  const extension = resume.name.split('.').pop()?.toLowerCase() || 'bin';
  const resumePath = `${crypto.randomUUID()}-${resume.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  submitButton.disabled = true;
  status.textContent = 'Saving your application…';
  try {
    const { error: uploadError } = await supabase.storage.from('career-resumes').upload(resumePath, resume, { upsert: false, contentType: resume.type || resumeMime[extension] || 'application/octet-stream' });
    if (uploadError) throw uploadError;
    const { error: insertError } = await supabase.from('career_applications').insert({ role, name: String(data.get('name') || '').trim(), email: String(data.get('email') || '').trim(), linkedin_url: String(data.get('linkedin') || '').trim() || null, resume_path: resumePath, resume_name: resume.name, resume_size: resume.size });
    if (insertError) { await supabase.storage.from('career-resumes').remove([resumePath]); throw insertError; }
    status.textContent = 'Application saved successfully. We’ll be in touch soon.';
    form.reset();
    document.querySelector('#career-resume-name').textContent = 'No file selected';
  } catch (error) {
    console.error('Career application submission failed:', error);
    status.textContent = 'Could not save your application. Please try again.';
  } finally {
    submitButton.disabled = false;
  }
});

document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeApply(); });
