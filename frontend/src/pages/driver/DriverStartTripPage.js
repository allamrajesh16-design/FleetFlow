import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import { Skeleton } from '../../components/common/Loader';
import { ArrowLeftIcon, VehicleIcon, UserIcon, ClockIcon } from '../../components/common/Icons';
import { getTripDetailsApi, startTripApi } from '../../api/driver';
import { getApiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import './DriverPages.css';

export default function DriverStartTripPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success } = useToast();

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const fetchTrip = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getTripDetailsApi(id);
      setTrip(data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  const handleOpenConfirmModal = (e) => {
    e?.preventDefault();
    setFieldError('');
    setShowConfirmModal(true);
  };

  const handleConfirmStart = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFieldError('');

    try {
      await startTripApi(id);
      success(`Trip #${id} started successfully!`);
      setShowConfirmModal(false);
      navigate(`/driver/trips/${id}`);
    } catch (err) {
      const resp = err.response?.data;
      if (resp?.message) {
        setFieldError(resp.message);
      } else if (resp?.detail) {
        setFieldError(resp.detail);
      } else {
        setFieldError(getApiErrorMessage(err));
      }
      setShowConfirmModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="driver-page fade-in">
        <div className="driver-page-header">
          <Skeleton height="32px" width="160px" />
        </div>
        <Card>
          <Skeleton height="150px" />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="driver-page fade-in">
        <div className="driver-page-header">
          <IconButton
            icon={<ArrowLeftIcon size={20} />}
            label="Back"
            ariaLabel="Back"
            onClick={() => navigate('/driver/trips')}
            variant="ghost"
          />
        </div>
        <ErrorState message={error} onRetry={fetchTrip} />
      </div>
    );
  }

  return (
    <div className="driver-page driver-start-trip-page fade-in">
      <div className="driver-page-header">
        <IconButton
          icon={<ArrowLeftIcon size={20} />}
          label="Back"
          ariaLabel="Back"
          onClick={() => navigate(-1)}
          variant="ghost"
        />
        <h1 className="driver-page-title">Start Trip #{id}</h1>
        <div style={{ width: 44 }} />
      </div>

      {/* Trip Information Card */}
      <Card className="driver-start-summary-card">
        <h3 className="driver-card-heading">Trip Summary</h3>
        <div className="driver-modal-trip-summary" style={{ border: 'none', padding: 0 }}>
          <div className="driver-summary-row">
            <span className="driver-summary-key">Route:</span>
            <span className="driver-summary-val font-bold">
              {trip?.pickup_location || trip?.source} → {trip?.drop_location || trip?.destination}
            </span>
          </div>

          <div className="driver-summary-row">
            <span className="driver-summary-key">Customer:</span>
            <span className="driver-summary-val">
              <UserIcon size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              {trip?.customer_name || 'Customer'}
              {trip?.customer_phone && trip?.customer_phone !== 'N/A' ? ` • ${trip.customer_phone}` : ''}
            </span>
          </div>

          <div className="driver-summary-row">
            <span className="driver-summary-key">Vehicle:</span>
            <span className="driver-summary-val">
              <VehicleIcon size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              {trip?.vehicle_registration} ({trip?.vehicle_type || 'Car'})
            </span>
          </div>

          <div className="driver-summary-row">
            <span className="driver-summary-key">Scheduled:</span>
            <span className="driver-summary-val">
              <ClockIcon size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              {trip?.scheduled_datetime
                ? new Date(trip.scheduled_datetime).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : 'Now'}
            </span>
          </div>
        </div>
      </Card>

      {/* Start Trip Confirmation Card */}
      <Card className="driver-start-form-card">
        <h3 className="driver-card-heading">Ready to Begin</h3>
        <p className="driver-field-hint">
          Confirm that you are present at the vehicle and ready to initiate the journey for this assignment.
        </p>

        {fieldError && (
          <div className="driver-form-error-banner" style={{ marginBottom: '16px' }}>
            {fieldError}
          </div>
        )}

        <form onSubmit={handleOpenConfirmModal} className="driver-form">
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <Button
              type="button"
              variant="outline"
              size="large"
              fullWidth
              onClick={() => navigate(`/driver/trips/${id}`)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="large"
              fullWidth
              disabled={submitting}
            >
              {submitting ? 'Starting...' : 'Start Trip Now'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Start This Trip Confirmation Modal */}
      {showConfirmModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowConfirmModal(false)}
          title="Start This Trip?"
          maxWidth="480px"
          footer={
            <div className="driver-modal-actions">
              <Button
                variant="outline"
                size="medium"
                disabled={submitting}
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="medium"
                disabled={submitting}
                onClick={handleConfirmStart}
              >
                {submitting ? 'Starting...' : 'Confirm & Start'}
              </Button>
            </div>
          }
        >
          <div className="driver-start-modal-content">
            <p className="driver-start-modal-msg">
              Are you ready to begin this assigned trip?
            </p>
            <div className="driver-modal-trip-summary">
              <div className="driver-summary-row">
                <span className="driver-summary-key">Trip:</span>
                <span className="driver-summary-val font-bold">#{id}</span>
              </div>
              <div className="driver-summary-row">
                <span className="driver-summary-key">Route:</span>
                <span className="driver-summary-val font-bold">
                  {trip?.pickup_location || trip?.source} → {trip?.drop_location || trip?.destination}
                </span>
              </div>
              <div className="driver-summary-row">
                <span className="driver-summary-key">Vehicle:</span>
                <span className="driver-summary-val">
                  {trip?.vehicle_registration} ({trip?.vehicle_type || 'Car'})
                </span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
