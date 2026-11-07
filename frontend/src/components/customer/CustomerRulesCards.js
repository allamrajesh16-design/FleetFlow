import React from 'react';
import Card from '../common/Card';
import { BusIcon, CheckCircleIcon } from '../common/Icons';
import './CustomerComponents.css';

/**
 * Reusable Bus Booking Rules Card matching design screens
 */
export function BusBookingRulesCard() {
  return (
    <Card className="customer-rules-card bus-rules-card">
      <div className="rules-card-header">
        <div className="rules-icon-badge bus">
          <BusIcon size={20} />
        </div>
        <h4 className="rules-card-title">Bus Booking Rules</h4>
      </div>
      <ul className="rules-list">
        <li>
          <span className="rule-bullet">•</span>
          <span><strong>Minimum passengers:</strong> Required threshold per route schedule.</span>
        </li>
        <li>
          <span className="rule-bullet">•</span>
          <span><strong>Booking deadline:</strong> Closes strictly 10 hours before scheduled departure.</span>
        </li>
        <li>
          <span className="rule-bullet">•</span>
          <span><strong>Auto cancellation:</strong> If minimum passengers are not reached, the bus trip is cancelled automatically.</span>
        </li>
        <li>
          <span className="rule-bullet">•</span>
          <span><strong>Flexible options:</strong> You will be notified with 3 choices: alternative vehicle, trip cancellation, or full refund.</span>
        </li>
      </ul>
    </Card>
  );
}

/**
 * Reusable Payment Rules Card matching design screens
 */
export function PaymentRulesCard() {
  return (
    <Card className="customer-rules-card payment-rules-card">
      <div className="rules-card-header">
        <div className="rules-icon-badge payment">
          <CheckCircleIcon size={20} />
        </div>
        <h4 className="rules-card-title">Payment Rules</h4>
      </div>
      <ul className="rules-list">
        <li>
          <span className="rule-bullet">•</span>
          <span><strong>Final fare:</strong> Calculated after trip completion from actual start/end odometer reading.</span>
        </li>
        <li>
          <span className="rule-bullet">•</span>
          <span><strong>Direct UPI payment:</strong> Scan the driver's verified UPI QR code with any UPI app.</span>
        </li>
        <li>
          <span className="rule-bullet">•</span>
          <span><strong>Verification:</strong> Payment is confirmed immediately once the driver or manager verifies the transaction.</span>
        </li>
        <li>
          <span className="rule-bullet">•</span>
          <span><strong>Instant receipt:</strong> Your official digital tax receipt and PDF download are generated upon confirmation.</span>
        </li>
      </ul>
    </Card>
  );
}
