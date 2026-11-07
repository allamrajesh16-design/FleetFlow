import StatCard from '../../components/common/StatCard';
import Button from '../../components/common/Button';
import {
  BookingIcon,
  TripIcon,
  QrIcon,
  PaymentIcon,
} from '../../components/common/Icons';
import { useAuth } from '../../context/AuthContext';
import './Dashboards.css';

export default function CustomerDashboardPlaceholder() {
  const { user } = useAuth();

  return (
    <div className="dashboard-page-container fade-in">
      {/* Welcome Banner */}
      <div className="dashboard-welcome-banner">
        <div className="dashboard-welcome-text">
          <h1>Hello, {user?.full_name || 'Passenger'}!</h1>
          <p>Book trips, view your digital QR boarding passes, and manage travel payments</p>
        </div>
        <Button variant="primary" size="medium">
          + Book a New Journey
        </Button>
      </div>

      {/* Customer StatCards */}
      <div className="dashboard-stats-grid">
        <StatCard
          icon={<BookingIcon size={22} />}
          number="2"
          label="Upcoming Bookings"
          trend="Next: Tomorrow 09:00 AM"
          trendUp={true}
          iconColor="var(--primary)"
          iconBg="var(--blue-50)"
        />

        <StatCard
          icon={<TripIcon size={22} />}
          number="12"
          label="Completed Journeys"
          trend="All routes on schedule"
          trendUp={true}
          iconColor="var(--success-text)"
          iconBg="var(--success-bg)"
        />

        <StatCard
          icon={<QrIcon size={22} />}
          number="2 Active"
          label="Digital Boarding Passes"
          trend="Ready to scan at bus"
          trendUp={true}
          iconColor="var(--purple-text)"
          iconBg="var(--purple-bg)"
        />

        <StatCard
          icon={<PaymentIcon size={22} />}
          number="450 pts"
          label="Fleet Rewards Points"
          trend="Eligible for 10% discount"
          trendUp={true}
          iconColor="var(--warning-text)"
          iconBg="var(--warning-bg)"
        />
      </div>

      {/* Coming Soon Note */}
      <div className="dashboard-coming-soon-card">
        <span className="coming-soon-badge">Passenger Booking Portal</span>
        <h2 className="coming-soon-title">Seat Reservation & QR Passes Coming in Stage 8</h2>
        <p className="coming-soon-desc">
          Interactive seat selection charts, instant live bus tracking maps, and digital QR ticket downloads will be connected to the backend in the next stage.
        </p>
      </div>
    </div>
  );
}
