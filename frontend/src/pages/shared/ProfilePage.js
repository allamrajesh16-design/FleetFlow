import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Card from '../../components/common/Card';
import { TextInput, PasswordInput, PhoneInput, isValidIndianPhone } from '../../components/forms';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PasswordStrengthMeter from '../../components/forms/PasswordStrengthMeter';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { updateProfileApi, changePasswordApi, getProfileApi } from '../../api/auth';
import { getDriverMeApi } from '../../api/driver';
import { getApiErrorMessage } from '../../api/client';
import { EditIcon, KeyIcon, CheckCircleIcon, CheckIcon } from '../../components/common/Icons';
import './ProfilePage.css';

function formatRole(role) {
  if (!role) return 'Customer';
  switch (String(role).toUpperCase()) {
    case 'ADMIN':
      return 'Admin';
    case 'FLEET_MANAGER':
      return 'Fleet Manager';
    case 'DRIVER':
      return 'Driver';
    case 'CUSTOMER':
      return 'Customer';
    default:
      return role;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
  } catch (e) {
    return dateStr;
  }
}

function formatPhoneDisplay(raw) {
  if (!raw) return 'Not Provided';
  const clean = String(raw).replace(/\D/g, '');
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  if (clean.length === 12 && clean.startsWith('91')) {
    return `+91 ${clean.slice(2, 7)} ${clean.slice(7)}`;
  }
  return raw;
}

