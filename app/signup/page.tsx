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
            For this beta, help us test the campus network first: create requests and secondhand marketplace listings,
            make sure other students can discover them, respond, connect, and message each other. <b>Payment features are still being tested and should be treated as test-only.</b>
          </p>
        </div>
      </aside>
      <AuthForm mode="signup" />
    </>
  );
}
