'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiRequest } from './api';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'super_admin' | 'org_admin' | 'recruiter';
  organizationId: string | null;
  deviceId?: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  totalBilledAmount: string;
  securityDepositLimit: string;
}

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User, org?: Organization | null) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }): any {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshUser = async () => {
    try {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) {
        setIsLoading(false);
        return;
      }
      const data = await apiRequest('/auth/me');
      setUser(data.user);
      setOrganization(data.organization);
      setToken(storedToken);

      // Broadcast auth sync for Chrome extension
      if (typeof window !== 'undefined' && data.user) {
        window.postMessage({
          type: 'JDMATCHER_AUTH_SYNC',
          token: storedToken,
          user: data.user,
          organization: data.organization || null,
          apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
          frontendUrl: window.location.origin,
        }, '*');
      }
    } catch (err) {
      console.warn('Session expired or invalid:', err);
      localStorage.removeItem('token');
      setUser(null);
      setOrganization(null);
      setToken(null);
      if (typeof window !== 'undefined') {
        document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
        window.postMessage({ type: 'JDMATCHER_AUTH_LOGOUT' }, '*');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = (newToken: string, newUser: User, newOrg?: Organization | null) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
    setOrganization(newOrg || null);

    // Set cookie and broadcast auth sync for Chrome extension
    if (typeof window !== 'undefined') {
      document.cookie = `token=${newToken}; path=/; max-age=604800; SameSite=Lax`;
      window.postMessage({
        type: 'JDMATCHER_AUTH_SYNC',
        token: newToken,
        user: newUser,
        organization: newOrg || null,
        apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
        frontendUrl: window.location.origin,
      }, '*');
    }

    if (newUser.role === 'super_admin') {
      router.push('/admin/telemetry');
    } else if (newUser.role === 'org_admin') {
      router.push('/org-portal/billing');
    } else {
      router.push('/recruiter-portal/candidates');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setOrganization(null);
    if (typeof window !== 'undefined') {
      document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
      window.postMessage({ type: 'JDMATCHER_AUTH_LOGOUT' }, '*');
    }
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        token,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
