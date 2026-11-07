import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SmartImage from '../../components/common/SmartImage';
import ErrorState from '../../components/common/ErrorState';
import { Skeleton } from '../../components/common/Loader';
import { CheckIcon } from '../../components/common/Icons';
import { images } from '../../config/images';
import { getActiveVehiclesApi, getBusSchedulesApi } from '../../api/customer';
import { getApiErrorMessage } from '../../api/client';
import './CustomerPages.css';

export default function CustomerVehicleSelectPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [busSchedules, setBusSchedules] = useState([]);
  const [selectedType, setSelectedType] = useState(null);

  const handleSelect = (type, path) => {
    setSelectedType(type);
    setTimeout(() => {
      navigate(path);
    }, 280);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [vData, sData] = await Promise.all([
        getActiveVehiclesApi(),
        getBusSchedulesApi().catch(() => ({ results: [] })),
      ]);
      const vList = Array.isArray(vData) ? vData : vData.results || [];
      const sList = Array.isArray(sData) ? sData : sData.results || [];
      setVehicles(vList);
      setBusSchedules(sList);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Aggregate stats
  const cars = vehicles.filter((v) => v.vehicle_type === 'CAR');
  const bikes = vehicles.filter((v) => v.vehicle_type === 'BIKE');

  const minCarRate = cars.length
    ? Math.min(...cars.map((v) => Number(v.rate_per_km || 15)))
    : 15;

  const minBikeRate = bikes.length
    ? Math.min(...bikes.map((v) => Number(v.rate_per_km || 8)))
    : 8;

  const openSchedules = busSchedules.filter((s) => s.status === 'OPEN' || s.is_booking_open);
  const minBusFare = openSchedules.length
    ? Math.min(...openSchedules.map((s) => Number(s.fare_per_seat || 300)))
    : 300;

  return (
    <div className="customer-page-container fade-in">
      <div className="customer-page-header">
        <div>
          <h1 className="customer-page-title">Select Vehicle</h1>
          <p className="customer-page-subtitle">
            Choose your preferred mode of transit for a comfortable journey
          </p>
        </div>
      </div>

      {loading ? (
        <div className="vehicle-selection-grid">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="vehicle-select-card">
              <Skeleton height="200px" />
              <div style={{ padding: '16px' }}>
                <Skeleton height="24px" width="60%" />
                <div style={{ marginTop: '8px' }}>
                  <Skeleton height="16px" width="40%" />
                </div>
                <div style={{ marginTop: '16px' }}>
                  <Skeleton height="42px" borderRadius="8px" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : (
        <div className="vehicle-selection-grid">
          {/* 1. Bike Card */}
          <Card
            className={`vehicle-select-card ${selectedType === 'BIKE' ? 'is-selected' : ''}`}
            onClick={() => bikes.length > 0 && handleSelect('BIKE', '/customer/book/vehicle?type=BIKE')}
          >
            {selectedType === 'BIKE' && (
              <div className="vehicle-card-selected-badge" aria-label="Selected">
                <CheckIcon size={16} />
              </div>
            )}
            <SmartImage
              src={images.vehicleBike.src}
              fallback={images.vehicleBike.fallback}
              fallbacks={images.vehicleBike.fallbacks}
              fallbackIcon={images.vehicleBike.fallbackIcon}
              alt="Express Commuter Bike"
              aspectRatio="16 / 10"
              priority
              className="vehicle-card-image"
            />
            <div className="vehicle-card-body">
              <div className="vehicle-card-title-row">
                <h3 className="vehicle-card-title">Bike</h3>
                <span className="vehicle-avail-tag">
                  {bikes.length} Available
                </span>
              </div>
              <p className="vehicle-card-desc">
                Ideal for solo quick errands and congested city commuting.
              </p>
              <div className="vehicle-pricing-row">
                <span className="price-label">Starting Rate</span>
                <span className="price-value">Rs. {minBikeRate}/km</span>
              </div>
              <Button
                variant="primary"
                size="large"
                fullWidth
                disabled={bikes.length === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect('BIKE', '/customer/book/vehicle?type=BIKE');
                }}
              >
                {bikes.length > 0 ? 'Book Bike' : 'None Available'}
              </Button>
            </div>
          </Card>

          {/* 2. Car Card */}
          <Card
            className={`vehicle-select-card ${selectedType === 'CAR' ? 'is-selected' : ''}`}
            onClick={() => cars.length > 0 && handleSelect('CAR', '/customer/book/vehicle?type=CAR')}
          >
            {selectedType === 'CAR' && (
              <div className="vehicle-card-selected-badge" aria-label="Selected">
                <CheckIcon size={16} />
              </div>
            )}
            <SmartImage
              src={images.vehicleCar.src}
              fallback={images.vehicleCar.fallback}
              fallbacks={images.vehicleCar.fallbacks}
              fallbackIcon={images.vehicleCar.fallbackIcon}
              alt="Fleet Passenger Sedan"
              aspectRatio="16 / 10"
              priority
              className="vehicle-card-image"
            />
            <div className="vehicle-card-body">
              <div className="vehicle-card-title-row">
                <h3 className="vehicle-card-title">Car</h3>
                <span className="vehicle-avail-tag">
                  {cars.length} Available
                </span>
              </div>
              <p className="vehicle-card-desc">
                Premium comfortable sedans & SUVs for families and business travels.
              </p>
              <div className="vehicle-pricing-row">
                <span className="price-label">Starting Rate</span>
                <span className="price-value">Rs. {minCarRate}/km</span>
              </div>
              <Button
                variant="primary"
                size="large"
                fullWidth
                disabled={cars.length === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect('CAR', '/customer/book/vehicle?type=CAR');
                }}
              >
                {cars.length > 0 ? 'Book Car' : 'None Available'}
              </Button>
            </div>
          </Card>

          {/* 3. Bus Card */}
          <Card
            className={`vehicle-select-card ${selectedType === 'BUS' ? 'is-selected' : ''}`}
            onClick={() => handleSelect('BUS', '/customer/book/bus')}
          >
            {selectedType === 'BUS' && (
              <div className="vehicle-card-selected-badge" aria-label="Selected">
                <CheckIcon size={16} />
              </div>
            )}
            <SmartImage
              src={images.busBooking.src}
              fallback={images.busBooking.fallback}
              fallbacks={images.busBooking.fallbacks}
              fallbackIcon={images.busBooking.fallbackIcon}
              alt="Intercity Bus Travel"
              aspectRatio="16 / 10"
              priority
              className="vehicle-card-image"
            />
            <div className="vehicle-card-body">
              <div className="vehicle-card-title-row">
                <h3 className="vehicle-card-title">Bus</h3>
                <span className="vehicle-avail-tag bus">
                  {openSchedules.length} Routes Open
                </span>
              </div>
              <p className="vehicle-card-desc">
                Fixed scheduled intercity transit routes with dedicated passenger seats.
              </p>
              <div className="vehicle-pricing-row">
                <span className="price-label">Fixed Seat Fares</span>
                <span className="price-value">From Rs. {minBusFare}/seat</span>
              </div>
              <Button
                variant="primary"
                size="large"
                fullWidth
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect('BUS', '/customer/book/bus');
                }}
              >
                Explore Bus Schedules
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
