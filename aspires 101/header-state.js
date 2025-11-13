<script>
(async function(){
  const url  = document.querySelector('meta[name="supabase-url"]')?.content;
  const anon = document.querySelector('meta[name="supabase-anon"]')?.content;
  if (!window.supabase || !url || !anon) return;
  const sb = window.supabase.createClient(url, anon);

  async function paint(){
    const { data: { session } } = await sb.auth.getSession();
    document.body.classList.toggle('is-authed', !!session);
  }
  await paint();
  sb.auth.onAuthStateChange((_e,_s)=> paint());
})();
</script>
