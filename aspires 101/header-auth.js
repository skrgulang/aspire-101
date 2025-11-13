<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title data-i18n="signin.meta_title">Sign in · Aspire 101</title>

  <!-- Icons -->
  <link rel="icon" href="pictures/19171758147211_.pic_hd.jpg">
  <link rel="apple-touch-icon" href="pictures/19171758147211_.pic_hd.jpg">
  <link rel="preload" as="image" href="pictures/19171758147211_.pic_hd.jpg">

  <!-- Security / Privacy -->
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self';
                 img-src 'self' data:;
                 style-src 'self' 'unsafe-inline';
                 script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
                 connect-src 'self' https://ikxjemnugoodfuxjaqoe.supabase.co https://*.supabase.co https://*.supabase.in;">
  <meta http-equiv="Referrer-Policy" content="strict-origin-when-cross-origin">
  <meta http-equiv="X-Content-Type-Options" content="nosniff">
  <meta http-equiv="Permissions-Policy" content="geolocation=(), microphone=(), camera=()">
  <link rel="preconnect" href="https://ikxjemnugoodfuxjaqoe.supabase.co" crossorigin>

  <!-- Shared styles -->
  <link rel="stylesheet" href="style.css"/>

  <!-- Header (stable) -->
  <style>
    :root{ --ink:#0b0d12; --muted:#64748b; --border:#e5e7eb; --brand:#ffcc00; --brand-ink:#0b0d12 }
    .site-header{ position:sticky; top:0; z-index:60; backdrop-filter:blur(12px);
      background:linear-gradient(180deg, rgba(255,255,255,.86), rgba(255,255,255,.72));
      border-bottom:1px solid rgba(226,232,240,.7) }
    .nav.container{display:grid; grid-template-columns:auto 1fr auto; gap:16px; align-items:center; min-height:64px}
    .brand{display:flex; align-items:center; gap:12px; text-decoration:none; color:var(--ink); font-weight:800; letter-spacing:.2px}
    .brand-logo{width:32px;height:32px;border-radius:8px;border:1px solid var(--border);object-fit:cover}
    .nav-main{display:flex; gap:20px; align-items:center; justify-self:center}
    .nav-main a{color:#334155; text-decoration:none; font-weight:700}
    .auth{justify-self:end; display:flex; align-items:center; gap:10px; min-width:280px; justify-content:flex-end}
    .btn{display:inline-flex; align-items:center; justify-content:center; height:40px; padding:0 16px;
      border-radius:999px; text-decoration:none; border:1px solid var(--border); color:var(--ink); background:#fff; font-weight:800}
    .btn.primary{border:0; background:var(--brand); color:var(--brand-ink)}
    body.is-authed  .guest-only{display:none}
    body:not(.is-authed) .authed-only{display:none}
    .muted{color:var(--muted)}
  </style>

  <!-- Supabase -->
  <meta name="supabase-url"  content="https://ikxjemnugoodfuxjaqoe.supabase.co"/>
  <meta name="supabase-anon" content="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlreGplbW51Z29vZGZ1eGphcW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0MzA5NzgsImV4cCI6MjA3NTAwNjk3OH0.lD79rdsoaUYnKuEISTO5V2sQwwAdi0yindiEg60NkZI">
  <script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>

<body class="bg-grid" data-i18n-page="signin">
  <!-- ===== Header ===== -->
  <header class="site-header" role="banner">
    <div class="container nav">
      <a class="brand" href="index.html" aria-label="Aspire 101">
        <img class="brand-logo" src="pictures/19171758147211_.pic_hd.jpg" alt="Aspire 101" fetchpriority="high"/>
        <span data-i18n="brand.name">ASPIRE 101</span>
      </a>

      <nav class="nav-main authed-only" aria-label="Main navigation">
        <a href="dashboard.html">Dashboard</a>
        <a href="tasks.html" data-i18n="nav.tasks">Tasks</a>
        <a href="account.html" data-i18n="nav.account">Account</a>
      </nav>

      <div class="auth">
        <div class="guest-only">
          <a class="btn primary" href="signup.html" data-i18n="nav.signup">Sign up</a>
        </div>
        <div class="authed-only">
          <a class="btn" href="account.html">Account</a>
          <button id="signout" class="btn primary" type="button">Sign out</button>
        </div>
      </div>
    </div>
  </header>

  <!-- ===== Main ===== -->
  <main class="container section" style="max-width:560px">
    <h1 class="h1" style="text-align:left" data-i18n="signin.title">Sign in</h1>
    <p class="muted" data-i18n="signin.subtitle">Use a school (.edu) or personal email.</p>

    <div id="signin-msg" class="notice" style="display:none"></div>

    <div class="card" style="margin-top:16px">
      <form id="signin-form" class="form" style="grid-template-columns:1fr" autocomplete="on" novalidate>
        <div>
          <label class="label" for="email" data-i18n="signin.email_label">Email</label>
          <input id="email" class="field" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none"
                 data-i18n-attr="placeholder:signin.email_ph" placeholder="name@school.edu or name@gmail.com" required />
        </div>
        <div>
          <label class="label" for="password" data-i18n="signin.password_label">Password</label>
          <input id="password" class="field" name="password" type="password" autocomplete="current-password"
                 data-i18n-attr="placeholder:signin.password_ph" placeholder="Your password" required />
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          <button class="btn primary" type="submit" data-i18n="signin.submit">Sign in</button>
          <a class="btn" id="reset-link" href="#" data-i18n="signin.reset">Reset password</a>
          <a style="margin-left:auto;text-decoration:none;color:inherit" href="signup.html" data-i18n="signin.to_signup">No account? Sign up</a>
        </div>
      </form>
    </div>
  </main>

  <!-- ===== Footer ===== -->
  <footer class="footer">
    <div class="container footline">
      <div class="footbrand">
        <img class="brand-logo" src="pictures/19171758147211_.pic_hd.jpg" alt="Aspire 101" loading="lazy"/>
        <span>© 2025 <span data-i18n="brand.name">ASPIRE 101</span></span>
      </div>
      <small class="muted" data-i18n="footer.tagline">Clean grid · Generous whitespace · Card layout</small>
    </div>
  </footer>

  <script defer src="i18n.js"></script>

  <!-- Page script -->
  <script>
  document.addEventListener('DOMContentLoaded', async () => {
    const $ = (s, el=document) => el.querySelector(s);

    // Supabase init (after CDN is ready)
    const supaURL  = $('meta[name="supabase-url"]').content;
    const supaAnon = $('meta[name="supabase-anon"]').content;
    const sb = window.supabase.createClient(supaURL, supaAnon);

    const msg = $('#signin-msg');
    const flash = (t,bad=false)=>{ msg.textContent=t; msg.className='notice '+(bad?'bad':'ok'); msg.style.display='block'; };

    // Paint header + redirect if already signed in
    async function paint(){
      const { data:{ session } } = await sb.auth.getSession();
      document.body.classList.toggle('is-authed', !!session);
      if (session?.user) location.replace('dashboard.html');
    }
    await paint();
    sb.auth.onAuthStateChange(()=> paint());

    // Sign out (if ever visible here)
    $('#signout')?.addEventListener('click', async ()=>{
      await sb.auth.signOut();
      document.body.classList.remove('is-authed');
    });

    // Sign in
    $('#signin-form')?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const email = $('#email')?.value.trim();
      const password = $('#password')?.value;
      if (!email || !password) return flash('Please enter email and password.', true);

      try{
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        flash('Signed in! Redirecting…');
        location.replace('dashboard.html');
      }catch(err){
        const m = (err?.message || '').toLowerCase();
        if (m.includes('invalid') || m.includes('credential')) flash('Email or password is incorrect.', true);
        else if (m.includes('confirm')) flash('Please verify your email, then sign in again.', true);
        else flash(err.message || 'Sign in failed. Please try again.', true);
      }
    });

    // Reset password
    $('#reset-link')?.addEventListener('click', async (e)=>{
      e.preventDefault();
      const email = prompt('Enter your account email:');
      if (!email) return;
      try{
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/update-password.html` });
        if (error) throw error;
        flash('Reset email sent. Check your inbox (and spam).');
      }catch(err){ flash(err.message || 'Failed to send reset email.', true); }
    });
  });
  </script>
</body>
</html>
