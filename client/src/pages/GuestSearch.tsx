import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import GuestCard from '../components/GuestCard';
import { Guest } from '../types';
import { Search } from 'lucide-react';

export default function GuestSearch() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleInput = (value: string) => {
    setSearch(value);
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => setDebouncedSearch(value), 400);
    setTimer(t);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['guests', 'search', debouncedSearch],
    queryFn: () =>
      debouncedSearch.length >= 2
        ? api.get(`/guests/search?q=${encodeURIComponent(debouncedSearch)}`).then((r) => r.data)
        : Promise.resolve({ data: [], pagination: null }),
    enabled: debouncedSearch.length >= 2,
  });

  const guests: Guest[] = data?.data || [];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Guest Lookup</h1>
        <p className="text-slate-500 mt-1">
          Search by name, email, or phone number to view a guest's review history.
        </p>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          className="input pl-10 py-3 text-base"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => handleInput(e.target.value)}
          autoFocus
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Results */}
      {debouncedSearch.length >= 2 && (
        <div className="space-y-3">
          {guests.length === 0 && !isLoading && (
            <div className="card p-8 text-center">
              <p className="text-slate-500 text-sm mb-4">
                No guest found matching "{debouncedSearch}"
              </p>
              <p className="text-xs text-slate-400 mb-4">
                If this is a new guest, you can add them when writing a review.
              </p>
              <a
                href={`/reviews/new?guestName=${encodeURIComponent(debouncedSearch)}`}
                className="btn-primary text-sm"
              >
                + Write a review for this guest
              </a>
            </div>
          )}

          {guests.map((guest) => (
            <GuestCard key={guest.id} guest={guest} showReviewButton />
          ))}

          {data?.pagination && data.pagination.total > guests.length && (
            <p className="text-center text-sm text-slate-500">
              Showing {guests.length} of {data.pagination.total} results
            </p>
          )}
        </div>
      )}

      {debouncedSearch.length < 2 && (
        <div className="card p-8 text-center text-slate-400">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
              <Search className="w-6 h-6 text-slate-400" />
            </div>
          </div>
          <p className="text-sm">Enter at least 2 characters to search</p>
          <p className="text-xs mt-2">Search by guest name, email address, or phone number</p>
        </div>
      )}
    </div>
  );
}
