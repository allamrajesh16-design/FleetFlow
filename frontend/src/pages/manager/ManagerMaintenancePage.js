import React, { useState, useEffect } from 'react';
import useApiList from '../../hooks/useApiList';
import {
  createMaintenanceApi,
  updateMaintenanceApi,
  listVehiclesApi,
} from '../../api/adminManager';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import PageHeader from '../../components/common/PageHeader';
import FormModal from '../../components/common/FormModal';
import { PlusIcon } from '../../components/common/Icons';
import { formatMoney, formatDate } from '../../utils/formatters';
import { Select, TextInput, Textarea, DateInput, NumberInput } from '../../components/forms';
import '../admin/AdminPages.css';
import './ManagerPages.css';

export default function ManagerMaintenancePage() {
  const toast = useToast();

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
    endpoint: '/maintenance/',
    initialFilters: { status: '', vehicle: '' },
  });

  const [vehicles, setVehicles] = useState([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const initialForm = {
    vehicle: '',
    title: '',
    description: '',
    scheduled_date: '',
    cost: '',
    status: 'SCHEDULED',
  };

  const [formData, setFormData] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listVehiclesApi({ page_size: 100 })
      .then((res) => {
        const list = res.results || res;
        setVehicles(Array.isArray(list) ? list : []);
      })
      .catch((err) => console.error('Failed to load vehicles for maintenance:', err));
  }, []);

  const handleOpenAdd = () => {
    setFormData({
      ...initialForm,
      vehicle: vehicles[0]?.id || '',
    });
    setFieldErrors({});
    setIsAddOpen(true);
  };

  const handleOpenEdit = (m) => {
    setEditingTask(m);
    setFormData({
      vehicle: m.vehicle,
      title: m.title,
      description: m.description || '',
      scheduled_date: m.scheduled_date,
      cost: m.cost || '',
      status: m.status,
    });
    setFieldErrors({});
  };

  const handleSaveAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    try {
      await createMaintenanceApi({
        vehicle: Number(formData.vehicle),
        title: formData.title,
        description: formData.description,
        scheduled_date: formData.scheduled_date,
        cost: formData.cost || '0',
        status: formData.status,
      });
      toast.success(`Maintenance scheduled for "${formData.title}".`);
      setIsAddOpen(false);
      refresh();
    } catch (err) {
      const respData = err?.response?.data || {};
      if (typeof respData === 'object') {
        setFieldErrors(respData);
      }
      toast.error(respData.detail || respData.vehicle?.[0] || respData.non_field_errors?.[0] || 'Failed to schedule maintenance.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingTask) return;
    setSubmitting(true);
    setFieldErrors({});
    try {
      await updateMaintenanceApi(editingTask.id, {
        title: formData.title,
        description: formData.description,
        scheduled_date: formData.scheduled_date,
        cost: formData.cost,
        status: formData.status,
      });
      toast.success('Maintenance log updated successfully.');
      setEditingTask(null);
      refresh();
    } catch (err) {
      const respData = err?.response?.data || {};
      if (typeof respData === 'object') {
        setFieldErrors(respData);
      }
      toast.error(respData.detail || respData.vehicle?.[0] || 'Failed to update maintenance.');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'vehicle',
      label: 'Vehicle',
      render: (m) => (
        <div>
          <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{m.vehicle_registration}</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            {m.vehicle_brand_model}
          </div>
        </div>
      ),
    },
    {
      key: 'title',
      label: 'Service Task',
      render: (m) => (
        <div>
          <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{m.title}</div>
          {m.description && (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              {m.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'scheduled_date',
      label: 'Scheduled Date',
      render: (m) => formatDate(m.scheduled_date),
    },
    {
      key: 'cost',
      label: 'Estimated Cost',
      render: (m) => formatMoney(m.cost || 0),
    },
    {
      key: 'status',
      label: 'Status',
      render: (m) => <Badge status={m.status} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (m) => (
        <IconButton
          action="edit"
          tooltip="Update Task"
          ariaLabel="Update Maintenance Task"
          onClick={() => handleOpenEdit(m)}
        />
      ),
    },
  ];

  const vehicleOptions = [
    { value: '', label: 'All Vehicles' },
    ...vehicles.map((v) => ({
      value: String(v.id),
      label: `${v.registration_number} (${v.brand} ${v.model})`,
    })),
  ];

  return (
    <div className="admin-page-container fade-in">
      <PageHeader
        title="Vehicle Maintenance Logs"
        subtitle="Schedule workshop servicing, prevent breakdowns, and update mechanic repairs"
        actions={
          <Button
            variant="primary"
            icon={<PlusIcon size={18} />}
            onClick={handleOpenAdd}
          >
            Schedule Service
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        error={error}
        onRetry={refresh}
        searchPlaceholder="Search task title, vehicle..."
        searchValue={search}
        onSearchChange={setSearch}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPageChange={setPage}
        filters={[
          {
            key: 'status',
            label: 'All Status',
            value: filters.status,
            options: [
              { value: '', label: 'All Status' },
              { value: 'SCHEDULED', label: 'Scheduled' },
              { value: 'IN_PROGRESS', label: 'In Progress' },
              { value: 'COMPLETED', label: 'Completed' },
            ],
            onChange: (val) => setFilter('status', val),
          },
          {
            key: 'vehicle',
            label: 'Vehicle',
            value: filters.vehicle,
            options: vehicleOptions,
            onChange: (val) => setFilter('vehicle', val),
          },
        ]}
      />

      {/* Add / Edit Maintenance Modal */}
      <FormModal
        isOpen={isAddOpen || Boolean(editingTask)}
        onClose={() => {
          setIsAddOpen(false);
          setEditingTask(null);
        }}
        title={editingTask ? `Update Maintenance: ${editingTask.title}` : 'Schedule Vehicle Servicing'}
        onSubmit={editingTask ? handleSaveEdit : handleSaveAdd}
        submitLabel={editingTask ? 'Save Changes' : 'Schedule Service'}
        loading={submitting}
      >
        {!editingTask && (
          <Select
            label="Select Vehicle"
            required
            value={formData.vehicle}
            onChange={(e) => setFormData({ ...formData, vehicle: e.target.value })}
            placeholder="Select vehicle"
            hint="Note: Vehicles currently ON_TRIP cannot be scheduled for maintenance."
            error={fieldErrors.vehicle}
            options={vehicles.map((v) => ({
              value: v.id,
              label: `${v.registration_number} — ${v.brand} ${v.model} (Status: ${v.status})`,
            }))}
          />
        )}

        <TextInput
          label="Service Title / Work Order"
          required
          placeholder="e.g. Brake Pad Replacement & General Checkup"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          error={fieldErrors.title}
        />

        <Textarea
          label="Description / Mechanic Notes"
          rows={3}
          placeholder="Details of servicing or replacement parts"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />

        <div className="form-grid-2">
          <DateInput
            label="Scheduled Date"
            required
            value={formData.scheduled_date}
            onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
            error={fieldErrors.scheduled_date}
          />

          <NumberInput
            label="Estimated / Actual Cost (₹)"
            step="0.01"
            min={0}
            placeholder="e.g. 2500"
            value={formData.cost}
            onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
            error={fieldErrors.cost}
          />
        </div>

        <Select
          label="Maintenance Status"
          value={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
          error={fieldErrors.status}
          options={[
            { value: 'SCHEDULED', label: 'SCHEDULED' },
            { value: 'IN_PROGRESS', label: 'IN PROGRESS' },
            { value: 'COMPLETED', label: 'COMPLETED' },
          ]}
        />
      </FormModal>
    </div>
  );
}
