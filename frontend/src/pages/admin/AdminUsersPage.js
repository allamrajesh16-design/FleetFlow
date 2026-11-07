import React, { useState } from 'react';
import useApiList from '../../hooks/useApiList';
import {
  createUserApi,
  updateUserApi,
  activateUserApi,
  deactivateUserApi,
} from '../../api/adminManager';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import PageHeader from '../../components/common/PageHeader';
import ViewSwitch from '../../components/common/ViewSwitch';
import FormModal from '../../components/common/FormModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { PlusIcon } from '../../components/common/Icons';
import { formatDateTime } from '../../utils/formatters';
import { TextInput, PasswordInput, Select, Checkbox, PhoneInput } from '../../components/forms';
import './AdminPages.css';

export default function AdminUsersPage() {
  const { user: currentAuthUser } = useAuth();
  const toast = useToast();
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('fleetflow_view_users') || 'table'
  );

  const {
    data,
    totalCount,
    totalPages,
    page,
    loading,
    error,
    search,
    filters,
    setPage,
    setSearch,
    setFilter,
    refresh,
  } = useApiList({
    endpoint: '/users/',
    initialFilters: { role: '', is_active: '' },
  });

  // Modal states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deactivatingUser, setDeactivatingUser] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'CUSTOMER',
    is_active: true,
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);


  const handleOpenAdd = () => {
    setFormData({
      full_name: '',
      email: '',
      phone: '',
      password: '',
      role: 'CUSTOMER',
      is_active: true,
    });
    setFieldErrors({});
    setIsAddOpen(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setFormData({
      full_name: user.full_name || '',
      email: user.email || '',
      phone: user.phone || '',
      password: '',
      role: user.role || 'CUSTOMER',
      is_active: user.is_active ?? true,
    });
    setFieldErrors({});
  };

  const handleSaveAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    try {
      await createUserApi({
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        role: formData.role,
      });
      toast.success(`User "${formData.full_name}" created successfully.`);
      setIsAddOpen(false);
      refresh();
    } catch (err) {
      const errors = err?.response?.data || {};
      if (typeof errors === 'object') {
        setFieldErrors(errors);
      }
      toast.error(errors.detail || errors.non_field_errors?.[0] || 'Failed to create user. Please check the fields.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setSubmitting(true);
    setFieldErrors({});
    try {
      const payload = {
        full_name: formData.full_name,
        phone: formData.phone,
        role: formData.role,
        is_active: formData.is_active,
      };
      if (formData.password && formData.password.trim()) {
        payload.password = formData.password.trim();
      }
      await updateUserApi(editingUser.id, payload);
      toast.success(`User "${formData.full_name}" updated successfully.`);
      setEditingUser(null);
      refresh();
    } catch (err) {
      const errors = err?.response?.data || {};
      if (typeof errors === 'object') {
        setFieldErrors(errors);
      }
      toast.error(errors.detail || errors.non_field_errors?.[0] || 'Failed to update user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (user) => {
    if (user.id === currentAuthUser?.id) {
      toast.error('You cannot deactivate your own admin account.');
      return;
    }

    if (user.is_active) {
      setDeactivatingUser(user);
    } else {
      try {
        await activateUserApi(user.id);
        toast.success(`User "${user.full_name}" activated successfully.`);
        refresh();
      } catch (err) {
        toast.error(err?.response?.data?.detail || 'Failed to activate user.');
      }
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivatingUser) return;
    try {
      await deactivateUserApi(deactivatingUser.id);
      toast.success(`User "${deactivatingUser.full_name}" deactivated.`);
      setDeactivatingUser(null);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to deactivate user.');
    }
  };

  const columns = [
    {
      key: 'full_name',
      label: 'Name',
      render: (u) => (
        <div>
          <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{u.full_name}</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{u.email}</div>
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (u) => u.phone || '—',
    },
    {
      key: 'role',
      label: 'Role',
      render: (u) => (
        <span
          style={{
            padding: '3px 8px',
            borderRadius: 'var(--radius-pill)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 'var(--font-weight-semibold)',
            background:
              u.role === 'ADMIN'
                ? 'var(--blue-100)'
                : u.role === 'FLEET_MANAGER'
                ? 'var(--purple-bg)'
                : u.role === 'DRIVER'
                ? 'var(--warning-bg)'
                : 'var(--blue-50)',
            color:
              u.role === 'ADMIN'
                ? 'var(--indigo-600)'
                : u.role === 'FLEET_MANAGER'
                ? 'var(--purple-text)'
                : u.role === 'DRIVER'
                ? 'var(--warning-text)'
                : 'var(--blue-700)',
          }}
        >
          {u.role.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (u) => <Badge status={u.is_active ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'created_at',
      label: 'Joined',
      render: (u) => formatDateTime(u.created_at),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (u) => {
        const isSelf = u.id === currentAuthUser?.id;
        return (
          <div className="admin-action-btn-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <IconButton
              action="edit"
              tooltip="Edit User"
              ariaLabel="Edit User"
              onClick={() => handleOpenEdit(u)}
            />
            <Button
              type="button"
              size="small"
              variant={u.is_active ? 'danger-outline' : 'success'}
              disabled={isSelf}
              onClick={() => handleToggleActive(u)}
            >
              {u.is_active ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="admin-page-container fade-in">
      <PageHeader
        title="Users & Roles"
        subtitle="Manage platform administrators, fleet managers, drivers, and customers"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ViewSwitch
              view={viewMode}
              onChange={setViewMode}
              storageKey="fleetflow_view_users"
            />
            <Button
              variant="primary"
              icon={<PlusIcon size={18} />}
              onClick={handleOpenAdd}
            >
              Add User
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        error={error}
        onRetry={refresh}
        viewMode={viewMode}
        searchPlaceholder="Search by name, email, phone..."
        search={search}
        onSearchChange={setSearch}
        page={page}
        totalPages={totalPages}
        count={totalCount}
        onPageChange={setPage}
        filters={[
          {
            key: 'role',
            label: 'Role',
            value: filters.role,
            options: [
              { value: '', label: 'All Roles' },
              { value: 'ADMIN', label: 'Admin' },
              { value: 'FLEET_MANAGER', label: 'Fleet Manager' },
              { value: 'DRIVER', label: 'Driver' },
              { value: 'CUSTOMER', label: 'Customer' },
            ],
            onChange: (val) => setFilter('role', val),
          },
          {
            key: 'is_active',
            label: 'Status',
            value: filters.is_active,
            options: [
              { value: '', label: 'All Status' },
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ],
            onChange: (val) => setFilter('is_active', val),
          },
        ]}
      />

      {/* Add User Modal */}
      <FormModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Create New User"
        onSubmit={handleSaveAdd}
        submitLabel="Create User"
        loading={submitting}
      >
        <TextInput
          label="Full Name"
          required
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          placeholder="e.g. Rahul Sharma"
          error={fieldErrors.full_name}
        />

        <div className="form-grid-2">
          <TextInput
            label="Email Address"
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="e.g. rahul@example.com"
            error={fieldErrors.email}
          />

          <PhoneInput
            label="Phone Number"
            name="phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="98765 43210"
            error={fieldErrors.phone}
          />
        </div>

        <div className="form-grid-2">
          <PasswordInput
            label="Password"
            required
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="Min 8 characters"
            error={fieldErrors.password}
          />

          <Select
            label="Role"
            required
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            error={fieldErrors.role}
            options={[
              { value: 'CUSTOMER', label: 'Customer' },
              { value: 'FLEET_MANAGER', label: 'Fleet Manager' },
              { value: 'ADMIN', label: 'Admin' },
            ]}
          />
        </div>
      </FormModal>

      {/* Edit User Modal */}
      <FormModal
        isOpen={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        title={`Edit User: ${editingUser?.full_name}`}
        onSubmit={handleSaveEdit}
        submitLabel="Save Changes"
        loading={submitting}
      >
        <TextInput
          label="Full Name"
          required
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          error={fieldErrors.full_name}
        />

        <div className="form-grid-2">
          <PhoneInput
            label="Phone Number"
            name="phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="98765 43210"
            error={fieldErrors.phone}
          />

          <Select
            label="Role"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            error={fieldErrors.role}
            options={[
              { value: 'CUSTOMER', label: 'Customer' },
              { value: 'FLEET_MANAGER', label: 'Fleet Manager' },
              { value: 'ADMIN', label: 'Admin' },
              { value: 'DRIVER', label: 'Driver' },
            ]}
          />
        </div>

        <PasswordInput
          label="Reset Password (optional)"
          placeholder="Leave blank to keep existing password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          error={fieldErrors.password}
        />

        <Checkbox
          label="Active Account"
          checked={formData.is_active}
          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
          disabled={editingUser?.id === currentAuthUser?.id}
          hint={editingUser?.id === currentAuthUser?.id ? 'You cannot deactivate your own logged-in admin account.' : undefined}
        />
      </FormModal>

      {/* Confirm Deactivate Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingUser)}
        onClose={() => setDeactivatingUser(null)}
        onConfirm={handleConfirmDeactivate}
        title="Deactivate Account"
        message={`Are you sure you want to deactivate ${deactivatingUser?.full_name}? They will not be able to log in until reactivated.`}
        confirmLabel="Deactivate"
        isDanger={true}
      />
    </div>
  );
}
