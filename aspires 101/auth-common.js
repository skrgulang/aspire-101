<script>
/**
 * Sets up Supabase (from meta tags) and reactive header.
 * Exposes window.__supabase for page scripts.
 */
(async function initAuthAndHeader(){
  const url  = document.querySelector('meta[name="supabase-url"]')?.content;
  const anon = document.querySelector('meta[name="supabase-anon"]')?.content;

  if (!window.supabase) { console.error('Supabase SDK missing'); return; }
  if (!url || !anon) { console.error('Supabase meta tags missing'); return; }

  const sb = window.supabase.createClient(url, anon);
  window.__supabase = sb;

  const showIn  = Array.from(document.querySelectorAll('[data-auth="in"]'));
  const showOut = Array.from(document.querySelectorAll('[data-auth="out"]'));
  const signoutBtn = document.getElementById('signout-btn');

  function renderHeader(session){
    const signedIn = !!session;
    showIn.forEach(el  => el.style.display  = signedIn ? '' : 'none');
    showOut.forEach(el => el.style.display = signedIn ? 'none' : '');
  }

  const { data: { session } } = await sb.auth.getSession();
  renderHeader(session);
  sb.auth.onAuthStateChange((_e, sess)=> renderHeader(sess));

  if (signoutBtn){
    signoutBtn.addEventListener('click', async ()=>{
      await sb.auth.signOut();
      location.href = 'index.html';
    });
  }
})();
</script>
