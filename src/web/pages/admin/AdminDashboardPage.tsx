/**
 * Admin Dashboard Page
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export const AdminDashboardPage: React.FC = () => {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          {t('Admin Dashboard')}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* User Management Card */}
          <Link
            to="/admin/users"
            className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {t('User Management')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {t('Manage users, roles, and permissions')}
            </p>
          </Link>

          {/* System Config Card */}
          <Link
            to="/admin/config"
            className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {t('System Configuration')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {t('Configure system-wide settings and defaults')}
            </p>
          </Link>

          {/* Activity Logs Card */}
          <Link
            to="/admin/activity"
            className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {t('Activity Logs')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {t('View user activity and system logs')}
            </p>
          </Link>
        </div>
      </div>
    </div>
  )
}
