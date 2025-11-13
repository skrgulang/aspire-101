// i18n.js — drop next to your HTML. Load with <script defer src="i18n.js"></script>

(() => {
    // --- 1) Dictionary ---------------------------------------------------------
    const dict = {
      en: {
        meta: {
          index_title: "ASPIRE 101 — Campus / Local Help",
          signin_title: "Sign in · Aspire 101",
          signup_title: "Sign up · Aspire 101",
          tasks_title:  "Tasks · Aspire 101",
          account_title:"Account · Aspire 101"
        },
        brand:{ name:"ASPIRE 101" },
        nav:{ tasks:"Tasks", account:"Account", signup:"Sign up" },
        hero:{
          eyebrow:"Campus · Local Help",
          title:"Make task matching as simple as chatting",
          lead:"Errands, rideshares, package pickup, meals, study buddies, part-time collabs… Post a need and we’ll match trusted people near your school/city."
        },
        btn:{ signup_free:"Create free account", browse_tasks:"Browse tasks", signup:"Sign up" },
        features:{
          title:"Core features", sub:"Only the most useful entry points. Everything else steps aside.",
          f1:{h:"One-tap posting",p:"Fill in need & budget, post instantly"},
          f2:{h:"Ratings & reputation",p:"Complete tasks to build your level"},
          f3:{h:"Nearby & same school",p:"Prioritize nearby and same-school users"},
          f4:{h:"Task board",p:"To-do / In progress / Done at a glance"},
          cta_h:"Ready? Start posting / accepting tasks",
          cta_p:"Create with any email (school or personal)."
        },
        footer:{tagline:"Clean grid · Generous whitespace · Card layout"},
  
        // Signin
        signin:{
          meta_title:"Sign in · Aspire 101",
          title:"Sign in",
          subtitle:"Use a school (.edu) or personal email.",
          email_label:"Email",
          email_ph:"name@school.edu or name@gmail.com",
          password_label:"Password",
          password_ph:"Your password",
          submit:"Sign in",
          reset:"Reset password",
          to_signup:"No account? Sign up"
        },
  
        // Signup
        signup:{
          meta_title:"Sign up · Aspire 101",
          title:"Create account",
          subtitle:"We detect .edu as school email; others as personal.",
          name_label:"Name/Nickname",
          email_label:"Email",
          password_label:"Password",
          school_label:"School (optional)",
          city_label:"City (optional)",
          agree:"I agree to the Terms and Privacy Policy",
          submit:"Create account",
          to_signin:"Have an account? Sign in"
        },
  
        tasks:{ title:"Tasks" },
        account:{ title:"My Account" }
      },
  
      zh: {
        meta: {
          index_title:"ASPIRE 101 — 校园 / 同城互助",
          signin_title:"登录 · Aspire 101",
          signup_title:"创建账号 · Aspire 101",
          tasks_title:"任务 · Aspire 101",
          account_title:"我的账户 · Aspire 101"
        },
        brand:{ name:"ASPIRE 101" },
        nav:{ tasks:"任务", account:"账户", signup:"创建账号" },
        hero:{
          eyebrow:"校园 · 同城互助",
          title:"让任务匹配像聊天一样简单",
          lead:"跑腿、拼车、取包裹、拼饭、约自习、兼职协作……马上发布需求，优先匹配同校/同城靠谱的人。"
        },
        btn:{ signup_free:"免费创建账号", browse_tasks:"浏览任务", signup:"创建账号" },
        features:{
          title:"核心功能", sub:"只保留对用户最有用的入口，其他都让路。",
          f1:{h:"一键发单",p:"填写需求与预算，立刻发布"},
          f2:{h:"评分信用",p:"完成任务即积累口碑与等级"},
          f3:{h:"同城同校",p:"优先推送给附近与同校用户"},
          f4:{h:"任务看板",p:"待接单 / 进行中 / 已完成 一目了然"},
          cta_h:"准备好了吗？立刻开始发单 / 接单",
          cta_p:"只需一个邮箱即可创建账号（支持学校或个人邮箱）。"
        },
        footer:{tagline:"干净网格 · 大留白 · 卡片化布局"},
  
        // Signin
        signin:{
          meta_title:"登录 · Aspire 101",
          title:"登录",
          subtitle:"使用学校邮箱（.edu）或个人邮箱均可。",
          email_label:"邮箱",
          email_ph:"name@school.edu 或 name@gmail.com",
          password_label:"密码",
          password_ph:"你的密码",
          submit:"登录",
          reset:"重置密码",
          to_signup:"没有账号？去注册"
        },
  
        // Signup
        signup:{
          meta_title:"创建账号 · Aspire 101",
          title:"创建账号",
          subtitle:"我们会自动识别 .edu 为学校邮箱，其它视为个人邮箱。",
          name_label:"姓名/昵称",
          email_label:"邮箱",
          password_label:"密码",
          school_label:"学校（可选）",
          city_label:"城市（可选）",
          agree:"我已阅读并同意《服务条款》和《隐私政策》",
          submit:"创建账号",
          to_signin:"已有账号？去登录"
        },
  
        tasks:{ title:"任务" },
        account:{ title:"我的账户" }
      }
    };
  
    // --- 2) Lang pick/persist ---------------------------------------------------
    const LS_KEY = "aspire_lang";
  
    function detectPage() {
      const explicit = document.body.getAttribute("data-i18n-page");
      if (explicit) return explicit;
      const p = (location.pathname.split("/").pop() || "").toLowerCase();
      if (p.includes("signin")) return "signin";
      if (p.includes("signup")) return "signup";
      if (p.includes("tasks"))  return "tasks";
      if (p.includes("account"))return "account";
      return "index";
    }
  
    function pickLang() {
      const urlLang = new URLSearchParams(location.search).get("lang");
      if (urlLang && dict[urlLang]) return urlLang;
      const saved = localStorage.getItem(LS_KEY);
      if (saved && dict[saved]) return saved;
      return "en";
    }
  
    let current = pickLang();
  
    // --- 3) Translate helpers ---------------------------------------------------
    function get(path) {
      try {
        return path.split(".").reduce((o,k)=> (o && o[k] != null) ? o[k] : null, dict[current]);
      } catch { return null; }
    }
  
    function setTitleForPage() {
      const page = detectPage();
      const map = {
        index:"meta.index_title",
        signin:"signin.meta_title",
        signup:"signup.meta_title",
        tasks:"meta.tasks_title",
        account:"meta.account_title",
      };
      const key = map[page] || "meta.index_title";
      const v = get(key) || get("meta.index_title");
      if (v) document.title = v;
    }
  
    function applyI18n(root = document) {
      // 1) [data-i18n] -> textContent
      root.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        const v = get(key);
        if (v != null) el.textContent = v;
      });
  
      // 2) [data-i18n-html] -> innerHTML (for rich markup segments)
      root.querySelectorAll("[data-i18n-html]").forEach(el => {
        const key = el.getAttribute("data-i18n-html");
        const v = get(key);
        if (v != null) el.innerHTML = v;
      });
  
      // 3) [data-i18n-attr="placeholder:signin.email_ph, aria-label:nav.signup"]
      root.querySelectorAll("[data-i18n-attr]").forEach(el => {
        const pairs = el.getAttribute("data-i18n-attr")
          .split(",").map(s=>s.trim()).filter(Boolean);
        for (const p of pairs) {
          const [attr, key] = p.split(":").map(s=>s.trim());
          const v = get(key);
          if (attr && v != null) el.setAttribute(attr, v);
        }
      });
  
      // 4) Document chrome
      document.documentElement.setAttribute("lang", current === "zh" ? "zh-CN" : "en");
      setTitleForPage();
  
      // 5) Toggle active language UI (optional)
      document.querySelectorAll("[data-lang]").forEach(a => {
        const isActive = a.getAttribute("data-lang") === current;
        a.classList.toggle("active-lang", isActive);
        a.setAttribute("aria-current", isActive ? "true" : "false");
      });
    }
  
    function setLang(lang) {
      if (!dict[lang]) return;
      current = lang;
      localStorage.setItem(LS_KEY, lang);
      applyI18n(document);
    }
  
    // --- 4) Observe dynamic DOM (optional but handy) ---------------------------
    const mo = new MutationObserver(muts => {
      // If new nodes with data-i18n appear later, translate them.
      for (const m of muts) {
        m.addedNodes?.forEach(n => {
          if (n.nodeType === 1) applyI18n(n);
        });
      }
    });
  
    // --- 5) Boot ---------------------------------------------------------------
    window.i18n = { setLang, getLang: () => current };
    document.addEventListener("DOMContentLoaded", () => {
      // Language toggle (event delegation)
      document.addEventListener("click", e => {
        const a = e.target.closest("[data-lang]");
        if (!a) return;
        e.preventDefault();
        setLang(a.getAttribute("data-lang"));
      });
  
      applyI18n(document);
      mo.observe(document.body, { childList: true, subtree: true });
    });
  })();
  