export default function ProfilePage() {
  const { user, role, updateUser } = useAuth();
  const toast = useToast();

  const [driverInfo, setDriverInfo] = useState(null);
  const [profile, setProfile] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    created_at: user?.created_at || '',
    is_email_verified: user?.is_email_verified ?? true,
    role: user?.role || role || 'CUSTOMER',
  });

  // Modal Visibility States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPwdModalOpen, setIsPwdModalOpen] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Edit Profile Form State
  const [editForm, setEditForm] = useState({ full_name: '', phone: '' });
  const [editError, setEditError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [recentSavedField, setRecentSavedField] = useState(null);

  // Change Password Form State
  const [pwdForm, setPwdForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [pwdError, setPwdError] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  // Load fresh profile details on mount
  const loadProfile = useCallback(async () => {
    try {
      const fresh = await getProfileApi();
      setProfile((prev) => ({
        ...prev,
        ...fresh,
      }));
      updateUser(fresh);
    } catch (e) {
      // Keep current data from context
    }

    if (String(role || user?.role).toUpperCase() === 'DRIVER') {
      try {
        const dMe = await getDriverMeApi();
        setDriverInfo(dMe);
      } catch (err) {
        // Driver profile might not exist yet
      }
    }
  }, [role, user?.role, updateUser]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Sync edit form on modal open
  const openEditModal = () => {
    const rawDigits = (profile.phone || '').replace(/\D/g, '');
    const phoneTen = rawDigits.length === 12 && rawDigits.startsWith('91')
      ? rawDigits.slice(2)
      : rawDigits.slice(-10);

    setEditForm({
      full_name: profile.full_name || '',
      phone: phoneTen,
    });
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  // Check if edit form has changes and is valid
  const isEditDirty = useMemo(() => {
    const currentPhoneRaw = (profile.phone || '').replace(/\D/g, '').slice(-10);
    const formPhoneRaw = (editForm.phone || '').replace(/\D/g, '').slice(-10);
    return (
      editForm.full_name.trim() !== (profile.full_name || '').trim() ||
      formPhoneRaw !== currentPhoneRaw
    );
  }, [editForm, profile]);

  const isEditValid = useMemo(() => {
    if (!editForm.full_name.trim()) return false;
    const phoneTrimmed = editForm.phone ? String(editForm.phone).trim() : '';
    if (phoneTrimmed && !isValidIndianPhone(phoneTrimmed)) {
      return false;
    }
    return true;
  }, [editForm]);

  const requestCloseEdit = () => {
    if (isEditDirty) {
      setShowDiscardConfirm(true);
    } else {
      setIsEditModalOpen(false);
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    setIsEditModalOpen(false);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!isEditValid || !isEditDirty || savingProfile) return;

    setEditError('');
    setSavingProfile(true);

    try {
      const cleanPhone = editForm.phone ? String(editForm.phone).trim() : '';
      const updated = await updateProfileApi({
        full_name: editForm.full_name.trim(),
        phone: cleanPhone || null,
      });

      setProfile((prev) => ({
        ...prev,
        ...updated,
      }));
      updateUser(updated);

      toast?.success('Profile updated');
      setIsEditModalOpen(false);

      // Trigger temporary highlight on updated row
      setRecentSavedField('info');
      setTimeout(() => setRecentSavedField(null), 3000);
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setEditError(msg);
      toast?.error(msg);
    } finally {
      setSavingProfile(false);
    }
  };

  // Change Password Handlers
  const openPwdModal = () => {
    setPwdForm({ old_password: '', new_password: '', confirm_password: '' });
    setPwdError('');
    setIsPwdModalOpen(true);
  };

  const handlePwdChange = (e) => {
    const { name, value } = e.target;
    setPwdForm((prev) => ({ ...prev, [name]: value }));
  };

  const isPwdValid = useMemo(() => {
    return (
      Boolean(pwdForm.old_password) &&
      pwdForm.new_password.length >= 6 &&
      pwdForm.new_password === pwdForm.confirm_password
    );
  }, [pwdForm]);

  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (!isPwdValid || savingPwd) return;

    setPwdError('');
    setSavingPwd(true);

    try {
      await changePasswordApi({
        old_password: pwdForm.old_password,
        new_password: pwdForm.new_password,
        confirm_password: pwdForm.confirm_password,
      });

      toast?.success('Password updated');
      setIsPwdModalOpen(false);
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setPwdError(msg);
      toast?.error(msg);
    } finally {
      setSavingPwd(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const currentRole = profile.role || role || 'CUSTOMER';

  return (
    <div className="profile-page-container fade-in">
      {/* Header bar with Action Buttons */}
      <div className="profile-header-bar">
        <div>
          <h1 className="profile-title">Account Profile</h1>
          <p className="profile-subtitle">
            Manage your personal profile information, credentials, and preferences
          </p>
        </div>

        <div className="profile-header-actions">
          <Button
            type="button"
            variant="primary"
            size="medium"
            leftIcon={<EditIcon size={18} />}
            onClick={openEditModal}
          >
            Edit profile
          </Button>

          <Button
            type="button"
            variant="outline"
            size="medium"
            leftIcon={<KeyIcon size={18} />}
            onClick={openPwdModal}
          >
            Change password
          </Button>
        </div>
      </div>

      {/* Main Profile View Card */}
      <Card className="profile-card">
        {/* User Overview Section */}
        <div className="profile-user-overview">
          <div className="profile-avatar-large">
            {getInitials(profile.full_name || profile.email)}
          </div>

          <div className="profile-user-info">
            <div className="profile-user-name-row">
              <h2 className="profile-user-fullname">
                {profile.full_name || 'FleetFlow User'}
              </h2>
              <Badge status={currentRole} />
            </div>
            <span className="profile-user-subtext">
              Role: <strong>{formatRole(currentRole)}</strong> • Member since{' '}
              {formatDate(profile.created_at)}
            </span>
          </div>
        </div>

        {/* Read-Only Details Grid */}
        <div className="profile-details-grid">
          {/* Full Name Row */}
          <div
            className={`profile-detail-item ${
              recentSavedField ? 'highlight-saved' : ''
            }`}
          >
            <span className="profile-detail-label">Full Name</span>
            <div className="profile-detail-val">
              <span>{profile.full_name || 'Not Provided'}</span>
              {recentSavedField && (
                <span className="saved-check-badge">
                  <CheckIcon size={12} /> Saved
                </span>
              )}
            </div>
          </div>

          {/* Email Row with Verified Tick */}
          <div className="profile-detail-item">
            <span className="profile-detail-label">Email Address</span>
            <div className="profile-detail-val">
              <span>{profile.email}</span>
              {profile.is_email_verified && (
                <span className="verified-tick" title="Email is verified">
                  <CheckCircleIcon size={18} color="var(--success)" />
                </span>
              )}
            </div>
          </div>

          {/* Phone Number Row in +91 format */}
          <div
            className={`profile-detail-item ${
              recentSavedField ? 'highlight-saved' : ''
            }`}
          >
            <span className="profile-detail-label">Phone Number</span>
            <div className="profile-detail-val">
              <span>{formatPhoneDisplay(profile.phone)}</span>
            </div>
          </div>

          {/* Member Since Row */}
          <div className="profile-detail-item">
            <span className="profile-detail-label">Member Since</span>
            <div className="profile-detail-val">
              <span>{formatDate(profile.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Driver Extra Row (Driver Role Only) */}
        {String(currentRole).toUpperCase() === 'DRIVER' && (
          <div className="profile-driver-section">
            <h3 className="profile-section-heading">Driver Credentials</h3>
            <div className="profile-details-grid">
              <div className="profile-detail-item">
                <span className="profile-detail-label">Driving Licence Number</span>
                <div className="profile-detail-val">
                  <span>{driverInfo?.license_number || 'Registered on File'}</span>
                </div>
              </div>

              <div className="profile-detail-item">
                <span className="profile-detail-label">Licence Expiry</span>
                <div className="profile-detail-val">
                  <span>{formatDate(driverInfo?.license_expiry)}</span>
                  <Badge
                    status="Active"
                    text={
                      driverInfo?.is_license_expired ? 'Expired' : 'Valid'
                    }
                  />
                </div>
              </div>

              <div className="profile-detail-item">
                <span className="profile-detail-label">Driver Status</span>
                <div className="profile-detail-val">
                  <Badge
                    status={driverInfo?.status || 'ACTIVE'}
                    text={driverInfo?.status === 'ON_TRIP' ? 'On Trip' : 'Active'}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={requestCloseEdit}
        title="Edit Profile"
      >
        <form onSubmit={handleSaveProfile} className="profile-modal-form" noValidate>
          {editError && (
            <div className="profile-modal-alert error">
              <span>{editError}</span>
            </div>
          )}

          <TextInput
            id="edit-profile-name"
            name="full_name"
            label="Full Name"
            placeholder="Enter your full name"
            value={editForm.full_name}
            onChange={handleEditChange}
            required
            autoFocus
          />

          <TextInput
            id="edit-profile-email"
            name="email"
            label="Email Address"
            value={profile.email}
            disabled
            helperText="Your email is your login and cannot be changed here."
          />

          <PhoneInput
            id="edit-profile-phone"
            name="phone"
            label="Phone Number"
            placeholder="98765 43210"
            value={editForm.phone}
            onChange={handleEditChange}
            helperText="10-digit Indian mobile number"
          />

          <div className="modal-actions-row">
            <Button
              type="button"
              variant="outline"
              size="medium"
              disabled={savingProfile}
              onClick={requestCloseEdit}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="medium"
              loading={savingProfile}
              disabled={!isEditDirty || !isEditValid || savingProfile}
            >
              Save changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Discard Changes Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDiscardConfirm}
        title="Discard changes?"
        message="You have unsaved changes in your profile. Are you sure you want to discard them?"
        confirmText="Discard"
        cancelText="Keep Editing"
        confirmVariant="danger"
        onConfirm={handleConfirmDiscard}
        onClose={() => setShowDiscardConfirm(false)}
      />

      {/* Change Password Modal */}
      <Modal
        isOpen={isPwdModalOpen}
        onClose={() => !savingPwd && setIsPwdModalOpen(false)}
        title="Change Password"
      >
        <form onSubmit={handleSavePassword} className="profile-modal-form" noValidate>
          {pwdError && (
            <div className="profile-modal-alert error">
              <span>{pwdError}</span>
            </div>
          )}

          <PasswordInput
            id="pwd-old"
            name="old_password"
            label="Current Password"
            placeholder="Enter current password"
            value={pwdForm.old_password}
            onChange={handlePwdChange}
            required
          />

          <PasswordInput
            id="pwd-new"
            name="new_password"
            label="New Password"
            placeholder="At least 6 characters"
            value={pwdForm.new_password}
            onChange={handlePwdChange}
            required
          />

          {pwdForm.new_password && (
            <PasswordStrengthMeter password={pwdForm.new_password} />
          )}

          <PasswordInput
            id="pwd-confirm"
            name="confirm_password"
            label="Confirm New Password"
            placeholder="Repeat new password"
            value={pwdForm.confirm_password}
            onChange={handlePwdChange}
            required
          />

          <div className="modal-actions-row">
            <Button
              type="button"
              variant="outline"
              size="medium"
              disabled={savingPwd}
              onClick={() => setIsPwdModalOpen(false)}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="medium"
              loading={savingPwd}
              disabled={!isPwdValid || savingPwd}
            >
              Update Password
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
