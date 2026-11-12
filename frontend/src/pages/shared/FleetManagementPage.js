import React, { useState } from 'react';
import useApiList from '../../hooks/useApiList';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  createVehicleApi,
  updateVehicleApi,
  deleteVehicleApi,
} from '../../api/adminManager';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import PageHeader from '../../components/common/PageHeader';
import FormModal from '../../components/common/FormModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import SmartImage from '../../components/common/SmartImage';
import { VehiclePlate, StatusDot } from '../../components/common/SignatureDesign';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  VehicleIcon,
  BusIcon,
} from '../../components/common/Icons';
import { formatMoney } from '../../utils/formatters';
import { TextInput, NumberInput, Select } from '../../components/forms';
import '../admin/AdminPages.css';

export default function FleetManagementPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'ADMIN';

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
    endpoint: '/vehicles/',
    initialFilters: { vehicle_type: '', status: '' },
  });

  // Admin Modals State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [deletingVehicle, setDeletingVehicle] = useState(null);

  // Manager Modal State (Status Only)
  const [statusVehicle, setStatusVehicle] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('ACTIVE');

  const initialForm = {
    registration_number: '',
    vehicle_type: 'CAR',
    brand: '',
    model: '',
    seating_capacity: 4,
    min_passengers: 1,
    rate_per_km: '',
    status: 'ACTIVE',
  };

  const [formData, setFormData] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Admin: Open Create Modal
  const handleOpenAdd = () => {
    setFormData(initialForm);
    setFieldErrors({});
    setIsAddOpen(true);
  };

  // Admin: Open Edit Modal
  const handleOpenEdit = (v) => {
    setEditingVehicle(v);
    setFormData({
      registration_number: v.registration_number,
      vehicle_type: v.vehicle_type,
      brand: v.brand,
      model: v.model,
      seating_capacity: v.seating_capacity,
      min_passengers: v.min_passengers,
      rate_per_km: v.rate_per_km,
      status: v.status,
    });
    setFieldErrors({});
  };

  // Manager: Open Status Modal
  const handleOpenStatusModal = (v) => {
    setStatusVehicle(v);
    setSelectedStatus(v.status);
  };

  // Admin: Save Create
  const handleSaveAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    try {
      await createVehicleApi(formData);
      toast.success(`Vehicle "${formData.registration_number}" registered successfully.`);
      setIsAddOpen(false);
      refresh();
    } catch (err) {
      const errors = err?.response?.data || {};
      if (typeof errors === 'object') {
        setFieldErrors(errors);
      }
      toast.error(errors.detail || errors.non_field_errors?.[0] || 'Failed to add vehicle.');
    } finally {
      setSubmitting(false);
    }
  };

  // Admin: Save Edit
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingVehicle) return;
    if (formData.status === 'ACTIVE' && editingVehicle.operational_status === 'ON_TRIP') {
      toast.error('Vehicle is currently on an active trip and cannot be marked Available.');
      return;
    }
    setSubmitting(true);
    setFieldErrors({});
    try {
      await updateVehicleApi(editingVehicle.id, formData);
      toast.success(`Vehicle "${formData.registration_number}" updated successfully.`);
      setEditingVehicle(null);
      refresh();
    } catch (err) {
      const errors = err?.response?.data || {};
      if (typeof errors === 'object') {
        setFieldErrors(errors);
      }
      toast.error(errors.detail || errors.status?.[0] || errors.non_field_errors?.[0] || 'Failed to update vehicle.');
    } finally {
      setSubmitting(false);
    }
  };

  // Admin: Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deletingVehicle) return;
    try {
      await deleteVehicleApi(deletingVehicle.id);
      toast.success(`Vehicle "${deletingVehicle.registration_number}" removed from fleet.`);
      setDeletingVehicle(null);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete vehicle.');
    }
  };

  // Manager: Save Status Update
  const handleSaveStatus = async (e) => {
    e.preventDefault();
    if (!statusVehicle) return;
    if (selectedStatus === 'ACTIVE' && statusVehicle.operational_status === 'ON_TRIP') {
      toast.error('Vehicle is currently on an active trip and cannot be marked Available.');
      return;
    }
    setSubmitting(true);
    try {
      await updateVehicleApi(statusVehicle.id, { status: selectedStatus });
      toast.success(`Vehicle ${statusVehicle.registration_number} status updated to ${selectedStatus}.`);
      setStatusVehicle(null);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.status || err?.response?.data?.detail || 'Failed to update vehicle status.');
    } finally {
      setSubmitting(false);
    }
  };

  const getVehicleImage = (type) => {
    if (type === 'CAR') {
      return {
        src: '/images/vehicle-car.jpg',
        fallbackIcon: <VehicleIcon size={20} color="var(--color-primary)" />,
      };
    }
    if (type === 'BIKE') {
      return {
        src: '/images/vehicle-bike.jpg',
        fallbackIcon: <VehicleIcon size={20} color="var(--status-orange-text)" />,
      };
    }
    return {
      src: '/images/hero-bus.jpg',
      fallbackIcon: <BusIcon size={20} color="var(--success-text)" />,
    };
  };

  const columns = [
    {
      key: 'registration_number',
      label: 'Reg. No.',
      width: '260px',
      minWidth: '240px',
      render: (v) => {
        const imgConfig = getVehicleImage(v.vehicle_type);
        const subText = `${v.seating_capacity} Seats • ${formatMoney(v.rate_per_km)}/km`;
        return (
          <div className="vehicle-cell">
            <SmartImage
              src={imgConfig.src}
              fallbackIcon={imgConfig.fallbackIcon}
              aspectRatio="4/3"
              style={{ width: '48px', height: '36px', borderRadius: 'var(--radius-sm)' }}
              alt={v.registration_number}
            />
            <div className="vehicle-cell-text">
              <VehiclePlate registrationNumber={v.registration_number} size="sm" />
              <span className="vehicle-cell-sub" title={subText} style={{ marginTop: '3px' }}>
                {subText}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'vehicle_type',
      label: 'Type',
      width: '110px',
      minWidth: '100px',
      render: (v) => (
        <span
          style={{
            padding: '3px 8px',
            borderRadius: 'var(--radius-pill)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 'var(--font-weight-semibold)',
            background:
              v.vehicle_type === 'BUS'
                ? 'var(--blue-50)'
                : v.vehicle_type === 'CAR'
                  ? 'var(--success-bg)'
                  : 'var(--warning-bg)',
            color:
              v.vehicle_type === 'BUS'
                ? 'var(--blue-700)'
                : v.vehicle_type === 'CAR'
                  ? 'var(--success-text)'
                  : 'var(--warning-text)',
          }}
        >
          {v.vehicle_type}
        </span>
      ),
    },
    {
      key: 'brand',
      label: 'Brand',
      width: '150px',
      minWidth: '130px',
      render: (v) => v.brand,
    },
    {
      key: 'model',
      label: 'Model',
      width: '160px',
      minWidth: '140px',
      render: (v) => v.model,
    },
    {
      key: 'status',
      label: 'Operational Status',
      width: '160px',
      minWidth: '140px',
      render: (v) => {
        const opStatus = v.operational_status || v.status;
        const statusMap = {
          AVAILABLE: 'Available',
          ACTIVE: 'Available',
          ASSIGNED_TODAY: 'Assigned Today',
          ON_TRIP: 'On Trip',
          MAINTENANCE: 'Maintenance',
          INACTIVE: 'Inactive',
        };
        return <StatusDot status={opStatus} label={statusMap[opStatus] || opStatus} />;
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      width: isAdmin ? '130px' : '150px',
      minWidth: '120px',
      align: 'right',
      render: (v) => {
        if (isAdmin) {
          return (
            <div className="admin-action-btn-group" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <IconButton
                size="small"
                variant="secondary"
                title="Edit vehicle"
                onClick={() => handleOpenEdit(v)}
              >
                <EditIcon size={16} />
              </IconButton>
              <IconButton
                size="small"
                variant="danger"
                title="Delete vehicle"
                onClick={() => setDeletingVehicle(v)}
              >
                <TrashIcon size={16} />
              </IconButton>
            </div>
          );
        }
        return (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="button"
              size="small"
              variant="outline"
              icon={<EditIcon size={16} />}
              onClick={() => handleOpenStatusModal(v)}
            >
              Update Status
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="admin-page-container fade-in">
      <PageHeader
        title={isAdmin ? 'Fleet Management' : 'Fleet Roster'}
        subtitle={
          isAdmin
            ? 'Register, inspect, and update fleet vehicles across all types'
            : 'Inspect fleet inventory, monitor operational readiness, and switch vehicle states'
        }
        actions={
          isAdmin ? (
            <Button id="btn-add-vehicle" variant="primary" onClick={handleOpenAdd}>
              <PlusIcon size={18} />
              Add Vehicle
            </Button>
          ) : null
        }
      />

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        error={error}
        onRetry={refresh}
        enableViewSwitch={true}
        storageKey="fleetflow_view_vehicles"
        searchPlaceholder="Search fleet vehicles..."
        searchValue={search}
        onSearchChange={setSearch}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPageChange={setPage}
        renderCard={(v) => {
          const imgConfig = getVehicleImage(v.vehicle_type);
          return (
            <div className="admin-grid-card">
              <div className="admin-grid-card-thumb">
                <SmartImage
                  src={imgConfig.src}
                  fallbackIcon={imgConfig.fallbackIcon}
                  aspectRatio="16/9"
                  style={{ width: '100%', height: '140px', objectFit: 'cover' }}
                  alt={v.registration_number}
                />
              </div>
              <div className="admin-grid-card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <VehiclePlate registrationNumber={v.registration_number} size="sm" />
                  <StatusDot
                    status={v.operational_status || v.status}
                    label={
                      {
                        AVAILABLE: 'Available',
                        ACTIVE: 'Available',
                        ASSIGNED_TODAY: 'Assigned Today',
                        ON_TRIP: 'On Trip',
                        MAINTENANCE: 'Maintenance',
                        INACTIVE: 'Inactive',
                      }[v.operational_status || v.status] || (v.operational_status || v.status)
                    }
                  />
                </div>
                <h4 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 600 }}>
                  {v.brand} {v.model}
                </h4>
                <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  {v.vehicle_type} • {v.seating_capacity} Seats • {formatMoney(v.rate_per_km)}/km
                </p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                  {isAdmin ? (
                    <>
                      <Button size="small" variant="secondary" onClick={() => handleOpenEdit(v)}>
                        <EditIcon size={14} /> Edit
                      </Button>
                      <Button size="small" variant="danger" onClick={() => setDeletingVehicle(v)}>
                        <TrashIcon size={14} /> Delete
                      </Button>
                    </>
                  ) : (
                    <Button size="small" variant="outline" onClick={() => handleOpenStatusModal(v)}>
                      <EditIcon size={14} /> Update Status
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        }}
        filters={[
          {
            key: 'vehicle_type',
            label: 'Type',
            value: filters.vehicle_type,
            options: [
              { value: '', label: 'All Types' },
              { value: 'CAR', label: 'Car' },
              { value: 'BUS', label: 'Bus' },
              { value: 'BIKE', label: 'Bike' },
            ],
            onChange: (val) => setFilter('vehicle_type', val),
          },
          {
            key: 'status',
            label: 'Operational Status',
            value: filters.status,
            options: [
              { value: '', label: 'All Statuses' },
              { value: 'AVAILABLE', label: 'Available' },
              { value: 'ASSIGNED_TODAY', label: 'Assigned Today' },
              { value: 'ON_TRIP', label: 'On Trip' },
              { value: 'MAINTENANCE', label: 'Maintenance' },
              { value: 'INACTIVE', label: 'Inactive' },
            ],
            onChange: (val) => setFilter('status', val),
          },
        ]}
      />

      {/* Admin: Add Vehicle Modal */}
      {isAdmin && (
        <FormModal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          title="Register New Vehicle"
          onSubmit={handleSaveAdd}
          submitLabel="Register Vehicle"
          loading={submitting}
        >
          <TextInput
            label="Registration Number"
            required
            placeholder="e.g. AP 05 WT 0001"
            value={formData.registration_number}
            onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
            error={fieldErrors.registration_number?.[0]}
          />
          <Select
            label="Vehicle Type"
            required
            value={formData.vehicle_type}
            onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
            options={[
              { value: 'CAR', label: 'Car' },
              { value: 'BUS', label: 'Bus' },
              { value: 'BIKE', label: 'Bike' },
            ]}
            error={fieldErrors.vehicle_type?.[0]}
          />
          <TextInput
            label="Brand / Make"
            required
            placeholder="e.g. Toyota"
            value={formData.brand}
            onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
            error={fieldErrors.brand?.[0]}
          />
          <TextInput
            label="Model"
            required
            placeholder="e.g. Innova Crysta"
            value={formData.model}
            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
            error={fieldErrors.model?.[0]}
          />
          <NumberInput
            label="Seating Capacity"
            required
            min={1}
            value={formData.seating_capacity}
            onChange={(e) => setFormData({ ...formData, seating_capacity: parseInt(e.target.value, 10) || 1 })}
            error={fieldErrors.seating_capacity?.[0]}
          />
          <NumberInput
            label="Min Passengers"
            required
            min={1}
            value={formData.min_passengers}
            onChange={(e) => setFormData({ ...formData, min_passengers: parseInt(e.target.value, 10) || 1 })}
            error={fieldErrors.min_passengers?.[0]}
          />
          <NumberInput
            label="Rate Per Km (₹)"
            required
            min={0}
            step="0.01"
            placeholder="e.g. 15.00"
            value={formData.rate_per_km}
            onChange={(e) => setFormData({ ...formData, rate_per_km: e.target.value })}
            error={fieldErrors.rate_per_km?.[0]}
          />
          <Select
            label="Status"
            required
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            options={[
              { value: 'ACTIVE', label: 'ACTIVE' },
              { value: 'MAINTENANCE', label: 'MAINTENANCE' },
              { value: 'INACTIVE', label: 'INACTIVE' },
            ]}
            error={fieldErrors.status?.[0]}
          />
        </FormModal>
      )}

      {/* Admin: Edit Vehicle Modal */}
      {isAdmin && (
        <FormModal
          isOpen={Boolean(editingVehicle)}
          onClose={() => setEditingVehicle(null)}
          title={`Edit Vehicle: ${editingVehicle?.registration_number}`}
          onSubmit={handleSaveEdit}
          submitLabel="Save Changes"
          loading={submitting}
        >
          <TextInput
            label="Registration Number"
            required
            value={formData.registration_number}
            onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
            error={fieldErrors.registration_number?.[0]}
          />
          <Select
            label="Vehicle Type"
            required
            value={formData.vehicle_type}
            onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
            options={[
              { value: 'CAR', label: 'Car' },
              { value: 'BUS', label: 'Bus' },
              { value: 'BIKE', label: 'Bike' },
            ]}
            error={fieldErrors.vehicle_type?.[0]}
          />
          <TextInput
            label="Brand / Make"
            required
            value={formData.brand}
            onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
            error={fieldErrors.brand?.[0]}
          />
          <TextInput
            label="Model"
            required
            value={formData.model}
            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
            error={fieldErrors.model?.[0]}
          />
          <NumberInput
            label="Seating Capacity"
            required
            min={1}
            value={formData.seating_capacity}
            onChange={(e) => setFormData({ ...formData, seating_capacity: parseInt(e.target.value, 10) || 1 })}
            error={fieldErrors.seating_capacity?.[0]}
          />
          <NumberInput
            label="Min Passengers"
            required
            min={1}
            value={formData.min_passengers}
            onChange={(e) => setFormData({ ...formData, min_passengers: parseInt(e.target.value, 10) || 1 })}
            error={fieldErrors.min_passengers?.[0]}
          />
          <NumberInput
            label="Rate Per Km (₹)"
            required
            min={0}
            step="0.01"
            value={formData.rate_per_km}
            onChange={(e) => setFormData({ ...formData, rate_per_km: e.target.value })}
            error={fieldErrors.rate_per_km?.[0]}
          />
          <Select
            label="Status"
            required
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            options={[
              { value: 'ACTIVE', label: 'ACTIVE' },
              { value: 'MAINTENANCE', label: 'MAINTENANCE' },
              { value: 'INACTIVE', label: 'INACTIVE' },
            ]}
            error={fieldErrors.status?.[0]}
          />
        </FormModal>
      )}

      {/* Admin: Delete Confirmation */}
      {isAdmin && (
        <ConfirmDialog
          isOpen={Boolean(deletingVehicle)}
          onClose={() => setDeletingVehicle(null)}
          onConfirm={handleConfirmDelete}
          title="Delete Vehicle"
          message={`Are you sure you want to remove vehicle "${deletingVehicle?.registration_number}" (${deletingVehicle?.brand} ${deletingVehicle?.model}) from the fleet? This action cannot be undone.`}
          confirmLabel="Delete Vehicle"
          variant="danger"
        />
      )}

      {/* Manager: Update Status Modal */}
      {!isAdmin && (
        <FormModal
          isOpen={Boolean(statusVehicle)}
          onClose={() => setStatusVehicle(null)}
          title={`Update Vehicle Status: ${statusVehicle?.registration_number}`}
          onSubmit={handleSaveStatus}
          submitLabel="Save Status"
          loading={submitting}
        >
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
              Vehicle: <strong>{statusVehicle?.brand} {statusVehicle?.model}</strong> ({statusVehicle?.vehicle_type})
            </p>
          </div>

          {statusVehicle?.operational_status === 'ON_TRIP' && (
            <div style={{ padding: '10px 14px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', color: '#92400e', fontSize: '13px', marginBottom: '14px' }}>
              ⚠️ <strong>Trip in Progress:</strong> This vehicle is currently on an active trip. It cannot be marked Available until the trip is completed.
            </div>
          )}

          {statusVehicle?.operational_status === 'MAINTENANCE' && (
            <div style={{ padding: '10px 14px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', color: '#92400e', fontSize: '13px', marginBottom: '14px' }}>
              ⚠️ <strong>Under Maintenance:</strong> This vehicle is undergoing maintenance. Please verify servicing is complete before setting Available.
            </div>
          )}

          <Select
            label="Operating Status"
            required
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: 'ACTIVE', label: 'ACTIVE (Available for trips)' },
              { value: 'MAINTENANCE', label: 'MAINTENANCE (Servicing/repairs)' },
              { value: 'INACTIVE', label: 'INACTIVE (Decommissioned)' },
            ]}
          />
        </FormModal>
      )}
    </div>
  );
}
