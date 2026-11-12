import React from 'react';
import DedicatedVehicleBookingForm from '../../components/customer/DedicatedVehicleBookingForm';

export default function CustomerCarBookingPage() {
  return (
    <DedicatedVehicleBookingForm
      vehicleType="CAR"
      title="Book a Car"
      subtitle="Comfortable, climate-controlled rides for personal travel, family outings, and corporate journeys."
    />
  );
}

