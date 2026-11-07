import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import IconButton from '../../components/common/IconButton';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { Skeleton } from '../../components/common/Loader';
import { ArrowLeftIcon } from '../../components/common/Icons';
import { getTripDetailsApi, completeTripApi } from '../../api/driver';
import { getApiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import './DriverPages.css';

export default function DriverCompleteTripPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success } = useToast();

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [finalOdometer, setFinalOdometer] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

  const startOdo = trip?.start_odometer ? Number(trip.start_odometer) : 0;
  const finalOdoNum = Number(finalOdometer);
  const calculatedDistance =
    !isNaN(finalOdoNum) && finalOdoNum > startOdo ? finalOdoNum - startOdo : 0;

  const handlePreSubmit = (e) => {
    e.preventDefault();
    setFieldError('');

    if (!finalOdometer || isNaN(finalOdoNum)) {
      setFieldError('Please enter a valid final odometer reading in km.');
      return;
    }

    if (finalOdoNum <= startOdo) {
      setFieldError(
        `Final odometer (${finalOdoNum} km) must be strictly greater than start odometer (${startOdo} km).`
      );
      return;
    }

    setShowConfirm(true);
  };

  const handleConfirmedComplete = async () => {
    setShowConfirm(false);
    if (submitting) return;

    setSubmitting(true);
    try {
      await completeTripApi(id, finalOdoNum);
      success('Trip completed successfully!');
      navigate(`/driver/trips/${id}/payment`);
    } catch (err) {
      const resp = err.response?.data;
      if (resp?.end_odometer) {
        setFieldError(
          Array.isArray(resp.end_odometer)
            ? resp.end_odometer.join(' ')
            : String(resp.end_odometer)
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
          tooltip="Back to Trip Details"
          ariaLabel="Back to Trip Details"
          variant="secondary"
          size="medium"
          onClick={() => navigate(`/driver/trips/${id}`)}
        />
        <h1 className="driver-page-title">Complete Trip</h1>
        <div style={{ width: 40 }} />
      </div>

      {loading ? (
        <div className="driver-skeletons-wrapper">
          <Skeleton height="90px" borderRadius="12px" />
          <Skeleton height="200px" borderRadius="12px" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchTrip} />
      ) : (
        <div className="driver-trip-form-desktop-layout">
          {/* Trip Summary Card */}
          <Card className="driver-summary-card">
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 10px 0' }}>Trip Summary</h3>
            <div className="driver-summary-route">
              <span className="driver-summary-point">{trip?.source || trip?.pickup_location || '-'}</span>
              <span className="driver-summary-arrow">→</span>
              <span className="driver-summary-point">{trip?.destination || trip?.drop_location || '-'}</span>
            </div>
            <div className="driver-summary-vehicle">
              Vehicle: <strong>{trip?.vehicle_registration}</strong>
            </div>
            {trip?.customer_name && (
              <div className="driver-summary-vehicle" style={{ marginTop: '6px' }}>
                Customer: <strong>{trip.customer_name}</strong>
              </div>
            )}
          </Card>

          {/* Odometer Card */}
          <Card className="driver-form-card">
            <form onSubmit={handlePreSubmit}>
              {/* Start Odometer Readonly */}
              <div className="driver-readonly-field">
                <label className="ui-input-label">Start Odometer (km)</label>
                <div className="driver-readonly-val">{startOdo} km</div>
              </div>

              {/* Final Odometer Input */}
              <div className="form-group-odometer" style={{ marginTop: '16px' }}>
                <Input
                  id="final-odometer-input"
                  name="end_odometer"
                  type="number"
                  label="Final Odometer (km)"
                  placeholder={`Greater than ${startOdo}`}
                  value={finalOdometer}
                  onChange={(e) => {
                    setFinalOdometer(e.target.value);
                    if (fieldError) setFieldError('');
                  }}
                  required
                  min={startOdo + 1}
                  step="1"
                  disabled={submitting}
                />
                {fieldError && (
                  <div className="driver-field-error-message">
                    <span>{fieldError}</span>
                  </div>
                )}
              </div>

              {/* Live Distance Calculation Display */}
              <div className="driver-calc-distance-box">
                <span className="calc-label">Calculated Distance:</span>
                <span className="calc-value">{calculatedDistance} km</span>
              </div>

              <div className="driver-form-action" style={{ marginTop: '24px' }}>
                <Button
                  type="submit"
                  variant="primary"
                  size="large"
                  fullWidth
                  loading={submitting}
                  disabled={submitting || !finalOdometer}
                >
                  Complete Trip
                </Button>
              </div>
            </form>
          </Card>

          {/* Confirm Dialog */}
          <ConfirmDialog
            isOpen={showConfirm}
            title="Complete this trip?"
            message={`Are you sure you want to finish this trip with a final odometer reading of ${finalOdometer} km (Total distance: ${calculatedDistance} km)?`}
            confirmText="Yes, Complete Trip"
            cancelText="Cancel"
            variant="primary"
            onConfirm={handleConfirmedComplete}
            onCancel={() => setShowConfirm(false)}
          />
        </div>
      )}
    </div>
  );
}

