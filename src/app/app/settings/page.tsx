'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/ui/toast';
import {
  X,
  Plus,
  Edit2,
  Save,
  XCircle,
  Mail,
  User,
  Crown,
  AlertTriangle,
  Trash2,
  Bell,
  MessageSquare,
} from 'lucide-react';
import Link from 'next/link';

interface WatchlistItem {
  id: string;
  ticker: string;
  price?: number | null;
  changePercent?: number | null;
}

interface AccountData {
  user: {
    id: string;
    email: string;
    name: string | null;
    tier: 'FREE' | 'PRO' | 'ELITE';
  };
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newTicker, setNewTicker] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fetch watchlist
  const { data: watchlistData, isLoading: watchlistLoading } = useQuery<{
    watchlist: WatchlistItem[];
    limit: number;
    count: number;
  }>({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/user/watchlist');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
  });

  // Fetch account data
  const { data: accountData, isLoading: accountLoading } = useQuery<AccountData>({
    queryKey: ['account'],
    queryFn: async () => {
      const res = await fetch('/api/user/account');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
  });

  // Initialize edited name when account data loads
  useEffect(() => {
    if (accountData?.user.name && !isEditingName) {
      setEditedName(accountData.user.name);
    }
  }, [accountData?.user.name, isEditingName]);

  // Add ticker mutation
  const addTickerMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const res = await fetch('/api/user/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      setNewTicker('');
      showToast('Ticker added to watchlist', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  // Remove ticker mutation
  const removeTickerMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const res = await fetch('/api/user/watchlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      showToast('Ticker removed from watchlist', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  // Update name mutation
  const updateNameMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/user/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account'] });
      setIsEditingName(false);
      showToast('Name updated successfully', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/user/account', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    onSuccess: async () => {
      showToast('Account deleted successfully', 'success');
      // Sign out and redirect
      await signOut({ callbackUrl: '/' });
      router.push('/');
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  const handleAddTicker = () => {
    const tickerUpper = newTicker.trim().toUpperCase();
    
    // Validate format
    if (!/^[A-Z]{1,5}$/.test(tickerUpper)) {
      showToast('Invalid ticker format. Must be 1-5 letters.', 'error');
      return;
    }

    // Check if already in watchlist
    const existingItems = watchlistData?.watchlist || [];
    if (Array.isArray(existingItems) && existingItems.some((item) => item.ticker === tickerUpper)) {
      showToast('Ticker already in watchlist', 'error');
      return;
    }

    addTickerMutation.mutate(tickerUpper);
  };

  const handleRemoveTicker = (ticker: string) => {
    removeTickerMutation.mutate(ticker);
  };

  const handleSaveName = () => {
    if (editedName.trim().length === 0) {
      showToast('Name cannot be empty', 'error');
      return;
    }
    updateNameMutation.mutate(editedName.trim());
  };

  const handleDeleteAccount = () => {
    deleteAccountMutation.mutate();
  };

  const tier = accountData?.user.tier || 'FREE';
  const watchlistCount = watchlistData?.count || 0;
  const watchlistLimit = watchlistData?.limit || 5;
  const isAtLimit = watchlistCount >= watchlistLimit;

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-text-primary mb-8">Settings</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Left Column - Watchlist */}
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-background-card p-6">
              <h2 className="text-xl font-semibold text-text-primary mb-4">
                Your Watchlist
              </h2>

              {/* Limit indicator */}
              <div className="mb-4 p-3 rounded-lg bg-background-surface border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">
                    {watchlistCount} of {watchlistLimit} tickers used
                  </span>
                  <Badge
                    variant={
                      tier === 'FREE'
                        ? 'normal'
                        : tier === 'PRO'
                        ? 'elevated'
                        : 'crisis'
                    }
                  >
                    {tier} tier
                  </Badge>
                </div>
                {isAtLimit && (
                  <div className="mt-2 p-2 rounded bg-warning/10 border border-warning/20">
                    <p className="text-xs text-warning flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3" />
                      Watchlist limit reached. Upgrade to add more tickers.
                    </p>
                    <Link href="/pricing">
                      <Button size="sm" variant="outline" className="mt-2 w-full">
                        Upgrade Plan
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              {/* Add ticker */}
              <div className="mb-4 flex gap-2">
                <Input
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                  placeholder="Enter ticker (e.g., NVDA)"
                  disabled={isAtLimit || addTickerMutation.isPending}
                  maxLength={5}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTicker();
                  }}
                />
                <Button
                  onClick={handleAddTicker}
                  disabled={isAtLimit || !newTicker.trim() || addTickerMutation.isPending}
                  size="lg"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Watchlist items */}
              {watchlistLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-12 bg-background-elevated animate-pulse rounded"
                    />
                  ))}
                </div>
              ) : !watchlistData?.watchlist || watchlistData.watchlist.length === 0 ? (
                <div className="text-center py-8 text-text-muted">
                  <p>No tickers in watchlist yet</p>
                  <p className="text-sm mt-1">Add tickers above to get started</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {watchlistData?.watchlist.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-background-surface rounded border border-border hover:border-accent/50 transition-colors"
                    >
                      <div>
                        <div className="font-semibold text-text-primary">
                          {item.ticker}
                        </div>
                        {item.price !== null && item.price !== undefined && (
                          <div className="text-sm text-text-secondary">
                            ${item.price.toFixed(2)}
                            {item.changePercent !== null &&
                              item.changePercent !== undefined && (
                                <span
                                  className={`ml-2 ${
                                    item.changePercent >= 0
                                      ? 'text-bull'
                                      : 'text-bear'
                                  }`}
                                >
                                  {item.changePercent >= 0 ? '+' : ''}
                                  {item.changePercent.toFixed(2)}%
                                </span>
                              )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveTicker(item.ticker)}
                        disabled={removeTickerMutation.isPending}
                        className="p-1 rounded hover:bg-bear/10 text-text-muted hover:text-bear transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Account Settings */}
          <div className="space-y-6">
            {/* Account Section */}
            <div className="rounded-xl border border-border bg-background-card p-6">
              <h2 className="text-xl font-semibold text-text-primary mb-4">
                Account
              </h2>

              {accountLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-12 bg-background-elevated animate-pulse rounded"
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      <Mail className="h-4 w-4 inline mr-2" />
                      Email
                    </label>
                    <Input
                      value={accountData?.user.email || ''}
                      disabled
                      className="bg-background-surface"
                    />
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      <User className="h-4 w-4 inline mr-2" />
                      Name
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={isEditingName ? editedName : accountData?.user.name || ''}
                        onChange={(e) => setEditedName(e.target.value)}
                        disabled={!isEditingName}
                        className="flex-1"
                      />
                      {isEditingName ? (
                        <Button
                          onClick={handleSaveName}
                          disabled={updateNameMutation.isPending}
                          size="lg"
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          onClick={() => {
                            setEditedName(accountData?.user.name || '');
                            setIsEditingName(true);
                          }}
                          variant="outline"
                          size="lg"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                      {isEditingName && (
                        <Button
                          onClick={() => {
                            setIsEditingName(false);
                            setEditedName(accountData?.user.name || '');
                          }}
                          variant="outline"
                          size="lg"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Tier */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      <Crown className="h-4 w-4 inline mr-2" />
                      Subscription Tier
                    </label>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          tier === 'FREE'
                            ? 'normal'
                            : tier === 'PRO'
                            ? 'elevated'
                            : 'crisis'
                        }
                      >
                        {tier}
                      </Badge>
                      <Link href="/pricing">
                        <Button variant="outline" size="sm">
                          Upgrade Plan
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Preferences Section */}
            <div className="rounded-xl border border-border bg-background-card p-6">
              <h2 className="text-xl font-semibold text-text-primary mb-4">
                Preferences
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-background-surface rounded border border-border">
                  <div>
                    <div className="font-medium text-text-primary flex items-center gap-2">
                      <Bell className="h-4 w-4" />
                      Email Alerts
                    </div>
                    <p className="text-xs text-text-muted mt-1">Coming soon</p>
                  </div>
                  <button
                    disabled
                    className="px-3 py-1 rounded bg-background-elevated text-text-muted cursor-not-allowed"
                  >
                    Off
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 bg-background-surface rounded border border-border">
                  <div>
                    <div className="font-medium text-text-primary flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      SMS Alerts
                    </div>
                    <p className="text-xs text-text-muted mt-1">Pro/Elite only</p>
                  </div>
                  <button
                    disabled
                    className="px-3 py-1 rounded bg-background-elevated text-text-muted cursor-not-allowed"
                  >
                    Off
                  </button>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="rounded-xl border border-bear/20 bg-bear/5 p-6">
              <h2 className="text-xl font-semibold text-bear mb-4">
                Danger Zone
              </h2>
              <div className="space-y-4">
                <p className="text-sm text-text-secondary">
                  Once you delete your account, there is no going back. Please be
                  certain.
                </p>
                {showDeleteConfirm ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-bear">
                      Are you sure? This action cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleDeleteAccount}
                        disabled={deleteAccountMutation.isPending}
                        variant="outline"
                        className="border-bear text-bear hover:bg-bear/10"
                      >
                        {deleteAccountMutation.isPending ? 'Deleting...' : 'Yes, delete my account'}
                      </Button>
                      <Button
                        onClick={() => setShowDeleteConfirm(false)}
                        variant="outline"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => setShowDeleteConfirm(true)}
                    variant="outline"
                    className="border-bear text-bear hover:bg-bear/10"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Account
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
