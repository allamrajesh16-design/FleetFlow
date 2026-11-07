import React from 'react';
import AdminPaymentsPage from '../admin/AdminPaymentsPage';

export default function ManagerPaymentsPage() {
  // Fleet Manager can view receipts, download PDFs, confirm payments, reject proofs, but CANNOT issue refunds
  return <AdminPaymentsPage canRefund={false} />;
}
