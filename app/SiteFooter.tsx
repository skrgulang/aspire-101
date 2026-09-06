import { aspireLogo } from './logo';

export default function SiteFooter() {
  return (
    <footer className="siteFooter">
      <div className="footerMain shell">
        <section className="footerLead">
          <a className="footerBrand" href="/#top" aria-label="Aspire 101 home">
            <img src={aspireLogo} alt="" />
            <span>Aspire 101</span>
          </a>
          <h3>Stay close to<br /><span>what&apos;s next.</span></h3>
          <p>Desktop, mobile, campus launches, and meaningful product updates — without turning your inbox into another feed.</p>
          <form className="footerSignup" action="/updates" method="get">
            <input name="email" type="email" placeholder="you@example.com" aria-label="Email for Aspire updates" />
            <button type="submit" aria-label="Join Aspire product updates">→</button>
          </form>
          <div className="footerSocials" aria-label="Aspire 101 social links">
            <a className="socialButton" href="https://www.instagram.com/aspire.101/" target="_blank" rel="noreferrer" aria-label="Aspire 101 on Instagram">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6Zm9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>
            </a>
            <a className="socialButton" href="https://www.linkedin.com/company/108901932/" target="_blank" rel="noreferrer" aria-label="Aspire 101 on LinkedIn">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 8.1H3V21h3.5V8.1ZM4.75 3A2.1 2.1 0 1 0 4.8 7.2 2.1 2.1 0 0 0 4.75 3ZM21 13.6c0-3.9-2.1-5.7-4.9-5.7-2.25 0-3.26 1.24-3.82 2.1V8.1H8.8c.05 1.25 0 12.9 0 12.9h3.48v-7.2c0-.38.03-.77.14-1.05.38-.77 1.24-1.57 2.68-1.57 1.9 0 2.65 1.44 2.65 3.55V21H21v-7.4Z"/></svg>
            </a>
            <a className="socialButton" href="https://discord.com/invite/sfKv7k9Sbt" target="_blank" rel="noreferrer" aria-label="Join Aspire 101 on Discord">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 5.34A18.7 18.7 0 0 0 14.9 4l-.56 1.15a17.4 17.4 0 0 0-4.67 0L9.1 4a18.9 18.9 0 0 0-4.61 1.35C1.57 9.7.78 13.93 1.18 18.1A18.7 18.7 0 0 0 6.83 21l1.38-1.9a12.2 12.2 0 0 1-2.16-1.03l.53-.41c4.16 1.93 8.68 1.93 12.78 0l.54.41c-.7.4-1.42.75-2.17 1.03L19.1 21a18.8 18.8 0 0 0 5.66-2.9c.47-4.83-.8-9.02-5.26-12.76ZM8.67 15.57c-1.24 0-2.26-1.14-2.26-2.54 0-1.4 1-2.54 2.26-2.54 1.27 0 2.29 1.15 2.26 2.54 0 1.4-1 2.54-2.26 2.54Zm6.66 0c-1.24 0-2.26-1.14-2.26-2.54 0-1.4 1-2.54 2.26-2.54 1.27 0 2.29 1.15 2.26 2.54 0 1.4-.99 2.54-2.26 2.54Z"/></svg>
            </a>
          </div>
        </section>

        <section className="footerColumn">
          <h4>Explore</h4>
          <nav>
            <a href="/discover">Discover requests</a>
            <a href="/#features">What Aspire does</a>
            <a href="/#why-aspire">Why Aspire</a>
            <a href="/#campuses">Campus network</a>
            <a href="/signup">Get started</a>
          </nav>
        </section>

        <section className="footerColumn">
          <h4>Company</h4>
          <nav>
            <a href="/updates">Product updates</a>
            <a href="/#work-with-us">Work with Aspire</a>
            <a href="/safety">Safety Center</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/guidelines">Community Guidelines</a>
            <a href="mailto:business@aspires101.com">Business inquiries ↗</a>
          </nav>
        </section>

        <section className="footerColumn">
          <h4>Community</h4>
          <nav>
            <a href="https://discord.com/invite/sfKv7k9Sbt" target="_blank" rel="noreferrer">Discord ↗</a>
            <a href="https://www.instagram.com/aspire.101/" target="_blank" rel="noreferrer">Instagram ↗</a>
            <a href="https://www.linkedin.com/company/108901932/" target="_blank" rel="noreferrer">LinkedIn ↗</a>
            <a href="mailto:business@aspires101.com">business@aspires101.com ↗</a>
          </nav>
        </section>
      </div>

      <div className="footerBottom shell">
        <p>© 2026 Cloudora Labs, Inc. · Aspire 101 is a product of Cloudora Labs.</p>
        <div className="footerLegal">
          <a href="/safety">Safety</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
          <a href="/guidelines">Guidelines</a>
        </div>
        <div className="footerTagline"><i /> Post what you need. Find who can help.</div>
      </div>
    </footer>
  );
}
