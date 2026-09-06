'use client';

import { PasswordField } from '@/components/ui/password-field';
import { authClient } from '@/lib/auth/client';
import { CheckCircle2, LoaderCircle, X, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';

const deleteConfirmationPhrase = 'delete my account';

export function SettingsPanel({ user }: { user: { name: string; email: string } }) {
  const [profileNotice, setProfileNotice] = useState<Notice | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<Notice | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileName, setProfileName] = useState(user.name);
  const [savedProfileName, setSavedProfileName] = useState(user.name.trim());
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleting, setDeleting] = useState(false);
  const deleteConfirmed = deletePhrase === deleteConfirmationPhrase;
  const trimmedProfileName = profileName.trim();
  const profileUnchanged = trimmedProfileName === savedProfileName;
  const profileInvalid = trimmedProfileName.length < 4 || profileUnchanged;
  const passwordMismatch = newPassword !== confirmPassword;
  const passwordUnchanged = newPassword.length > 0 && newPassword === currentPassword;
  const passwordInvalid =
    currentPassword.length < 8 ||
    newPassword.length < 8 ||
    confirmPassword.length < 8 ||
    passwordMismatch ||
    passwordUnchanged;

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profileSaving) return;
    if (profileInvalid) {
      setProfileNotice({
        type: 'error',
        message: profileUnchanged
          ? 'Name is unchanged.'
          : 'Name needs at least 4 characters.',
      });
      return;
    }
    setProfileSaving(true);
    setProfileNotice(null);
    try {
      const profile = await authClient.updateUser({ name: trimmedProfileName });
      setProfileNotice({
        type: profile.error ? 'error' : 'success',
        message:
          profile.error?.message ||
          (profile.error ? 'Could not update your name.' : 'Name updated successfully.'),
      });
      if (!profile.error) setSavedProfileName(trimmedProfileName);
    } catch {
      setProfileNotice({ type: 'error', message: 'Could not update your name. Please try again.' });
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordSaving) return;
    if (passwordMismatch) {
      setPasswordNotice({ type: 'error', message: 'New password and confirmation do not match.' });
      return;
    }
    if (passwordUnchanged) {
      setPasswordNotice({
        type: 'error',
        message: 'New password must be different from the current password.',
      });
      return;
    }
    setPasswordNotice(null);
    setPasswordSaving(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      setPasswordNotice({
        type: result.error ? 'error' : 'success',
        message:
          result.error?.message ||
          (result.error
            ? 'Could not update your password.'
            : 'Password updated. Other sessions were signed out.'),
      });
      if (!result.error) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      setPasswordNotice({
        type: 'error',
        message: 'Could not update your password. Please try again.',
      });
    } finally {
      setPasswordSaving(false);
    }
  }

  async function deleteAccount() {
    if (!deleteConfirmed || deleting) return;

    setDeleting(true);
    const result = await authClient.deleteUser({ callbackURL: '/' });
    if (result.error) {
      setDeleting(false);
      return;
    }

    try {
      await authClient.signOut();
    } catch {
      // The account deletion request may already remove the active session.
    }

    window.location.replace('/');
  }

  function openDeleteModal() {
    setDeletePhrase('');
    setDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeletePhrase('');
    setDeleteModalOpen(false);
  }

  return (
    <section className="container settings-shell">
      <header className="settings-heading">
        <p className="eyebrow">
          <span>●</span> Preferences
        </p>
        <h1>Settings</h1>
        <p>Manage your profile and password.</p>
      </header>

      <div className="settings-grid">
        <section className="settings-card">
          <div className="settings-card-title">
            <div>
              <small>Profile</small>
              <h2>User information</h2>
            </div>
          </div>
          <form className="settings-form" onSubmit={updateProfile}>
            <label>
              Name
              <input
                name="name"
                minLength={4}
                required
                value={profileName}
                onChange={(event) => {
                  setProfileName(event.target.value);
                  setProfileNotice(null);
                }}
              />
            </label>
            <label>
              Email address
              <input
                name="email"
                type="email"
                value={user.email}
                aria-describedby="locked-email-help"
                readOnly
              />
              <small id="locked-email-help">Email changes are disabled for now.</small>
            </label>
            <div className="settings-form-actions">
              <button disabled={profileSaving || profileInvalid} type="submit">
                {profileSaving && <LoaderCircle className="settings-spinner" aria-hidden="true" />}
                {profileSaving ? 'Saving name…' : 'Save changes'}
              </button>
              <FormNotice notice={profileNotice} />
            </div>
          </form>
        </section>

        <section className="settings-card">
          <div className="settings-card-title">
            <div>
              <small>Security</small>
              <h2>Change password</h2>
            </div>
          </div>
          <form className="settings-form password-form" onSubmit={changePassword}>
            <label>
              Current password
              <PasswordField
                name="currentPassword"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setPasswordNotice(null);
                }}
              />
            </label>
            <label>
              New password
              <PasswordField
                name="newPassword"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setPasswordNotice(null);
                }}
              />
            </label>
            <label>
              Confirm new password
              <PasswordField
                name="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setPasswordNotice(null);
                }}
              />
            </label>
            <div className="settings-form-actions">
              <button disabled={passwordSaving || passwordInvalid} type="submit">
                {passwordSaving && <LoaderCircle className="settings-spinner" aria-hidden="true" />}
                {passwordSaving ? 'Updating password…' : 'Update password'}
              </button>
              <FormNotice notice={passwordNotice} />
            </div>
          </form>
        </section>
      </div>

      <section className="settings-card danger-card">
        <div>
          <small>Danger zone</small>
          <h2>Delete account</h2>
          <p>Permanently remove your profile and sign-in data. This action cannot be undone.</p>
        </div>
        <button type="button" onClick={openDeleteModal}>
          Delete my account
        </button>
      </section>

      {deleteModalOpen && (
        <div className="delete-confirm-overlay" role="presentation">
          <div
            aria-labelledby="delete-confirm-title"
            aria-modal="true"
            className="delete-confirm-modal"
            role="dialog"
          >
            <button
              aria-label="Close delete account confirmation"
              className="delete-confirm-close"
              disabled={deleting}
              type="button"
              onClick={closeDeleteModal}
            >
              <X aria-hidden="true" />
            </button>
            <p className="eyebrow">
              <span>●</span> Danger zone
            </p>
            <h2 id="delete-confirm-title">Delete account?</h2>
            <p>
              This permanently removes your profile and sign-in data. You will be signed out and
              sent back to the homepage.
            </p>
            <form
              className="delete-confirm-form"
              onSubmit={(event) => {
                event.preventDefault();
                void deleteAccount();
              }}
            >
              <label>
                <span className="delete-confirm-copy">
                  Type <strong>{deleteConfirmationPhrase}</strong> to confirm.
                </span>
                <input
                  autoComplete="off"
                  autoFocus
                  placeholder={deleteConfirmationPhrase}
                  value={deletePhrase}
                  onChange={(event) => setDeletePhrase(event.target.value)}
                />
              </label>
              <div className="delete-confirm-actions">
                <button
                  className="delete-confirm-cancel"
                  disabled={deleting}
                  type="button"
                  onClick={closeDeleteModal}
                >
                  Cancel
                </button>
                <button
                  className="delete-confirm-danger"
                  disabled={!deleteConfirmed || deleting}
                  type="submit"
                >
                  {deleting ? 'Deleting…' : 'Delete account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

type Notice = { type: 'success' | 'error'; message: string };

function FormNotice({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <p className={`settings-form-notice ${notice.type}`} role="status" aria-live="polite">
      {notice.type === 'success' ? (
        <CheckCircle2 aria-hidden="true" />
      ) : (
        <XCircle aria-hidden="true" />
      )}
      {notice.message}
    </p>
  );
}
