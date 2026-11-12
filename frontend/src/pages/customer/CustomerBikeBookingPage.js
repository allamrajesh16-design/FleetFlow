import React from 'react';
import DedicatedVehicleBookingForm from '../../components/customer/DedicatedVehicleBookingForm';

export default function CustomerBikeBookingPage() {
  return (
    <DedicatedVehicleBookingForm
      vehicleType="BIKE"
      title="Book a Bike"
      subtitle="Fast, agile transit designed for city commuting, quick runs, and navigating traffic efficiently."
    />
  );
}

