<script>
(function(){
  const $ = (s,el=document)=> el.querySelector(s);
  const $$= (s,el=document)=> Array.from(el.querySelectorAll(s));

  // Supabase
  const url  = document.querySelector('meta[name="supabase-url"]').content;
  const anon = document.querySelector('meta[name="supabase-anon"]').content;
  const sb   = window.supabase.createClient(url, anon);

  // Paint header auth state
  async function paint(){
    const { data:{ session } } = await sb.auth.getSession();
    document.body.classList.toggle('is-authed', !!session);
  }
  paint();
  sb.auth.onAuthStateChange(()=> paint());

  // Sign out in header
  $('#signout-top')?.addEventListener('click', async ()=>{
    try{ await sb.auth.signOut(); }catch{}
    location.href = 'index.html';
  });

  // Gate: if not signed in, send to signin instead of target pages
  $$('.gate').forEach(el=>{
    el.addEventListener('click', async (e)=>{
      const { data:{ session } } = await sb.auth.getSession();
      if (!session){
        e.preventDefault();
        location.href = 'signin.html?auto=1';
      }
    });
  });
})();
</script>
