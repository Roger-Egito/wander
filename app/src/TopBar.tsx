/**
 * The bar on every page: the app's name, links, the theme and language toggles, and
 * sign-in. The Editor link only shows for admins. Hiding it is a convenience: what keeps
 * Wander Data safe is the sheet's own sharing, and the Editor checks the flag again.
 */
import { NavLink } from 'react-router';
import { LanguageToggle, ThemeToggle, useLanguage } from '@wander/ui';
import { useAuth } from './auth/AuthProvider.tsx';
import styles from './TopBar.module.css';

export function TopBar() {
  const { t } = useLanguage();
  const { loading, session, profile, error, signIn, signOut } = useAuth();
  return (
    <header className={styles.bar}>
      <NavLink to="/" className={styles.brand}>Wander</NavLink>
      <nav className={styles.nav}>
        {import.meta.env.DEV && <NavLink to="/gallery">{t('nav.gallery')}</NavLink>}
        {profile?.is_admin && <NavLink to="/editor">{t('nav.editor')}</NavLink>}
      </nav>
      <div className={styles.end}>
        <ThemeToggle />
        <LanguageToggle />
        {!loading && (session ? (
          <button type="button" className={styles.button} onClick={signOut} title={profile?.display_name || session.user.email || undefined}>
            {profile?.display_name && <span className={styles.who}>{profile.display_name} · </span>}
            {t('auth.signOut')}
          </button>
        ) : (
          <button type="button" className={styles.button} onClick={signIn}>{t('auth.signIn')}</button>
        ))}
      </div>
      {error && <p className={styles.error} role="alert">{t('auth.error', { message: error })}</p>}
    </header>
  );
}
