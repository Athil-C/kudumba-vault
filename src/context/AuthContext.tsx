import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../services/supabaseBrowserClient';
import {
  apiGetMe,
  apiSyncProfile,
  apiLogout,
  setApiAccessToken,
  registerInactivityHandler,
  registerUnauthorizedHandler,
  apiVerifyRecoveryDob,
  apiResetPassword,
  SafeUser,
} from '../services/apiClient';
import { validateDateOfBirth } from '../utils/dobValidation';

export interface RegisterParams {
  fullName: string;
  familyName?: string;
  email: string;
  password: string;
  confirmPassword: string;
  dateOfBirth: string; // YYYY-MM-DD
  preferredLang?: 'ml' | 'en';
}

export interface RegisterResult {
  success: boolean;
  requiresVerification: boolean;
  isDuplicateEmail?: boolean;
  error?: string;
}

export type AuthModalMode =
  | 'login'
  | 'register'
  | 'verify-email'
  | 'forgot-password'
  | 'reset-password-otp'
  | 'reset-password-dob'
  | 'reset-password-new';

export interface AuthContextType {
  user: SafeUser | null;
  supabaseUser: SupabaseUser | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  unverifiedEmail: string | null;
  inactivityExpired: boolean;
  isRecoveryFlow: boolean;
  isAuthModalOpen: boolean;
  authModalMode: AuthModalMode;
  authPromptMessage: string | null;
  setIsRecoveryFlow: (val: boolean) => void;
  cancelRecoveryFlow: () => Promise<void>;
  clearInactivityExpired: () => void;
  openAuthModal: (
    mode?: AuthModalMode,
    promptMessage?: string | null,
    pendingAction?: (() => void | Promise<void>) | null
  ) => void;
  closeAuthModal: () => void;
  executeGuardedAction: (
    action: () => void | Promise<void>,
    options?: {
      promptMessage?: string;
      mode?: 'login' | 'register';
    }
  ) => Promise<boolean>;
  handleAuthSuccess: (user: SafeUser) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; requiresVerification?: boolean; error?: string }>;
  register: (params: RegisterParams) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  verifySignupOtp: (otp: string, email?: string) => Promise<{ success: boolean; error?: string }>;
  resendVerificationEmail: (email?: string) => Promise<{ success: boolean; message: string }>;
  resendVerificationOtp: (email?: string) => Promise<{ success: boolean; message: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;
  verifyRecoveryOtp: (otp: string, email: string) => Promise<{ success: boolean; error?: string }>;
  resendRecoveryOtp: (email: string) => Promise<{ success: boolean; message: string }>;
  verifyRecoveryDob: (dateOfBirth: string) => Promise<{ success: boolean; resetAuthorizationToken?: string; error?: string }>;
  completePasswordReset: (resetToken: string, newPassword: string, confirmPassword?: string) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<SafeUser | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [inactivityExpired, setInactivityExpired] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');
  const [authPromptMessage, setAuthPromptMessage] = useState<string | null>(null);
  const pendingActionRef = useRef<(() => void | Promise<void>) | null>(null);

  const [isRecoveryFlow, setIsRecoveryFlow] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.sessionStorage.getItem('kudumba_recovery_active') === 'true' ||
      window.location.hash.includes('type=recovery') ||
      window.location.search.includes('type=recovery')
    );
  });

  const clearInactivityExpired = useCallback(() => {
    setInactivityExpired(false);
  }, []);

  const openAuthModal = useCallback(
    (
      mode: AuthModalMode = 'login',
      promptMessage: string | null = null,
      pendingAction: (() => void | Promise<void>) | null = null
    ) => {
      setAuthModalMode(mode);
      setAuthPromptMessage(promptMessage);
      if (pendingAction) {
        pendingActionRef.current = pendingAction;
      }
      setIsAuthModalOpen(true);
    },
    []
  );

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setAuthPromptMessage(null);
    pendingActionRef.current = null;
  }, []);

  const handleAuthSuccess = useCallback(
    (authedUser: SafeUser) => {
      setIsAuthModalOpen(false);
      setAuthPromptMessage(null);
      if (pendingActionRef.current) {
        const actionToResume = pendingActionRef.current;
        pendingActionRef.current = null;
        try {
          actionToResume();
        } catch (actionErr) {
          console.error('[AuthGuard] Error resuming pending action:', actionErr);
        }
      }
    },
    []
  );

  const executeGuardedAction = useCallback(
    async (
      action: () => void | Promise<void>,
      options?: {
        promptMessage?: string;
        mode?: 'login' | 'register';
      }
    ): Promise<boolean> => {
      // 1. Wait for initial session loading if in-flight
      if (isLoading) {
        let waitCount = 0;
        while (isLoading && waitCount < 20) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          waitCount++;
        }
      }

      // 2. Check current authentication state
      const isAuthed = Boolean(
        supabaseUser &&
          (supabaseUser.email_confirmed_at || (supabaseUser as any)?.confirmed_at) &&
          !inactivityExpired &&
          !isRecoveryFlow
      );

      // 3. If authenticated, proceed with action immediately
      if (isAuthed) {
        try {
          await action();
          return true;
        } catch (err: any) {
          if (
            err?.statusCode === 401 ||
            err?.message?.includes('Authentication required') ||
            err?.message?.includes('Unauthorized')
          ) {
            openAuthModal(
              options?.mode || 'login',
              options?.promptMessage || 'Please sign in or create an account to continue.',
              action
            );
          }
          throw err;
        }
      }

      // 4. If visitor is signed out, block action and trigger Login / Sign Up modal
      const message = options?.promptMessage || 'Please sign in or create an account to continue.';
      openAuthModal(options?.mode || 'login', message, action);
      return false;
    },
    [isLoading, supabaseUser, inactivityExpired, isRecoveryFlow, openAuthModal]
  );

  // Register inactivity handler from apiClient
  useEffect(() => {
    registerInactivityHandler(async (_msg: string) => {
      setInactivityExpired(true);
      setUser(null);
      setSession(null);
      setSupabaseUser(null);
      setApiAccessToken(null);
      await supabase.auth.signOut().catch(() => {});
      openAuthModal('login', 'Your session has expired due to 7 consecutive days of inactivity. Please sign in again.');
    });
    return () => {
      registerInactivityHandler(() => {});
    };
  }, [supabase, openAuthModal]);

  // Keep refs for current loading and auth status to avoid stale closure issues in global interceptors
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  const isAuthedRef = useRef(false);
  isAuthedRef.current = Boolean(
    supabaseUser &&
      (supabaseUser.email_confirmed_at || (supabaseUser as any)?.confirmed_at) &&
      !inactivityExpired &&
      !isRecoveryFlow
  );

  const lastLoadedTokenRef = useRef<string | null>(null);
  const isInitializingRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const isHandlingUnauthorizedRef = useRef(false);
  const isSigningOutRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;

  // Register unauthorized (401) handler from apiClient for session expiration
  useEffect(() => {
    registerUnauthorizedHandler(async (_msg: string) => {
      // 1. Guard against initial loading or active signing-out loops
      if (isLoadingRef.current || isSigningOutRef.current || isHandlingUnauthorizedRef.current) return;
      if (!isAuthedRef.current) return;

      isHandlingUnauthorizedRef.current = true;

      try {
        // 2. Resilience check: Try to refresh session before destroying valid Supabase state (Criterion 2)
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (!refreshErr && refreshData?.session?.access_token) {
          // Token successfully refreshed; preserve session and update token
          setSession(refreshData.session);
          setSupabaseUser(refreshData.session.user);
          setApiAccessToken(refreshData.session.access_token);
          return;
        }

        // 3. Genuine expiration / revoked token: clean up auth state
        lastLoadedTokenRef.current = null;
        setUser(null);
        setSession(null);
        setSupabaseUser(null);
        setApiAccessToken(null);
        // Purge session from Supabase browser storage to stop infinite onAuthStateChange revival loops
        await supabase.auth.signOut().catch(() => {});
        openAuthModal('login', 'Your session has expired. Please sign in to continue.');
      } catch (e) {
        console.warn('[AuthContext] Session renewal notice:', e);
      } finally {
        isHandlingUnauthorizedRef.current = false;
      }
    });
    return () => {
      registerUnauthorizedHandler(() => {});
    };
  }, [openAuthModal, supabase]);

  // Helper to fetch MongoDB profile after Supabase confirms session
  const fetchUserProfile = useCallback(async (token: string, sbUser: SupabaseUser, force = false) => {
    if (!token) return null;
    // Prevent duplicate/redundant network calls if profile is already loaded for this token
    if (!force && lastLoadedTokenRef.current === token && userRef.current) {
      return userRef.current;
    }

    try {
      setApiAccessToken(token);
      let profile = await apiGetMe({ force, trigger: 'fetchUserProfile' });
      if (!profile) {
        // If MongoDB profile not yet created, trigger sync
        const synced = await apiSyncProfile({
          fullName: sbUser.user_metadata?.full_name || sbUser.user_metadata?.fullName,
          familyName: sbUser.user_metadata?.family_name || sbUser.user_metadata?.familyName,
          dateOfBirth: sbUser.user_metadata?.date_of_birth || sbUser.user_metadata?.dateOfBirth,
        });
        profile = synced.user;
      }
      lastLoadedTokenRef.current = token;
      setUser(profile);
      return profile;
    } catch (err) {
      console.warn('[AuthContext] Failed to load user profile:', err);
      return null;
    }
  }, []);

  // Centralized session restoration on mount
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      if (hasInitializedRef.current) return;
      hasInitializedRef.current = true;
      isInitializingRef.current = true;

      try {
        const isRecovery =
          typeof window !== 'undefined' &&
          (window.sessionStorage.getItem('kudumba_recovery_active') === 'true' ||
            window.location.hash.includes('type=recovery') ||
            window.location.search.includes('type=recovery'));

        if (isRecovery) {
          setIsRecoveryFlow(true);
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn('[AuthContext] Session retrieval notice:', error.message);
        }

        const activeSession = data?.session;
        if (activeSession && mounted) {
          setSession(activeSession);
          setSupabaseUser(activeSession.user);
          setApiAccessToken(activeSession.access_token);

          // If session is an incomplete recovery session, do NOT load user profile or grant vault dashboard access
          if (isRecovery) {
            setIsRecoveryFlow(true);
            return;
          }

          const isVerified = Boolean(
            activeSession.user.email_confirmed_at || (activeSession.user as any).confirmed_at
          );

          if (isVerified) {
            setUnverifiedEmail(null);
            await fetchUserProfile(activeSession.access_token, activeSession.user);
          } else {
            setUnverifiedEmail(activeSession.user.email || null);
          }
        }
      } catch (err) {
        console.warn('[AuthContext] Initial session check error:', err);
      } finally {
        isInitializingRef.current = false;
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initSession();

    // Listen to official Supabase auth state change events (login, logout, token refresh, password recovery)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;

      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryFlow(true);
        if (typeof window !== 'undefined') {
          try {
            window.sessionStorage.setItem('kudumba_recovery_active', 'true');
          } catch {}
        }
        setSession(newSession);
        setSupabaseUser(newSession?.user || null);
        if (newSession?.access_token) {
          setApiAccessToken(newSession.access_token);
        }
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // Skip redundant duplicate fetch if initSession is already processing this exact token
        if (
          isInitializingRef.current &&
          newSession?.access_token &&
          lastLoadedTokenRef.current === newSession.access_token
        ) {
          return;
        }

        const isRecovery =
          typeof window !== 'undefined' &&
          window.sessionStorage.getItem('kudumba_recovery_active') === 'true';

        setSession(newSession);
        setSupabaseUser(newSession?.user || null);

        if (newSession?.access_token) {
          setApiAccessToken(newSession.access_token);

          // Do NOT fetch user profile or treat as signed-in if undergoing password recovery
          if (isRecovery) {
            setIsRecoveryFlow(true);
            return;
          }

          const isVerified = Boolean(
            newSession.user.email_confirmed_at || (newSession.user as any).confirmed_at
          );

          if (isVerified) {
            setUnverifiedEmail(null);
            await fetchUserProfile(newSession.access_token, newSession.user);
          } else {
            setUnverifiedEmail(newSession.user.email || null);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setSupabaseUser(null);
        setUser(null);
        setUnverifiedEmail(null);
        setApiAccessToken(null);
        lastLoadedTokenRef.current = null;
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchUserProfile]);

  /**
   * Login with email and password via Supabase Auth
   */
  const login = async (email: string, password: string) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.user) {
        return { success: false, error: 'Sign in failed. Please try again.' };
      }

      const isVerified = Boolean(
        data.user.email_confirmed_at || (data.user as any).confirmed_at
      );

      setSupabaseUser(data.user);
      setSession(data.session);

      if (!isVerified) {
        setUnverifiedEmail(cleanEmail);
        return { success: true, requiresVerification: true };
      }

      setUnverifiedEmail(null);
      setInactivityExpired(false);
      if (data.session) {
        await fetchUserProfile(data.session.access_token, data.user);
      }

      return { success: true, requiresVerification: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      return { success: false, error: msg };
    }
  };

  /**
   * Register a new account with mandatory Full Name, Email, Password, Confirm Password & Date of Birth
   */
  const register = async (params: RegisterParams): Promise<RegisterResult> => {
    const { fullName, familyName, email, password, confirmPassword, dateOfBirth, preferredLang } = params;

    // 1. Mandatory fields validation
    if (!fullName?.trim()) {
      return { success: false, requiresVerification: false, error: 'Full name is required.' };
    }
    if (!familyName?.trim()) {
      return { success: false, requiresVerification: false, error: 'Family name is required.' };
    }
    if (!email?.trim()) {
      return { success: false, requiresVerification: false, error: 'Email address is required.' };
    }
    if (!password) {
      return { success: false, requiresVerification: false, error: 'Password is required.' };
    }
    if (password.length < 8) {
      return { success: false, requiresVerification: false, error: 'Password must be at least 8 characters long.' };
    }
    if (password !== confirmPassword) {
      return { success: false, requiresVerification: false, error: 'Passwords do not match.' };
    }

    // 2. Date of birth validation & normalization
    const dobValidation = validateDateOfBirth(dateOfBirth);
    if (!dobValidation.valid || !dobValidation.normalized) {
      return { success: false, requiresVerification: false, error: dobValidation.error || 'Invalid date of birth.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    const cleanFamilyName = familyName.trim();
    const normalizedDob = dobValidation.normalized;

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
            fullName: cleanName,
            family_name: cleanFamilyName,
            familyName: cleanFamilyName,
            date_of_birth: normalizedDob,
            dateOfBirth: normalizedDob,
            preferredLang: preferredLang || 'ml',
          },
        },
      });

      // Detect duplicate email across all Supabase configurations:
      // 1. Account enumeration protection enabled: Supabase returns user object with identities: []
      // 2. Account enumeration protection disabled: Supabase returns error "User already registered" or code 'user_already_exists'
      const isDuplicate = Boolean(
        (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) ||
        (error && (
          /already registered|already in use|user already exists/i.test(error.message) ||
          (error as any).code === 'user_already_exists'
        ))
      );

      if (isDuplicate) {
        return {
          success: false,
          requiresVerification: false,
          isDuplicateEmail: true,
          error: 'Email already in use. Please sign in or use a different email address.',
        };
      }

      if (error) {
        const errorMsg =
          error.message?.toLowerCase().includes('network') || error.message?.toLowerCase().includes('fetch')
            ? 'Unable to connect to authentication service. Please check your connection and try again.'
            : error.message?.toLowerCase().includes('rate limit')
            ? 'Too many attempts. Please wait a few moments and try again.'
            : error.message;

        return {
          success: false,
          requiresVerification: false,
          isDuplicateEmail: false,
          error: errorMsg,
        };
      }

      setUnverifiedEmail(cleanEmail);
      if (data?.user) {
        setSupabaseUser(data.user);
      }

      return {
        success: true,
        requiresVerification: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      const isDuplicate = /already registered|already in use|user already exists/i.test(msg);
      return {
        success: false,
        requiresVerification: false,
        isDuplicateEmail: isDuplicate,
        error: isDuplicate
          ? 'Email already in use. Please sign in or use a different email address.'
          : msg,
      };
    }
  };

  /**
   * Verify 6-digit signup OTP via official Supabase Auth client
   */
  const verifySignupOtp = async (otp: string, emailOverride?: string) => {
    const cleanOtp = otp.trim();
    const targetEmail = (emailOverride || unverifiedEmail || supabaseUser?.email)?.trim().toLowerCase();

    if (!cleanOtp || (cleanOtp.length !== 6 && cleanOtp.length !== 8) || !/^\d{6,8}$/.test(cleanOtp)) {
      return { success: false, error: 'Please enter a valid verification code.' };
    }

    if (!targetEmail) {
      return { success: false, error: 'Email address not found. Please restart registration.' };
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: targetEmail,
        token: cleanOtp,
        type: 'signup',
      });

      if (error) {
        let friendlyError = error.message;
        const lower = error.message.toLowerCase();
        if (lower.includes('expired') || lower.includes('otp expired')) {
          friendlyError = 'Verification code has expired. Please request a new code.';
        } else if (lower.includes('invalid') || lower.includes('token has expired or is invalid') || lower.includes('token is invalid')) {
          friendlyError = 'Invalid verification code. Please check your email and try again.';
        } else if (lower.includes('rate limit') || lower.includes('too many requests')) {
          friendlyError = 'Too many attempts. Please wait before trying again.';
        }
        return { success: false, error: friendlyError };
      }

      if (!data?.user) {
        return { success: false, error: 'Verification failed. Please try again.' };
      }

      setSupabaseUser(data.user);
      setUnverifiedEmail(null);
      setInactivityExpired(false);

      if (data.session) {
        setSession(data.session);
        setApiAccessToken(data.session.access_token);
        await fetchUserProfile(data.session.access_token, data.user);
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to verify code.';
      return { success: false, error: msg };
    }
  };

  /**
   * Resend verification OTP code with safe rate limiting
   */
  const resendVerificationOtp = async (targetEmail?: string) => {
    const emailToSend = (targetEmail || unverifiedEmail || supabaseUser?.email)?.trim().toLowerCase();
    if (!emailToSend) {
      return { success: false, message: 'No email address available for verification.' };
    }

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: emailToSend,
      });

      if (error) {
        const lower = error.message.toLowerCase();
        let friendly = error.message;
        if (lower.includes('rate limit') || lower.includes('too many requests')) {
          friendly = 'Too many resend attempts. Please wait a minute before requesting another code.';
        }
        return { success: false, message: friendly };
      }

      return {
        success: true,
        message: 'A fresh 6-digit verification code has been sent to your email.',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend verification code.';
      return { success: false, message: msg };
    }
  };

  const resendVerificationEmail = resendVerificationOtp;

  /**
   * Password recovery foundation (Phase 1 & Phase 3 OTP)
   */
  const requestPasswordReset = async (email: string) => {
    if (!email || !email.trim()) {
      return { success: false, message: 'Please enter your account email.' };
    }

    try {
      const cleanEmail = email.trim().toLowerCase();
      const redirectUrl =
        typeof window !== 'undefined'
          ? window.location.origin
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl,
      });

      if (error) {
        const lower = error.message.toLowerCase();
        let friendly = error.message;
        if (lower.includes('rate limit') || lower.includes('too many requests')) {
          friendly = 'Too many attempts. Please wait before requesting another recovery code.';
        }
        return { success: false, message: friendly };
      }

      // Generic success message to avoid account enumeration
      return {
        success: true,
        message: "If an account exists with this email, a password recovery code has been sent.",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Password reset request failed.';
      return { success: false, message: msg };
    }
  };

  /**
   * Verify 6-digit or 8-digit password recovery OTP via official Supabase Auth client
   */
  const verifyRecoveryOtp = async (otp: string, email: string) => {
    const cleanOtp = otp.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanOtp || (cleanOtp.length !== 6 && cleanOtp.length !== 8) || !/^\d+$/.test(cleanOtp)) {
      return { success: false, error: 'Please enter a valid recovery verification code.' };
    }

    if (!cleanEmail) {
      return { success: false, error: 'Recovery email address is missing. Please restart recovery.' };
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanOtp,
        type: 'recovery',
      });

      if (error) {
        let friendlyError = error.message;
        const lower = error.message.toLowerCase();
        if (lower.includes('expired') || lower.includes('otp expired')) {
          friendlyError = 'Recovery code has expired. Please request a new code.';
        } else if (
          lower.includes('invalid') ||
          lower.includes('token has expired or is invalid') ||
          lower.includes('token is invalid')
        ) {
          friendlyError = 'Invalid recovery code. Please check your email and try again.';
        } else if (lower.includes('rate limit') || lower.includes('too many requests')) {
          friendlyError = 'Too many attempts. Please wait before trying again.';
        }
        return { success: false, error: friendlyError };
      }

      if (!data?.session || !data?.user) {
        return { success: false, error: 'Recovery verification failed. Please try again.' };
      }

      // Establish authenticated recovery session
      setSession(data.session);
      setSupabaseUser(data.user);
      setIsRecoveryFlow(true);
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem('kudumba_recovery_active', 'true');
        } catch {}
      }
      if (data.session.access_token) {
        setApiAccessToken(data.session.access_token);
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to verify recovery code.';
      return { success: false, error: msg };
    }
  };

  /**
   * Resend password recovery OTP code with safe rate limiting
   */
  const resendRecoveryOtp = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, message: 'No email address available for recovery.' };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);

      if (error) {
        const lower = error.message.toLowerCase();
        let friendly = error.message;
        if (lower.includes('rate limit') || lower.includes('too many requests')) {
          friendly = 'Too many resend attempts. Please wait a minute before requesting another code.';
        }
        return { success: false, message: friendly };
      }

      return {
        success: true,
        message: 'A fresh recovery code has been sent to your email.',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend recovery code.';
      return { success: false, message: msg };
    }
  };

  /**
   * Phase 3: Step 2 Date of birth verification during password recovery
   */
  const verifyRecoveryDob = async (dob: string) => {
    try {
      const res = await apiVerifyRecoveryDob(dob);
      return {
        success: true,
        resetAuthorizationToken: res.resetAuthorizationToken,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid date of birth provided.';
      return { success: false, error: msg };
    }
  };

  /**
   * Phase 3: Step 3 Secure password reset completion
   */
  const completePasswordReset = async (
    resetToken: string,
    newPassword: string,
    confirmPassword?: string
  ) => {
    try {
      await apiResetPassword({
        resetAuthorizationToken: resetToken,
        newPassword,
        confirmPassword,
      });

      // Revoke and clear local recovery session after successful reset
      await supabase.auth.signOut().catch(() => {});
      setSession(null);
      setSupabaseUser(null);
      setUser(null);
      setApiAccessToken(null);
      setIsRecoveryFlow(false);

      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.removeItem('kudumba_recovery_active');
        } catch {}
        if (window.location.hash.includes('type=recovery')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password.';
      return { success: false, error: msg };
    }
  };

  /**
   * Cancel or back out of password recovery flow immediately:
   * Revokes the intermediate Supabase session, resets state, and clears storage
   * so the user cannot bypass DOB or enter the vault without full authentication.
   */
  const cancelRecoveryFlow = async () => {
    try {
      await supabase.auth.signOut().catch(() => {});
    } finally {
      setSession(null);
      setSupabaseUser(null);
      setUser(null);
      setUnverifiedEmail(null);
      setApiAccessToken(null);
      setIsRecoveryFlow(false);

      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.removeItem('kudumba_recovery_active');
        } catch {}
        if (window.location.hash.includes('type=recovery')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    }
  };

  /**
   * Logout through Supabase Auth and server session
   */
  const logout = async () => {
    if (isSigningOutRef.current) return;
    isSigningOutRef.current = true;
    try {
      lastLoadedTokenRef.current = null;
      await supabase.auth.signOut().catch(() => {});
      await apiLogout().catch(() => {});
    } finally {
      setSession(null);
      setSupabaseUser(null);
      setUser(null);
      setUnverifiedEmail(null);
      setApiAccessToken(null);
      setIsRecoveryFlow(false);
      isSigningOutRef.current = false;
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.removeItem('kudumba_recovery_active');
        } catch {}
      }
    }
  };

  const refreshProfile = async () => {
    if (session?.access_token && supabaseUser) {
      await fetchUserProfile(session.access_token, supabaseUser, true);
    }
  };

  const isEmailVerified = Boolean(
    supabaseUser?.email_confirmed_at || (supabaseUser as any)?.confirmed_at
  );

  const value = {
    user,
    supabaseUser,
    session,
    isLoading,
    isAuthenticated: Boolean(supabaseUser && isEmailVerified && !inactivityExpired && !isRecoveryFlow),
    isEmailVerified,
    unverifiedEmail,
    inactivityExpired,
    isRecoveryFlow,
    isAuthModalOpen,
    authModalMode,
    authPromptMessage,
    setIsRecoveryFlow,
    cancelRecoveryFlow,
    clearInactivityExpired,
    openAuthModal,
    closeAuthModal,
    executeGuardedAction,
    handleAuthSuccess,
    login,
    register,
    logout,
    verifySignupOtp,
    resendVerificationEmail,
    resendVerificationOtp,
    requestPasswordReset,
    verifyRecoveryOtp,
    resendRecoveryOtp,
    verifyRecoveryDob,
    completePasswordReset,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
