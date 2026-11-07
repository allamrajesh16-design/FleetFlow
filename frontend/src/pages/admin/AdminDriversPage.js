import React, { useState } from 'react';
import useApiList from '../../hooks/useApiList';
import {
  createDriverApi,
  updateDriverApi,
  deleteDriverApi,
} from '../../api/adminManager';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import PageHeader from '../../components/common/PageHeader';
import ViewSwitch from '../../components/common/ViewSwitch';
import FormModal from '../../components/common/FormModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import {
  PlusIcon,
  UserIcon,
} from '../../components/common/Icons';
import { formatDate } from '../../utils/formatters';
import { TextInput, PasswordInput, DateInput, Select, PhoneInput } from '../../components/forms';
import './AdminPages.css';

export default function AdminDriversPage() {
  const toast = useToast();
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('fleetflow_view_drivers') || 'table'
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
    endpoint: '/drivers/',
    initialFilters: { status: '' },
  });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [deletingDriver, setDeletingDriver] = useState(null);

  const initialForm = {
    full_name: '',
    email: '',
    phone: '',
    password: '',
    license_number: '',
    license_expiry: '',
    status: 'ACTIVE',
  };

  const [formData, setFormData] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);


  const handleOpenAdd = () => {
    setFormData(initialForm);
    setFieldErrors({});
    setIsAddOpen(true);
  };

  const handleOpenEdit = (d) => {
    setEditingDriver(d);
    setFormData({
      full_name: d.user?.full_name || '',
      email: d.user?.email || '',
      phone: d.user?.phone || '',
      password: '',
      license_number: d.license_number || '',
      license_expiry: d.license_expiry || '',
      status: d.status || 'ACTIVE',
    });
    setFieldErrors({});
  };

  const handleSaveAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    try {
      await createDriverApi({
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        license_number: formData.license_number,
        license_expiry: formData.license_expiry,
        status: formData.status,
      });
      toast.success(`Driver "${formData.full_name}" registered successfully.`);
      setIsAddOpen(false);
      refresh();
    } catch (err) {
      const errors = err?.response?.data || {};
      if (typeof errors === 'object') {
        setFieldErrors(errors);
      }
      toast.error(errors.detail || errors.non_field_errors?.[0] || 'Failed to register driver.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingDriver) return;
    setSubmitting(true);
    setFieldErrors({});
    try {
      await updateDriverApi(editingDriver.id, {
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        license_number: formData.license_number,
        license_expiry: formData.license_expiry,
        status: formData.status,
      });
      toast.success(`Driver "${formData.full_name}" updated successfully.`);
      setEditingDriver(null);
      refresh();
    } catch (err) {
      const errors = err?.response?.data || {};
      if (typeof errors === 'object') {
        setFieldErrors(errors);
      }
      toast.error(errors.detail || errors.non_field_errors?.[0] || 'Failed to update driver.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingDriver) return;
    try {
      await deleteDriverApi(deletingDriver.id);
      toast.success(`Driver profile for "${deletingDriver.user?.full_name}" removed.`);
      setDeletingDriver(null);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete driver.');
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Driver Name',
      width: '260px',
      minWidth: '220px',
      render: (d) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UserIcon size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{d.user?.full_name || 'Driver'}</div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              {d.user?.phone || d.user?.email}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'license_number',
      label: 'License No.',
      width: '200px',
      minWidth: '180px',
      render: (d) => (
        <div>
          <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>{d.license_number}</span>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Exp: {formatDate(d.license_expiry)}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: '140px',
      minWidth: '120px',
      render: (d) => <Badge status={d.status} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '120px',
      minWidth: '100px',
      align: 'right',
      render: (d) => (
        <div className="admin-action-btn-group" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <IconButton
            action="edit"
            tooltip="Edit Driver"
            ariaLabel="Edit Driver"
            onClick={() => handleOpenEdit(d)}
          />
          <IconButton
            action="delete"
            tooltip="Delete Driver"
            ariaLabel="Delete Driver"
            onClick={() => setDeletingDriver(d)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="admin-page-container fade-in">
      <PageHeader
        title="Driver Management"
        subtitle="Register drivers, track commercial licenses, and dispatch readiness"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ViewSwitch
              view={viewMode}
              onChange={setViewMode}
              storageKey="fleetflow_view_drivers"
            />
            <Button
              variant="primary"
              icon={<PlusIcon size={18} />}
              onClick={handleOpenAdd}
            >
              Add Driver
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
        searchPlaceholder="Search driver, license, or phone"
        search={search}
        onSearchChange={setSearch}
        page={page}
        totalPages={totalPages}
        count={totalCount}
        onPageChange={setPage}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: filters.status,
            options: [
              { value: '', label: 'All Status' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'ON_TRIP', label: 'On Trip' },
              { value: 'INACTIVE', label: 'Inactive' },
            ],
            onChange: (val) => setFilter('status', val),
          },
        ]}
      />

      {/* Add / Edit Driver Modal */}
      <FormModal
        isOpen={isAddOpen || Boolean(editingDriver)}
        onClose={() => {
          setIsAddOpen(false);
          setEditingDriver(null);
        }}
        title={editingDriver ? `Edit Driver: ${editingDriver.user?.full_name}` : 'Register New Driver'}
        onSubmit={editingDriver ? handleSaveEdit : handleSaveAdd}
        submitLabel={editingDriver ? 'Save Changes' : 'Register Driver'}
        loading={submitting}
      >
        <TextInput
          label="Full Name"
          required
          placeholder="e.g. Suresh Babu"
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          error={fieldErrors.full_name}
        />

        <div className="form-grid-2">
          <TextInput
            label="Email Address"
            type="email"
            required
            placeholder="e.g. suresh@fleetflow.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            error={fieldErrors.email}
          />

          <PhoneInput
            label="Phone Number"
            name="phone"
            required
            placeholder="98765 43210"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            error={fieldErrors.phone}
          />
        </div>

        {!editingDriver && (
          <PasswordInput
            label="Driver Password"
            required
            placeholder="Min 6 characters"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            error={fieldErrors.password}
          />
        )}

        <div className="form-grid-2">
          <TextInput
            label="License Number"
            required
            placeholder="e.g. DL12345678"
            value={formData.license_number}
            onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
            error={fieldErrors.license_number}
          />

          <DateInput
            label="License Expiry Date"
            required
            value={formData.license_expiry}
            onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
            error={fieldErrors.license_expiry}
          />
        </div>

        <Select
          label="Availability Status"
          value={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
          error={fieldErrors.status}
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'ON_TRIP', label: 'On Trip' },
            { value: 'INACTIVE', label: 'Inactive' },
          ]}
        />
      </FormModal>

      {/* Delete Driver Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingDriver)}
        onClose={() => setDeletingDriver(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Driver Profile"
        message={`Are you sure you want to remove driver ${deletingDriver?.user?.full_name}?`}
        confirmLabel="Delete Driver"
        isDanger={true}
      />
    </div>
  );
}
