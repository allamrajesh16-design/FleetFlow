import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import ErrorState from '../../components/common/ErrorState';
import { Skeleton } from '../../components/common/Loader';
import { ArrowLeftIcon } from '../../components/common/Icons';
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

  const [startOdometer, setStartOdometer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldError('');

    const val = Number(startOdometer);
    if (!startOdometer || isNaN(val) || val <= 0) {
      setFieldError('Please enter a valid positive odometer reading in km.');
      return;
    }

    if (submitting) return; // Prevent double taps

    setSubmitting(true);
    try {
      await startTripApi(id, val);
      success('Trip started');
      navigate(`/driver/trips/${id}`);
    } catch (err) {
      const resp = err.response?.data;
      if (resp?.start_odometer) {
        setFieldError(
          Array.isArray(resp.start_odometer)
            ? resp.start_odometer.join(' ')
            : String(resp.start_odometer)
        );
      } else {
        setFieldError(getApiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="driver-page fade-in">
      {/* Top Header */}
      <div className="driver-page-header">
        <IconButton
          icon={<ArrowLeftIcon size={20} />}
          label="Back"
          ariaLabel="Back to Trip Details"
          onClick={() => navigate(`/driver/trips/${id}`)}
          variant="ghost"
          className="driver-back-btn"
        />
        <h1 className="driver-page-title">Start Trip</h1>
        <div style={{ width: 36 }} />
      </div>

      {loading ? (
        <div className="driver-skeletons-wrapper">
          <Skeleton height="90px" borderRadius="12px" />
          <Skeleton height="150px" borderRadius="12px" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchTrip} />
      ) : (
        <>
          <div className="driver-trip-form-desktop-layout">
            {/* Odometer Form */}
            <Card className="driver-form-card">
              <form onSubmit={handleSubmit}>
                <div className="form-group-odometer">
                  <Input
                    id="start-odometer-input"
                    name="start_odometer"
                    type="number"
                    label="Current Odometer (km)"
                    placeholder="e.g. 15200"
                    value={startOdometer}
                    onChange={(e) => {
                      setStartOdometer(e.target.value);
                      if (fieldError) setFieldError('');
                    }}
                    required
                    min="1"
                    step="1"
                    disabled={submitting}
                  />
                  {fieldError && (
                    <div className="driver-field-error-message">
                      <span>{fieldError}</span>
                    </div>
                  )}
                </div>

                <div className="driver-form-action" style={{ marginTop: '24px' }}>
                  <Button
                    type="submit"
                    variant="primary"
                    size="large"
                    fullWidth
                    loading={submitting}
                    disabled={submitting || !startOdometer}
                    className="btn-press-sweep"
                  >
                    Start Trip
                  </Button>
                </div>
              </form>
            </Card>

            {/* Trip Summary Card (On side on desktop) */}
            <Card className="driver-summary-card">
              <h3 className="driver-summary-title">Trip Summary</h3>
              <div className="driver-summary-route">
                <span className="driver-summary-point">{trip?.source || trip?.pickup_location || '-'}</span>
                <span className="driver-summary-arrow">→</span>
                <span className="driver-summary-point">{trip?.destination || trip?.drop_location || '-'}</span>
              </div>
              <div className="driver-summary-vehicle">
                Vehicle: <strong>{trip?.vehicle_registration}</strong>{' '}
                {trip?.vehicle_brand_model ? `(${trip?.vehicle_brand_model})` : ''}
              </div>
              {trip?.customer_name && (
                <div className="driver-summary-vehicle" style={{ marginTop: '8px' }}>
                  Customer: <strong>{trip.customer_name}</strong>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
