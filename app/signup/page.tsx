import AuthForm from '../AuthForm';
import styles from './signup-beta.module.css';

export default function SignupPage() {
  return (
    <>
      <aside className={styles.notice} role="note" aria-label="Aspire 101 beta testing notice">
        <span className={styles.badge}>PRIVATE BETA</span>
        <div className={styles.copy}>
          <strong>Aspire 101 is currently in testing. Please do not use the platform for real-money payments yet.</strong>
          <p>
            The most important beta test right now is the campus network itself: post requests and secondhand marketplace listings,
            confirm that other students can actually discover them, respond, connect, and message each other. <b>Payment and payout features are still test-only and should not be used for real financial transactions.</b>
          </p>
        </div>
      </aside>
      <AuthForm mode="signup" />
    </>
  );
}
