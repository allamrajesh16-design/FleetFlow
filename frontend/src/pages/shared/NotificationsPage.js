import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { Skeleton } from '../../components/common/Loader';
import {
  BellIcon,
  BookingIcon,
  PaymentIcon,
  TripIcon,
  SettingsIcon,
  CheckIcon,
  DocumentIcon,
  ReceiptIcon,
} from '../../components/common/Icons';
import { useAuth } from '../../context/AuthContext';
import {
  getNotificationsApi,
  markNotificationReadApi,
  markAllNotificationsReadApi,
} from '../../api/notifications';
import { getApiErrorMessage } from '../../api/client';
import { getDetailPath } from '../../utils/navigation';
import './NotificationsPage.css';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getNotificationsApi();
      const list = Array.isArray(data) ? data : data.results || [];
      setNotifications(list);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await markNotificationReadApi(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsReadApi();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  };

  const { user } = useAuth();
  const navigate = useNavigate();

  const handleNotificationClick = (item) => {
    if (!item.is_read) {
      handleMarkAsRead(item.id);
    }
    const role = user?.role;
    let itemId = item.item_id;
    if (!itemId && item.message) {
      const match = item.message.match(/#(\d+)/);
      if (match) itemId = match[1];
    }
    const targetType = item.item_type || item.type;
    const dest = getDetailPath(role, targetType, itemId);
    if (dest) {
      navigate(dest);
    }
  };

  const getTypeIcon = (type) => {
    const t = String(type).toUpperCase();
    switch (t) {
      case 'BOOKING':
        return <BookingIcon size={18} />;
      case 'PAYMENT':
        return <PaymentIcon size={18} />;
      case 'TRIP':
        return <TripIcon size={18} />;
      case 'MAINTENANCE':
        return <SettingsIcon size={18} />;
      case 'DOCUMENT':
        return <DocumentIcon size={18} />;
      case 'EXPENSE':
        return <ReceiptIcon size={18} />;
      default:
        return <BellIcon size={18} />;
    }
  };

  const getTypeClass = (type) => {
    const t = String(type).toUpperCase();
    switch (t) {
      case 'BOOKING':
        return 'type-booking';
      case 'PAYMENT':
        return 'type-payment';
      case 'TRIP':
        return 'type-trip';
      case 'MAINTENANCE':
        return 'type-maintenance';
      case 'DOCUMENT':
        return 'type-document';
      case 'EXPENSE':
        return 'type-expense';
      default:
        return 'type-system';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') return !n.is_read;
    return true;
  });

  return (
    <div className="notifications-page">
      {/* Page Header */}
      <div className="notifications-header">
        <div className="notifications-header-left">
          <div className="notifications-title-row">
            <h1 className="notifications-title">Notifications</h1>
            {unreadCount > 0 && (
              <Badge status="Active" text={`${unreadCount} New`} />
            )}
          </div>
          <p className="notifications-subtitle">
            Stay updated with real-time alerts, bookings, and operations logs
          </p>
        </div>

        <div className="notifications-header-actions">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="small"
              onClick={handleMarkAllRead}
              loading={markingAll}
              disabled={markingAll}
            >
              <CheckIcon size={16} />
              Mark all as read
            </Button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="notifications-filters">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`filter-tab-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({notifications.length})
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`filter-tab-btn ${filter === 'unread' ? 'active' : ''}`}
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </Button>
      </div>

      {/* Main Notification List Card */}
      <Card className="notifications-list-card">
        {loading ? (
          <div className="notifications-skeletons">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="notification-skeleton-row">
                <Skeleton width="40px" height="40px" circle />
                <div style={{ flex: 1 }}>
                  <Skeleton width="40%" height="16px" />
                  <div style={{ marginTop: '6px' }}>
                    <Skeleton width="80%" height="12px" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchNotifications} />
        ) : filteredNotifications.length === 0 ? (
          <EmptyState
            title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            description="When activities occur regarding trips, tickets, or system notices, they will appear here."
          />
        ) : (
          <ul className="notification-items-list">
            {filteredNotifications.map((item) => (
              <li
                key={item.id}
                className={`notification-item ${!item.is_read ? 'unread' : 'read'}`}
                onClick={() => handleNotificationClick(item)}
              >
                <div className={`notification-icon-wrapper ${getTypeClass(item.type)}`}>
                  {getTypeIcon(item.type)}
                </div>

                <div className="notification-content">
                  <div className="notification-title-line">
                    <strong className="notification-item-title">{item.title}</strong>
                    <span className="notification-time">{formatDate(item.created_at)}</span>
                  </div>
                  <p className="notification-item-message">{item.message}</p>
                </div>

                {!item.is_read && (
                  <span className="notification-unread-dot" title="Unread" />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
