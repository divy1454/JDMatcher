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
    } catch (err) {
      console.warn('Session expired or invalid:', err);
      localStorage.removeItem('token');
      setUser(null);
      setOrganization(null);
      setToken(null);
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
