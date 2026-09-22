'use client';

export default function CookiePreferencesLink() {
  function openPreferences() {
    window.dispatchEvent(new CustomEvent('aspire-cookie-preferences-open'));
  }

  return (
    <button
      type="button"
      className="footerLegalButton"
      onClick={openPreferences}
      aria-label="Open cookie preferences"
    >
      Cookie Preferences
    </button>
  );
}
