/* app.js — Aspire 101 (consolidated)
   - Supabase auth (signup/signin/signout)
   - Header auth toggle
   - Account page profile
   - Tasks:
       • Public feed (visible to everyone, realtime)
       • "My tasks" + create form (authed only, realtime)
   - Swipe Deck on dashboard (Tinder-like)
   Redirect rules:
     • signup -> email verify -> returns to signin.html
     • signin -> dashboard.html
*/

(async () => {
  // ---------------- DOM helpers ----------------
  const $  = (s, el=document) => el?.querySelector?.(s) ?? null;
  const $$ = (s, el=document) => Array.from(el?.querySelectorAll?.(s) ?? []);

  // ---------------- Supabase init ----------------
  const supaUrl  = $('meta[name="supabase-url"]')?.content || "";
  const supaAnon = $('meta[name="supabase-anon"]')?.content || "";
  if (!supaUrl || !supaAnon) {
    console.error("[Aspire] Missing Supabase meta tags.");
    return;
  }

  // Load SDK if needed
  if (!window.supabase) {
    try {
      const mod = await import('https://esm.sh/@supabase/supabase-js@2');
      window.supabase = mod;
    } catch (e) {
      console.error("[Aspire] Failed to load Supabase SDK", e);
      return;
    }
  }

  const sb = window.supabase.createClient(supaUrl, supaAnon);
  window.__supabase = sb;

  // ---------------- utils ----------------
  const emailType = (e) => /@.+\.edu$/i.test(e || "") ? "school" : "personal";

  async function getUser(){
    const { data } = await sb.auth.getUser();
    return data?.user ?? null;
  }

  function flash(el, text, bad=false, autoHideMs=0){
    if (!el) return;
    el.className = "notice " + (bad ? "bad" : "ok");
    el.textContent = text;
    el.style.display = "block";
    el.classList?.remove?.("hidden");
    if (autoHideMs > 0) setTimeout(() => { el.style.display = "none"; }, autoHideMs);
  }

  const escapeHtml = (s) =>
    (s ?? "").toString().replace(/[&<>"']/g, m => (
      { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]
    ));

  // ============================================================
  // Header auth toggle (works on any page with data-auth attrs)
  // ============================================================
  const showIn  = $$('[data-auth="in"]');
  const showOut = $$('[data-auth="out"]');
  function renderHeader(session){
    const on = !!session;
    showIn.forEach(el  => el.style.display  = on ? "" : "none");
    showOut.forEach(el => el.style.display = on ? "none" : "");
  }
  sb.auth.getSession().then(({ data: { session } }) => renderHeader(session));
  sb.auth.onAuthStateChange((_e, session) => renderHeader(session));

  // Sign out button (if present)
  $("#signout-btn")?.addEventListener("click", async () => {
    await sb.auth.signOut();
    location.href = "index.html";
  });

  // ============================================================
  // SIGNUP (signup.html)
  // ============================================================
  const signupForm = $("#signup-form");
  if (signupForm){
    const msg = $("#signup-msg");

    signupForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = new FormData(signupForm);
      const name = (form.get("name")||"").toString().trim();
      const email = (form.get("email")||"").toString().trim();
      const password = (form.get("password")||"").toString();
      const school = (form.get("school")||"").toString().trim();
      const city   = (form.get("city")||"").toString().trim();

      if (!name) return flash(msg, "请输入姓名/昵称", true);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return flash(msg, "请输入有效邮箱", true);
      if (password.length < 6) return flash(msg, "密码至少 6 位", true);
      if (!$("#agree")?.checked) return flash(msg, "请勾选同意服务条款与隐私政策", true);

      try{
        const meta = { name, school, city, email_type: emailType(email) };
        const { error } = await sb.auth.signUp({
          email, password,
          options: {
            data: meta,
            emailRedirectTo: location.origin + "/signin.html"
          }
        });
        if (error) throw error;
        flash(msg, "注册成功！请前往邮箱完成验证（若未见请查垃圾箱）。", false, 2500);
        setTimeout(()=> location.href="signin.html", 1200);
      }catch(e){
        flash(msg, e.message || "注册失败，请稍后再试", true);
      }
    });
  }

  // ============================================================
  // SIGNIN (signin.html)  -> dashboard.html
  // ============================================================
  const signinForm = $("#signin-form");
  if (signinForm){
    const msg = $("#signin-msg");

    // Already signed in? go to dashboard
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) location.replace("dashboard.html");
    });

    $("#reset-link")?.addEventListener("click", async (e) => {
      e.preventDefault();
      const email = prompt("Enter your account email:");
      if (!email) return;
      try{
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/update-password.html`,
        });
        if (error) throw error;
        flash(msg, "Reset email sent. Check your inbox (and spam).");
      }catch(err){
        flash(msg, err.message || "Failed to send reset email.", true);
      }
    });

    signinForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = new FormData(signinForm);
      const email = (form.get("email")||"").toString().trim();
      const password = (form.get("password")||"").toString();

      if (!email || !password) return flash(msg, "Please enter email and password.", true);

      try{
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        flash(msg, "Signed in! Redirecting…");
        location.replace("dashboard.html");
      }catch(e){
        const m = (e?.message || "").toLowerCase();
        if (m.includes("invalid") || m.includes("credential")){
          flash(msg, "Email or password is incorrect.", true);
        } else if (m.includes("confirm")){
          flash(msg, "Please verify your email, then sign in again.", true);
        } else {
          flash(msg, e.message || "Sign in failed. Please try again.", true);
        }
      }
    });
  }

  // ============================================================
  // ACCOUNT (account.html)
  // ============================================================
  if (location.pathname.endsWith("account.html")){
    (async () => {
      const user  = await getUser();
      const guard = $("#acc-guard");
      const card  = $("#acc-card");

      if (!user){
        guard && (guard.style.display="block", guard.classList.remove("hidden"));
        return;
      }
      guard && (guard.style.display="none");
      card  && (card.style.display="block", card.classList.remove("hidden"));

      $("#acc-email")  && ($("#acc-email").textContent  = user.email || "-");
      const m = user.user_metadata || {};
      $("#acc-name")   && ($("#acc-name").textContent   = m.name   || "-");
      $("#acc-school") && ($("#acc-school").textContent = m.school || "-");
      $("#acc-city")   && ($("#acc-city").textContent   = m.city   || "-");
      $("#acc-type")   && ($("#acc-type").textContent   = m.email_type || emailType(user.email));

      $("#resend")?.addEventListener("click", async () => {
        try{
          const { error } = await sb.auth.resend({ type: "signup", email: user.email });
          if (error) throw error;
          alert("Verification email sent. Check inbox/spam.");
        }catch(e){
          alert(e.message || "Failed to send. Try later.");
        }
      });

      $("#signout")?.addEventListener("click", async () => {
        await sb.auth.signOut();
        location.href = "index.html";
      });
    })();
  }

  // ============================================================
  // TASKS page (tasks.html)
  // ============================================================
  async function loadPublicTasks(){
    const tbody = $("#public-table tbody");
    const count = $("#public-count");
    if (!tbody) return;

    try{
      const { data, error } = await sb
        .from("tasks")
        .select("title, budget, status, created_at")
        .order("created_at", { ascending:false })
        .limit(100);
      if (error) throw error;

      tbody.innerHTML = "";
      (data || []).forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(r.title)}</td>
          <td>${r.budget ?? 0}</td>
          <td>${r.status || "待接单"}</td>
          <td>${new Date(r.created_at).toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
      });
      if (count) count.textContent = data?.length ?? 0;
    }catch(e){
      tbody.innerHTML = `<tr><td colspan="4" class="muted">无法加载公共任务。</td></tr>`;
      console.error("[Aspire] Public tasks load error:", e);
    }
  }

  function subscribePublicTasks(){
    if (!$("#public-table")) return () => {};
    const ch = sb
      .channel("public_tasks_feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => loadPublicTasks()
      )
      .subscribe();
    window.addEventListener("focus", () => loadPublicTasks());
    return () => sb.removeChannel(ch);
  }

  if (location.pathname.endsWith("tasks.html")){
    loadPublicTasks();
    const stopPublic = subscribePublicTasks();

    (async () => {
      const user  = await getUser();
      const guard = $("#task-guard");
      const wrap  = $("#task-wrap");
      const tableBody = $("#task-table tbody");
      const count = $("#task-count");

      if (!user){
        guard && (guard.style.display="block", guard.classList.remove("hidden"));
        return;
      }
      guard && (guard.style.display="none");
      wrap  && (wrap.style.display="block", wrap.classList.remove("hidden"));

      async function reload(){
        try{
          const { data, error } = await sb
            .from("tasks")
            .select("*")
            .eq("user_id", user.id)              // FIX: user_id
            .order("created_at", { ascending:false });
          if (error) throw error;
          render(data || []);
        }catch(e){
          console.warn("[Aspire] Tasks reload error:", e);
          render([]);
        }
      }

      function render(rows){
        if (!tableBody) return;
        tableBody.innerHTML = "";
        rows.forEach(r => {
          const tr = document.createElement("tr");
          tr.innerHTML =
            `<td>${escapeHtml(r.title)}</td>` +
            `<td>${r.budget || 0}</td>` +
            `<td>${r.status || "待接单"}</td>` +
            `<td>${new Date(r.created_at || Date.now()).toLocaleString()}</td>`;
          tableBody.appendChild(tr);
        });
        count && (count.textContent = rows.length);
      }

      // Create task
      $("#task-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const me = await getUser();
        const row = {
          user_id: me?.id,                        // FIX: user_id
          title: (f.get("title") || "").toString().trim(),
          budget: Number(f.get("budget") || 0),
          details: (f.get("description") || "").toString().trim(), // DB column is "details"
          status: "todo"
        };
        try{
          const { error } = await sb.from("tasks").insert(row);
          if (error) throw error;
        }catch(err){
          alert(err.message || "创建任务失败");
        }
        e.target.reset();
        reload();
      });

      // Realtime subscription for *my* tasks
      const channel = sb
        .channel(`user_tasks_${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tasks" },
          payload => {
            const row = payload.new || payload.old || {};
            if (row?.user_id === user.id) reload();   // FIX: user_id
          }
        )
        .subscribe();

      window.addEventListener("focus", reload);
      reload();

      // Cleanup
      window.addEventListener("beforeunload", () => {
        sb.removeChannel(channel);
        stopPublic && stopPublic();
      });
    })();
  }

  // ============================================================
  // DASHBOARD — Swipe Deck (renders if #swipe-deck exists)
  // ============================================================
  (async function initSwipeDeck(){
    const deckHost = $("#swipe-deck");
    const emptyEl  = $("#swipe-empty");
    if (!deckHost) return; // not on dashboard

    async function fetchRows(){
      const { data, error } = await sb
        .from("tasks")
        .select("id,title,city,image_url")
        .order("created_at", { ascending:false })
        .limit(30);
      if (error) console.warn("[Swipe] load error:", error);

      const fallback = [
        { id:'a1', title:'Math Tutor • 2 hrs', city:'NYC',       image_url:'https://images.unsplash.com/photo-1529078155058-5d716f45d604?q=80&w=1600&auto=format&fit=crop' },
        { id:'a2', title:'Grocery Delivery',   city:'Brooklyn',  image_url:'https://images.unsplash.com/photo-1542834369-f10ebf06d3cb?q=80&w=1600&auto=format&fit=crop' },
        { id:'a3', title:'Cat Sitting Weekend',city:'Queens',    image_url:'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?q=80&w=1600&auto=format&fit=crop' },
        { id:'a4', title:'Design a Flyer',     city:'Remote',    image_url:'https://images.unsplash.com/photo-1529336953121-ad5a0d43d0f8?q=80&w=1600&auto=format&fit=crop' },
      ];
      const rows = (data && data.length ? data : fallback);
      return rows.map(r=>({
        id:        r.id,
        title:     r.title || 'Untitled task',
        city:      r.city  || '—',
        image_url: r.image_url || `https://picsum.photos/seed/${r.id}/1200/800`
      }));
    }

    const rows = await fetchRows();
    let i = 0; // index of top card

    function render(){
      deckHost.innerHTML = '';
      const remain = rows.slice(i);
      if (emptyEl) emptyEl.style.display = remain.length ? 'none' : '';
      if (!remain.length) return;

      // up to 4 stacked cards
      remain.slice(0,4).forEach((r, idx)=>{
        const el = document.createElement('article');
        el.className = 'card-swipe';
        el.style.transform = `translateY(${idx*8}px) scale(${1 - idx*0.02})`;
        if (idx===0) el.dataset.top = '1';
        el.innerHTML = `
          <img alt="" src="${r.image_url}" style="width:100%;height:260px;object-fit:cover;border-radius:12px">
          <div>
            <div style="font-weight:800">${escapeHtml(r.title)}</div>
            <div class="muted">${escapeHtml(r.city)}</div>
          </div>
          <div class="swipe-actions">
            <button class="btn-skip" type="button" data-sim="left">Skip</button>
            <button class="btn-like" type="button" data-sim="right">Like</button>
            <button class="btn"      type="button" data-sim="up">Save</button>
          </div>
        `;
        deckHost.appendChild(el);
      });

      bindTop();
      deckHost.querySelectorAll('[data-sim]').forEach(b=>{
        b.addEventListener('click', ()=> simulate(b.dataset.sim));
      });
    }

    function bindTop(){
      const top = deckHost.querySelector('[data-top="1"]');
      if (!top) return;

      let sx=0, sy=0, dx=0, dy=0, dragging=false;

      const onDown = (e)=>{
        dragging = true;
        const p = point(e);
        sx = p.x; sy = p.y; dx = dy = 0;
        top.setPointerCapture?.(e.pointerId || 0);
      };
      const onMove = (e)=>{
        if (!dragging) return;
        const p = point(e);
        dx = p.x - sx; dy = p.y - sy;
        const rot = dx/16;
        top.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
        top.style.opacity   = String(1 - Math.min(0.35, Math.abs(dx)/800));
      };
      const onUp = ()=>{
        if (!dragging) return;
        dragging = false;
        const TH = 120;      // horizontal
        const UP = 140;      // vertical up
        if (dx >  TH) return fling('right');
        if (dx < -TH) return fling('left');
        if (-dy > UP && Math.abs(dx) < TH) return fling('up');

        // reset
        top.style.transition = 'transform .2s, opacity .2s';
        top.style.transform  = '';
        top.style.opacity    = '1';
        setTimeout(()=>{ top.style.transition = ''; }, 220);
      };

      top.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove, { passive:true });
      window.addEventListener('pointerup', onUp, { once:true });

      function fling(dir){
        const tx = dir==='left' ? -window.innerWidth : (dir==='right' ? window.innerWidth : 0);
        const ty = dir==='up' ? -window.innerHeight*0.9 : dy*1.2;
        top.style.transition = 'transform .22s ease-out, opacity .22s';
        top.style.transform  = `translate(${tx}px, ${ty}px) rotate(${dx/10}deg)`;
        top.style.opacity    = '0.6';
        setTimeout(async ()=>{
          await recordDecision(dir, rows[i]?.id);
          i++;
          render();
        }, 200);
      }
    }

    function point(e){
      if (e.touches?.length) return { x:e.touches[0].clientX, y:e.touches[0].clientY };
      return { x:e.clientX, y:e.clientY };
    }

    async function recordDecision(action, taskId){
      try{
        const user = (await sb.auth.getUser()).data?.user;
        if (!user || !taskId) return; // ignore when not signed in
        await sb.from('task_swipes')
          .upsert({ user_id: user.id, task_id: taskId, action });
      }catch(err){
        console.warn('[Swipe] decision save failed:', err?.message || err);
      }
      console.log('[Swipe] decide', action, taskId);
    }

    // Keyboard shortcuts
    window.addEventListener('keydown', (e)=>{
      if (!deckHost.isConnected) return;
      if (e.key === 'ArrowLeft')  simulate('left');
      if (e.key === 'ArrowRight') simulate('right');
      if (e.key === 'ArrowUp')    simulate('up');
    });

    function simulate(dir){
      const top = deckHost.querySelector('[data-top="1"]');
      if (!top) return;
      const tx = dir==='left' ? -window.innerWidth : (dir==='right' ? window.innerWidth : 0);
      const ty = dir==='up' ? -window.innerHeight*0.9 : 0;
      top.style.transition = 'transform .22s ease-out, opacity .22s';
      top.style.transform  = `translate(${tx}px, ${ty}px) rotate(${dir==='left'?-12:12}deg)`;
      top.style.opacity    = '0.6';
      setTimeout(async ()=>{ await recordDecision(dir, rows[i]?.id); i++; render(); }, 190);
    }

    render();
  })();

  // expose for console debugging if needed
  window.aspire = { supabase: sb };
})();
