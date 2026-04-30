import Link from 'next/link';
import { createVenueAction } from '@/actions/venues';

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white';

const selectCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

export default function NewVenuePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/venues" className="text-sm text-gray-500 hover:text-gray-900">
            ← Venues
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-900">New venue</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Create venue</h1>
        <p className="text-sm text-gray-500 mb-6">
          Venue code (SC-[TYPE]-[CITY]-[SEQ]) is auto-generated on save.
        </p>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <form action={createVenueAction} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Venue name *</label>
              <input name="name" required className={inputCls} placeholder="e.g. Nexus Mall Hyderabad" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue type *</label>
                <select name="type" required className={selectCls}>
                  <option value="">Select type</option>
                  <option value="MALL">Mall</option>
                  <option value="HOSPITAL">Hospital</option>
                  <option value="HOTEL">Hotel</option>
                  <option value="CORPORATE">Corporate</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                <input name="city" required className={inputCls} placeholder="e.g. Hyderabad" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subscription tier *</label>
              <select name="subscription_tier" required className={selectCls}>
                <option value="ESSENTIAL">Essential</option>
                <option value="PROFESSIONAL">Professional</option>
                <option value="ENTERPRISE">Enterprise</option>
                <option value="CHAIN">Chain</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <textarea
                name="address"
                rows={2}
                className={`${inputCls} resize-none`}
                placeholder="Full address (optional)"
              />
            </div>

            <div className="pt-2 flex gap-3 justify-end">
              <Link
                href="/venues"
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Create venue →
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
