import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SmartImage from '../../components/common/SmartImage';
import ErrorState from '../../components/common/ErrorState';
import { Skeleton } from '../../components/common/Loader';
import { CheckIcon, ChevronRightIcon, UsersIcon, BikeIcon, VehicleIcon, BusIcon } from '../../components/common/Icons';
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
    }, 220);
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

  // Filter available vehicles by type
  const cars = vehicles.filter((v) => v.vehicle_type === 'CAR');
  const bikes = vehicles.filter((v) => v.vehicle_type === 'BIKE');

  const minCarRate = cars.length
    ? Math.min(...cars.map((v) => Number(v.rate_per_km || 12)))
    : 12;

  const minBikeRate = bikes.length
    ? Math.min(...bikes.map((v) => Number(v.rate_per_km || 5)))
    : 5;

  const openSchedules = busSchedules.filter((s) => s.status === 'OPEN' || s.is_booking_open);

  const minBusFare = openSchedules.length
    ? Math.min(...openSchedules.map((s) => Number(s.fare_per_seat || 250)))
    : 250;

  return (
    <div className="customer-page-container fade-in">
      {/* 1. Main Page Header */}
      <div className="customer-page-header">
        <div className="customer-header-main">
          <h1 className="customer-page-title">Book Your Vehicle</h1>
          <p className="customer-page-subtitle">
            Choose your vehicle and provide your journey details to create a booking.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="vehicle-selection-grid-three">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="vehicle-select-card">
              <Skeleton height="220px" />
              <div style={{ padding: '20px' }}>
                <Skeleton height="26px" width="60%" />
                <div style={{ marginTop: '10px' }}>
                  <Skeleton height="16px" width="85%" />
                </div>
                <div style={{ marginTop: '8px' }}>
                  <Skeleton height="16px" width="50%" />
                </div>
                <div style={{ marginTop: '20px' }}>
                  <Skeleton height="44px" borderRadius="10px" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : (
        <>
          {/* Main Three Vehicle Options: Bike Booking, Car Booking, and Bus Booking */}
          <div className="vehicle-selection-grid-three">
            {/* OPTION 1: Bike Booking */}
            <Card
              className={`vehicle-select-card vehicle-card-enhanced ${selectedType === 'BIKE' ? 'is-selected' : ''}`}
              onClick={() => handleSelect('BIKE', '/customer/book/bike')}
            >
              {selectedType === 'BIKE' && (
                <div className="vehicle-card-selected-badge" aria-label="Selected">
                  <CheckIcon size={16} />
                </div>
              )}
              <div className="vehicle-card-image-wrap">
                <SmartImage
                  src={images.vehicleBike.src}
                  fallback={images.vehicleBike.fallback}
                  fallbacks={images.vehicleBike.fallbacks}
                  fallbackIcon={images.vehicleBike.fallbackIcon}
                  alt="FleetFlow Commuter Bike"
                  aspectRatio="16 / 10"
                  priority
                  className="vehicle-card-image"
                />
                <span className="vehicle-category-pill">
                  <BikeIcon size={14} /> 2-Wheeler Fleet
                </span>
              </div>

              <div className="vehicle-card-body">
                <div className="vehicle-card-title-row">
                  <div>
                    <h2 className="vehicle-card-title">Bike Booking</h2>
                    <span className="vehicle-avail-tag">
                      {bikes.length} {bikes.length === 1 ? 'Bike' : 'Bikes'} Available
                    </span>
                  </div>
                  <div className="vehicle-card-rate-badge">
                    <span className="rate-num">₹{minBikeRate}</span>
                    <span className="rate-unit">/km</span>
                  </div>
                </div>

                <p className="vehicle-card-desc">
                  Fast, agile transit designed for city commuting, quick solo runs, and navigating heavy traffic efficiently.
                </p>

                {/* Specs / Capacity */}
                <div className="vehicle-specs-list">
                  <div className="spec-item">
                    <UsersIcon size={16} className="spec-icon" />
                    <span><strong>Passenger Capacity:</strong> Up to 2 Passengers</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-bullet">•</span>
                    <span><strong>Trip Options:</strong> One-way or Round Trip</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-bullet">•</span>
                    <span><strong>Fleet Models:</strong> Royal Enfield, Activa 6G, Commuter</span>
                  </div>
                </div>

                <div className="vehicle-card-action">
                  <Button
                    variant="primary"
                    size="large"
                    fullWidth
                    rightIcon={<ChevronRightIcon size={18} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect('BIKE', '/customer/book/bike');
                    }}
                  >
                    Select Bike
                  </Button>
                </div>
              </div>
            </Card>

            {/* OPTION 2: Car Booking */}
            <Card
              className={`vehicle-select-card vehicle-card-enhanced ${selectedType === 'CAR' ? 'is-selected' : ''}`}
              onClick={() => handleSelect('CAR', '/customer/book/car')}
            >
              {selectedType === 'CAR' && (
                <div className="vehicle-card-selected-badge" aria-label="Selected">
                  <CheckIcon size={16} />
                </div>
              )}
              <div className="vehicle-card-image-wrap">
                <SmartImage
                  src={images.vehicleCar.src}
                  fallback={images.vehicleCar.fallback}
                  fallbacks={images.vehicleCar.fallbacks}
                  fallbackIcon={images.vehicleCar.fallbackIcon}
                  alt="FleetFlow Passenger Car"
                  aspectRatio="16 / 10"
                  priority
                  className="vehicle-card-image"
                />
                <span className="vehicle-category-pill">
                  <VehicleIcon size={14} /> 4-Wheeler Fleet
                </span>
              </div>

              <div className="vehicle-card-body">
                <div className="vehicle-card-title-row">
                  <div>
                    <h2 className="vehicle-card-title">Car Booking</h2>
                    <span className="vehicle-avail-tag">
                      {cars.length} {cars.length === 1 ? 'Car' : 'Cars'} Available
                    </span>
                  </div>
                  <div className="vehicle-card-rate-badge">
                    <span className="rate-num">₹{minCarRate}</span>
                    <span className="rate-unit">/km</span>
                  </div>
                </div>

                <p className="vehicle-card-desc">
                  Comfortable, climate-controlled rides for personal travel, family outings, airport transfers, and corporate transit.
                </p>

                {/* Specs / Capacity */}
                <div className="vehicle-specs-list">
                  <div className="spec-item">
                    <UsersIcon size={16} className="spec-icon" />
                    <span><strong>Passenger Capacity:</strong> Up to 4–7 Passengers</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-bullet">•</span>
                    <span><strong>Luggage Support:</strong> Light, Medium & Heavy capacity</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-bullet">•</span>
                    <span><strong>Fleet Models:</strong> Innova Crysta, Dzire, Creta & Sedans</span>
                  </div>
                </div>

                <div className="vehicle-card-action">
                  <Button
                    variant="primary"
                    size="large"
                    fullWidth
                    rightIcon={<ChevronRightIcon size={18} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect('CAR', '/customer/book/car');
                    }}
                  >
                    Select Car
                  </Button>
                </div>
              </div>
            </Card>

            {/* OPTION 3: Bus Booking */}
            <Card
              className={`vehicle-select-card vehicle-card-enhanced ${selectedType === 'BUS' ? 'is-selected' : ''}`}
              onClick={() => handleSelect('BUS', '/customer/book/bus')}
            >
              {selectedType === 'BUS' && (
                <div className="vehicle-card-selected-badge" aria-label="Selected">
                  <CheckIcon size={16} />
                </div>
              )}
              <div className="vehicle-card-image-wrap">
                <SmartImage
                  src={images.busBooking.src}
                  fallback={images.busBooking.fallback}
                  fallbacks={images.busBooking.fallbacks}
                  fallbackIcon={images.busBooking.fallbackIcon}
                  alt="FleetFlow Express Coach Bus"
                  aspectRatio="16 / 10"
                  priority
                  className="vehicle-card-image"
                />
                <span className="vehicle-category-pill">
                  <BusIcon size={14} /> Express Bus Fleet
                </span>
              </div>

              <div className="vehicle-card-body">
                <div className="vehicle-card-title-row">
                  <div>
                    <h2 className="vehicle-card-title">Bus Booking</h2>
                    <span className="vehicle-avail-tag">
                      {openSchedules.length} {openSchedules.length === 1 ? 'Route' : 'Routes'} Open
                    </span>
                  </div>
                  <div className="vehicle-card-rate-badge">
                    <span className="rate-num">₹{minBusFare}</span>
                    <span className="rate-unit">/seat</span>
                  </div>
                </div>

                <p className="vehicle-card-desc">
                  Comfortable, scheduled intercity travel with reserved seats, guaranteed departures, and spacious luggage room.
                </p>

                {/* Specs / Capacity */}
                <div className="vehicle-specs-list">
                  <div className="spec-item">
                    <UsersIcon size={16} className="spec-icon" />
                    <span><strong>Passenger Capacity:</strong> Up to 30–50 Seats</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-bullet">•</span>
                    <span><strong>Trip Options:</strong> Scheduled Fixed Routes</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-bullet">•</span>
                    <span><strong>Fleet Models:</strong> Volvo Multi-Axle, BharatBenz Coach</span>
                  </div>
                </div>

                <div className="vehicle-card-action">
                  <Button
                    variant="primary"
                    size="large"
                    fullWidth
                    rightIcon={<ChevronRightIcon size={18} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect('BUS', '/customer/book/bus');
                    }}
                  >
                    Select Bus
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
