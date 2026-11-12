import React from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import CustomerBikeBookingPage from './CustomerBikeBookingPage';
import CustomerCarBookingPage from './CustomerCarBookingPage';

export default function CustomerBookingFormPage() {
  const [searchParams] = useSearchParams();
  const type = (searchParams.get('type') || 'CAR').toUpperCase();

  if (type === 'BIKE') {
    return <CustomerBikeBookingPage />;
  }

  return <CustomerCarBookingPage />;
}
