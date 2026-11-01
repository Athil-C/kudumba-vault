import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Mail,
  User,
  Home,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  KeyRound,
  Clock,
} from 'lucide-react';
import { Button } from '../ui/DesignSystem';
import { useAuth } from '../../context/AuthContext';
import { SafeUser, apiCheckTrialEligibility } from '../../services/apiClient';
import { validateDateOfBirth } from '../../utils/dobValidation';
import { maskEmail } from '../../utils/maskEmail';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: SafeUser) => void;
  lang: 'ml' | 'en';
  initialMode?:
    | 'login'
    | 'register'
    | 'verify-email'
    | 'forgot-password'
    | 'reset-password-otp'
    | 'reset-password-dob'
    | 'reset-password-new';
  promptMessage?: string | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  lang,
  initialMode = 'login',
  promptMessage,
}) => {
  const {
    login,
    register,
    verifySignupOtp,
    resendVerificationEmail,
    resendVerificationOtp,
    requestPasswordReset,
    verifyRecoveryOtp,
    resendRecoveryOtp,
    verifyRecoveryDob,
    completePasswordReset,
    cancelRecoveryFlow,
    user,
    inactivityExpired,
  } = useAuth();

  const [mode, setMode] = useState<
    | 'login'
    | 'register'
    | 'verify-email'
    | 'forgot-password'
    | 'reset-password-otp'
    | 'reset-password-dob'
    | 'reset-password-new'
  >(initialMode);
  const [fullName, setFullName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetAuthToken, setResetAuthToken] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Email duplicate state & debounced checking
  const [isEmailDuplicate, setIsEmailDuplicate] = useState(false);
  const [hasUsedTrial, setHasUsedTrial] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const knownDuplicatesRef = React.useRef<Set<string>>(new Set());

  // Resend cooldown timer
  const [resendCooldown, setResendCooldown] = useState(0);

  // Signup OTP verification state
  const [otpLength, setOtpLength] = useState<6 | 8>(6);
  const [otp, setOtp] = useState<string[]>(() => Array(6).fill(''));
  const otpInputRefs = React.useRef<(HTMLInputElement | null)[]>([]);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Recovery email & adaptive OTP verification state (defaults to 8 digits to match Supabase config, supports 6 or 8)
  const [recoveryOtpLength, setRecoveryOtpLength] = useState<6 | 8>(8);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryOtp, setRecoveryOtp] = useState<string[]>(() => Array(8).fill(''));
  const recoveryOtpInputRefs = React.useRef<(HTMLInputElement | null)[]>([]);
  const [isVerifyingRecoveryOtp, setIsVerifyingRecoveryOtp] = useState(false);
  const [recoveryOtpError, setRecoveryOtpError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'verify-email') {
      setOtp(Array(otpLength).fill(''));
      setOtpError(null);
      const timer = setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
      return () => clearTimeout(timer);
    } else if (mode === 'reset-password-otp') {
      setRecoveryOtp(Array(recoveryOtpLength).fill(''));
      setRecoveryOtpError(null);
      const timer = setTimeout(() => {
        recoveryOtpInputRefs.current[0]?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [mode, otpLength, recoveryOtpLength]);

  /**
   * Dedicated Password Recovery Trigger:
   * If a valid email is already entered in Sign In, reuse it internally and request recovery OTP immediately.
   * If no valid email is entered, prompt the user on the recovery email entry screen.
   */
  const handleForgotPasswordClick = async () => {
    setError(null);
    setSuccessNotice(null);
    const clean = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (clean && emailRegex.test(clean)) {
      setRecoveryEmail(clean);
      setIsLoading(true);
      try {
        await requestPasswordReset(clean);
        setRecoveryOtp(Array(recoveryOtpLength).fill(''));
        setRecoveryOtpError(null);
        setResendCooldown(60);
        setMode('reset-password-otp');
      } finally {
        setIsLoading(false);
      }
    } else {
      setMode('forgot-password');
    }
  };

  const handleRecoveryOtpChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const newOtp = [...recoveryOtp];
      newOtp[index] = '';
      setRecoveryOtp(newOtp);
      return;
    }

    if (cleaned.length > 1) {
      handleRecoveryOtpPaste(index, cleaned);
      return;
    }

    const newOtp = [...recoveryOtp];
    newOtp[index] = cleaned[0];
    setRecoveryOtp(newOtp);
    setRecoveryOtpError(null);

    if (index < recoveryOtpLength - 1 && cleaned[0]) {
      recoveryOtpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleRecoveryOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!recoveryOtp[index] && index > 0) {
        recoveryOtpInputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      recoveryOtpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < recoveryOtpLength - 1) {
      recoveryOtpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleRecoveryOtpPaste = (startIndex: number, pasteData: string) => {
    const digits = pasteData.replace(/\D/g, '');
    if (!digits) return;

    // Resilient auto-detection: adapt length to 8 or 6 based on pasted content
    const targetLen: 6 | 8 = digits.length >= 8 ? 8 : (digits.length === 6 ? 6 : recoveryOtpLength);
    if (targetLen !== recoveryOtpLength) {
      setRecoveryOtpLength(targetLen);
    }

    const sliced = digits.slice(0, targetLen);
    const newOtp = Array(targetLen).fill('');
    for (let i = 0; i < sliced.length; i++) {
      newOtp[i] = sliced[i];
    }
    setRecoveryOtp(newOtp);
    setRecoveryOtpError(null);

    const nextIndex = Math.min(sliced.length, targetLen - 1);
    recoveryOtpInputRefs.current[nextIndex]?.focus();
  };

  const handleRecoveryOtpPasteEvent = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    handleRecoveryOtpPaste(0, pasteData);
  };

  const handleVerifyRecoveryOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const otpCode = recoveryOtp.join('');
    if (otpCode.length < recoveryOtpLength) {
      setRecoveryOtpError(
        lang === 'ml'
          ? `${recoveryOtpLength} അക്ക കോഡ് പൂർണ്ണമായി നൽകുക.`
          : `Please enter the complete ${recoveryOtpLength}-digit recovery code.`
      );
      return;
    }

    setIsVerifyingRecoveryOtp(true);
    setRecoveryOtpError(null);

    try {
      const res = await verifyRecoveryOtp(otpCode, recoveryEmail);
      if (!res.success) {
        setRecoveryOtpError(
          res.error || (lang === 'ml' ? 'കോഡ് അസാധുവാണ്.' : 'Invalid recovery code.')
        );
        return;
      }

      // Step 1 Success: Proceed to Step 2 Date of Birth Verification
      setMode('reset-password-dob');
      setDateOfBirth('');
      setSuccessNotice(
        lang === 'ml'
          ? 'റിക്കവറി കോഡ് സ്ഥിരീകരിച്ചു! നിങ്ങളുടെ രജിസ്റ്റർ ചെയ്ത ജനനത്തീയതി നൽകുക.'
          : 'Recovery code verified! Please confirm your registered date of birth.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Recovery verification failed.';
      setRecoveryOtpError(msg);
    } finally {
      setIsVerifyingRecoveryOtp(false);
    }
  };

  const handleResendRecoveryOtp = async () => {
    if (resendCooldown > 0 || isLoading || isVerifyingRecoveryOtp) return;
    setIsLoading(true);
    setRecoveryOtpError(null);
    setError(null);
    setSuccessNotice(null);

    try {
      const res = await resendRecoveryOtp(recoveryEmail);
      if (!res.success) {
        setRecoveryOtpError(
          lang === 'ml'
            ? 'കോഡ് അയക്കാൻ കഴിഞ്ഞില്ല: ' + res.message
            : res.message
        );
        return;
      }

      setSuccessNotice(
        lang === 'ml'
          ? `പുതിയ ${recoveryOtpLength} അക്ക റിക്കവറി കോഡ് നിങ്ങളുടെ ഇമെയിലിലേക്ക് അയച്ചിട്ടുണ്ട്.`
          : `A new ${recoveryOtpLength}-digit recovery code has been sent to your email.`
      );
      setResendCooldown(60);
      setRecoveryOtp(Array(recoveryOtpLength).fill(''));
      recoveryOtpInputRefs.current[0]?.focus();
    } catch {
      setRecoveryOtpError(
        lang === 'ml'
          ? 'ഇമെയിൽ അയക്കാൻ കഴിഞ്ഞില്ല.'
          : 'Failed to resend recovery code.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Secure Mode Switcher:
   * Enforces zero cross-form prefill and sensitive state clearance:
   * 1. Registration passwords and login passwords are NEVER carried across modes.
   * 2. Switching to 'login' leaves email and password completely empty (no auto-fill, no auto-submit).
   * 3. Switching to 'forgot-password' leaves recovery email completely empty (requires manual entry).
   * 4. Clear duplicate-email alerts, error messages, and checking state when navigating away from registration.
   */
  const switchMode = (newMode: typeof mode) => {
    // 1. Always wipe passwords and password visibility toggles on ANY mode switch
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);

    // 2. Clear transient duplicate states and error messages
    setIsEmailDuplicate(false);
    setIsCheckingEmail(false);
    setError(null);
    setSuccessNotice(null);

    // 3. Clear email field when navigating to login, forgot-password, or register
    // Requirement 2: Do not copy the email from registration into the login form. Leave email empty.
    // Requirement 3: Do not automatically populate the recovery email field. Require manual entry.
    if (newMode === 'login' || newMode === 'forgot-password' || newMode === 'register') {
      setEmail('');
    }

    // If abandoning or switching away from an incomplete recovery flow, revoke intermediate session
    if (
      (mode.startsWith('reset-password-') || mode === 'forgot-password') &&
      !newMode.startsWith('reset-password-')
    ) {
      cancelRecoveryFlow().catch(() => {});
    }

    setMode(newMode);
  };

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setIsEmailDuplicate(false);
    setIsCheckingEmail(false);
    setError(null);
    setSuccessNotice(null);
  }, [initialMode, isOpen]);

  // Debounced email availability check when typing in register mode
  useEffect(() => {
    if (mode !== 'register') {
      setIsCheckingEmail(false);
      return;
    }

    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Reset duplicate state and indicator if email is empty or invalid
    if (!trimmed || !emailRegex.test(trimmed)) {
      setIsCheckingEmail(false);
      setIsEmailDuplicate(false);
      setHasUsedTrial(false);
      return;
    }

    // Set checking state after user enters a syntactically valid email and pauses typing (500ms)
    setIsCheckingEmail(true);
    const timer = setTimeout(async () => {
      setIsCheckingEmail(false);
      if (knownDuplicatesRef.current.has(trimmed)) {
        setIsEmailDuplicate(true);
      }
      try {
        const eligibility = await apiCheckTrialEligibility(trimmed);
        if (eligibility.hasUsedTrial) {
          setHasUsedTrial(true);
        } else {
          setHasUsedTrial(false);
        }
      } catch (e) {
        // Silent network fallback
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      setIsCheckingEmail(false);
    };
  }, [email, mode]);

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (isEmailDuplicate) {
      setIsEmailDuplicate(false);
    }
    if (error && (error.toLowerCase().includes('email') || error.includes('ഇമെയിൽ'))) {
      setError(null);
    }
  };

  useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  if (!isOpen) return null;

  // Maximum allowed date is today's date in YYYY-MM-DD
  const todayStr = new Date().toISOString().slice(0, 10);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    // 1. Forgot password flow
    if (mode === 'forgot-password') {
      const clean = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!clean || !emailRegex.test(clean)) {
        setError(lang === 'ml' ? 'ശരിയായ ഇമെയിൽ നൽകുക.' : 'Please provide a valid account email.');
        return;
      }
      setIsLoading(true);
      try {
        setRecoveryEmail(clean);
        await requestPasswordReset(clean);
        setRecoveryOtp(Array(recoveryOtpLength).fill(''));
        setRecoveryOtpError(null);
        setResendCooldown(60);
        setMode('reset-password-otp');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Phase 3: Step 2 Date of Birth Verification during Password Recovery
    if (mode === 'reset-password-dob') {
      if (!dateOfBirth) {
        setError(lang === 'ml' ? 'ജനനത്തീയതി തിരഞ്ഞെടുക്കുക.' : 'Please select your date of birth.');
        return;
      }
      const dobCheck = validateDateOfBirth(dateOfBirth);
      if (!dobCheck.valid) {
        setError(dobCheck.error || (lang === 'ml' ? 'അസാധുവായ ജനനത്തീയതി.' : 'Invalid date of birth.'));
        return;
      }

      setIsLoading(true);
      try {
        const res = await verifyRecoveryDob(dateOfBirth);
        if (!res.success || !res.resetAuthorizationToken) {
          setError(
            res.error ||
              (lang === 'ml'
                ? 'ജനനത്തീയതി പൊരുത്തപ്പെടുന്നില്ല. വീണ്ടും ശ്രമിക്കുക.'
                : 'Invalid date of birth provided.')
          );
          return;
        }

        setResetAuthToken(res.resetAuthorizationToken);
        setMode('reset-password-new');
        setPassword('');
        setConfirmPassword('');
        setSuccessNotice(
          lang === 'ml'
            ? 'ജനനത്തീയതി സ്ഥിരീകരിച്ചു. പുതിയ പാസ്‌വേഡ് നൽകുക.'
            : 'Date of birth verified. Please enter your new password.'
        );
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Phase 3: Step 3 Password Reset Completion
    if (mode === 'reset-password-new') {
      if (!password || password.length < 8) {
        setError(lang === 'ml' ? 'പാസ്‌വേഡിന് കുറഞ്ഞത് 8 അക്ഷരങ്ങൾ വേണം.' : 'Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError(lang === 'ml' ? 'പാസ്‌വേഡുകൾ പൊരുത്തപ്പെടുന്നില്ല.' : 'Passwords do not match.');
        return;
      }
      if (!resetAuthToken) {
        setError(
          lang === 'ml'
            ? 'റീസെറ്റ് ടോക്കൺ ലഭ്യമല്ല. ദയവായി വീണ്ടും ജനനത്തീയതി പരിശോധിക്കുക.'
            : 'Missing reset authorization token. Please verify date of birth again.'
        );
        setMode('reset-password-dob');
        return;
      }

      setIsLoading(true);
      try {
        const res = await completePasswordReset(resetAuthToken, password, confirmPassword);
        if (!res.success) {
          setError(
            res.error ||
              (lang === 'ml'
                ? 'പാസ്‌വേഡ് മാറ്റാൻ കഴിഞ്ഞില്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക.'
                : 'Failed to update password. Please try again.')
          );
          return;
        }

        setSuccessNotice(
          lang === 'ml'
            ? 'പാസ്‌വേഡ് വിജയകരമായി അപ്‌ഡേറ്റ് ചെയ്തു! പുതിയ പാസ്‌വേഡ് ഉപയോഗിച്ച് ലോഗിൻ ചെയ്യുക.'
            : 'Password successfully updated! Please sign in with your new password.'
        );
        setResetAuthToken(null);
        setPassword('');
        setConfirmPassword('');
        setEmail('');
        setMode('login');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // 2. Login flow
    if (mode === 'login') {
      if (!email.trim() || !password) {
        setError(lang === 'ml' ? 'ഇമെയിലും പാസ്‌വേഡും നൽകുക.' : 'Please enter your email and password.');
        return;
      }

      setIsLoading(true);
      try {
        const res = await login(email, password);
        if (!res.success) {
          setError(
            lang === 'ml'
              ? 'ഇമെയിലോ പാസ്‌വേഡോ തെറ്റാണ്. ദയവായി വീണ്ടും ശ്രമിക്കുക.'
              : res.error || 'Invalid email or password. Please try again.'
          );
          return;
        }

        setPassword('');
        setConfirmPassword('');

        if (res.requiresVerification) {
          setMode('verify-email');
          return;
        }

        onSuccess((user || { email: cleanEmail }) as SafeUser);
        handleClose();
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // 3. Register flow
    if (mode === 'register') {
      if (isEmailDuplicate) {
        return;
      }
      if (!fullName.trim()) {
        setError(lang === 'ml' ? 'പൂർണ്ണമായ പേര് നൽകുക.' : 'Please enter your full name.');
        return;
      }
      if (!familyName.trim()) {
        setError(lang === 'ml' ? 'കുടുംബപ്പേര് നൽകുക.' : 'Please enter your family name.');
        return;
      }
      if (!email.trim()) {
        setError(lang === 'ml' ? 'ഇമെയിൽ വിലാസം നൽകുക.' : 'Please enter your email address.');
        return;
      }
      if (!dateOfBirth) {
        setError(lang === 'ml' ? 'ജനനത്തീയതി തിരഞ്ഞെടുക്കുക.' : 'Please select your date of birth.');
        return;
      }

      const dobCheck = validateDateOfBirth(dateOfBirth);
      if (!dobCheck.valid) {
        setError(dobCheck.error || (lang === 'ml' ? 'അസാധുവായ ജനനത്തീയതി.' : 'Invalid date of birth.'));
        return;
      }

      if (password.length < 8) {
        setError(lang === 'ml' ? 'പാസ്‌വേഡിന് കുറഞ്ഞത് 8 അക്ഷരങ്ങൾ വേണം.' : 'Password must be at least 8 characters long.');
        return;
      }

      if (password !== confirmPassword) {
        setError(lang === 'ml' ? 'പാസ്‌വേഡുകൾ പൊരുത്തപ്പെടുന്നില്ല.' : 'Passwords do not match.');
        return;
      }

      setIsLoading(true);
      try {
        const res = await register({
          fullName,
          familyName,
          email,
          password,
          confirmPassword,
          dateOfBirth,
          preferredLang: lang,
        });

        if (!res.success) {
          if (res.isDuplicateEmail) {
            const clean = email.trim().toLowerCase();
            knownDuplicatesRef.current.add(clean);
            setIsEmailDuplicate(true);
            setError(null);
          } else {
            setError(
              lang === 'ml'
                ? 'രജിസ്ട്രേഷൻ പരാജയപ്പെട്ടു: ' + (res.error || '')
                : res.error || 'Registration failed. Please try again.'
            );
          }
          return;
        }

        // Wipe passwords before entering verification view
        setPassword('');
        setConfirmPassword('');
        // Switch to mandatory verification view
        setMode('verify-email');
        setResendCooldown(60);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const newOtp = [...otp];
      newOtp[index] = '';
      setOtp(newOtp);
      return;
    }

    if (cleaned.length > 1) {
      handleOtpPaste(index, cleaned);
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = cleaned[0];
    setOtp(newOtp);
    setOtpError(null);

    if (index < otpLength - 1 && cleaned[0]) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        otpInputRefs.current[index - 1]?.focus();
      } else {
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < otpLength - 1) {
      e.preventDefault();
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (startIndex: number, pastedText: string) => {
    const digits = pastedText.replace(/\D/g, '');
    if (!digits) return;

    // Resilient auto-detection: if pasted code is 8 digits, adapt length automatically
    const targetLen: 6 | 8 = digits.length >= 8 ? 8 : 6;
    if (targetLen !== otpLength) {
      setOtpLength(targetLen);
    }

    const sliced = digits.slice(0, targetLen);
    const newOtp = Array(targetLen).fill('');
    for (let i = 0; i < sliced.length; i++) {
      newOtp[i] = sliced[i];
    }
    setOtp(newOtp);
    setOtpError(null);

    const nextFocusIndex = Math.min(sliced.length, targetLen - 1);
    otpInputRefs.current[nextFocusIndex]?.focus();
  };

  const handleOtpPasteEvent = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    handleOtpPaste(0, pasted);
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isVerifyingOtp) return; // Prevent duplicate submissions

    const code = otp.join('');
    if (code.length !== otpLength || !/^\d+$/.test(code)) {
      setOtpError(
        lang === 'ml'
          ? `ദയവായി ${otpLength} അക്ക സ്ഥിരീകരണ കോഡ് നൽകുക.`
          : `Please enter all ${otpLength} digits of your verification code.`
      );
      return;
    }

    setIsVerifyingOtp(true);
    setOtpError(null);
    setError(null);

    try {
      const res = await verifySignupOtp(code, email);
      if (!res.success) {
        setOtpError(
          lang === 'ml'
            ? res.error?.includes('expired')
              ? 'കോഡിന്റെ കാലാവധി കഴിഞ്ഞു. പുതിയ കോഡ് ആവശ്യപ്പെടുക.'
              : res.error?.includes('rate limit') || res.error?.includes('Too many')
              ? 'വളരെ കൂടുതൽ ശ്രമങ്ങൾ. അല്പം കഴിഞ്ഞ് ശ്രമിക്കുക.'
              : 'അസാധുവായ സ്ഥിരീകരണ കോഡ്. ദയവായി ഇമെയിൽ പരിശോധിച്ച് വീണ്ടും ശ്രമിക്കുക.'
            : res.error || 'Invalid verification code. Please check your email and try again.'
        );
        return;
      }

      setSuccessNotice(
        lang === 'ml'
          ? 'ഇമെയിൽ വിജയകരമായി സ്ഥിരീകരിച്ചു! നിങ്ങളുടെ വോൾട്ട് തയ്യാറാണ്.'
          : 'Email verified successfully! Your vault is ready.'
      );

      onSuccess((user || { email: email.trim() }) as SafeUser);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed.';
      setOtpError(msg);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isLoading || isVerifyingOtp) return;
    setIsLoading(true);
    setOtpError(null);
    setError(null);
    setSuccessNotice(null);

    try {
      const res = await resendVerificationOtp(email);
      if (!res.success) {
        setOtpError(
          lang === 'ml'
            ? 'കോഡ് അയക്കാൻ കഴിഞ്ഞില്ല: ' + res.message
            : res.message
        );
        return;
      }

      setSuccessNotice(
        lang === 'ml'
          ? `പുതിയ ${otpLength} അക്ക കോഡ് നിങ്ങളുടെ ഇമെയിലിലേക്ക് അയച്ചിട്ടുണ്ട്.`
          : `A new ${otpLength}-digit verification code has been sent to your email.`
      );
      setResendCooldown(60);
      setOtp(Array(otpLength).fill(''));
      otpInputRefs.current[0]?.focus();
    } catch {
      setOtpError(
        lang === 'ml'
          ? 'ഇമെയിൽ അയക്കാൻ കഴിഞ്ഞില്ല.'
          : 'Failed to resend verification code.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    // If user closes modal while in recovery flow, revoke session immediately
    if (mode.startsWith('reset-password-') || mode === 'forgot-password') {
      cancelRecoveryFlow().catch(() => {});
    }
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setIsEmailDuplicate(false);
    setIsCheckingEmail(false);
    setError(null);
    setSuccessNotice(null);
    onClose();
  };

  const handleChangeEmail = () => {
    switchMode('register');
    setOtp(Array(otpLength).fill(''));
    setOtpError(null);
  };

  const handleResend = handleResendOtp;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-[#E6E8EC] max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full bg-[#F4F5F7] text-[#5B6168] hover:bg-[#E6E8EC] transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header Badge */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF5F5] border border-[#FEE2E2] text-[#E03A45]">
            {mode === 'verify-email' ? (
              <Mail className="h-6 w-6 stroke-[2.2]" />
            ) : mode === 'forgot-password' || mode === 'reset-password-otp' || mode === 'reset-password-dob' || mode === 'reset-password-new' ? (
              <KeyRound className="h-6 w-6 stroke-[2.2]" />
            ) : (
              <ShieldCheck className="h-6 w-6 stroke-[2.2]" />
            )}
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-[#0B0B0C] font-malayalam">
              {mode === 'login'
                ? lang === 'ml'
                  ? 'വോൾട്ടിലേക്ക് പ്രവേശിക്കുക'
                  : 'Sign in to Kudumba Vault'
                : mode === 'register'
                ? lang === 'ml'
                  ? 'പുതിയ കുടുംബ അക്കൗണ്ട്'
                  : 'Create Family Account'
                : mode === 'verify-email'
                ? lang === 'ml'
                  ? 'ഇമെയിൽ സ്ഥിരീകരിക്കുക'
                  : 'Verify Your Email'
                : mode === 'reset-password-otp'
                ? lang === 'ml'
                  ? 'ഇൻബോക്സ് പരിശോധിക്കുക'
                  : 'Check your email'
                : mode === 'reset-password-dob'
                ? lang === 'ml'
                  ? 'ഘട്ടം 2: ജനനത്തീയതി പരിശോധന'
                  : 'Step 2: Date of Birth Verification'
                : mode === 'reset-password-new'
                ? lang === 'ml'
                  ? 'പുതിയ പാസ്‌വേഡ് നൽകുക'
                  : 'Set New Password'
                : lang === 'ml'
                ? 'പാസ്‌വേഡ് വീണ്ടെടുക്കുക'
                : 'Reset Password'}
            </h2>
            <p className="text-[12px] text-[#5B6168] font-malayalam">
              {mode === 'verify-email'
                ? lang === 'ml'
                  ? 'സുരക്ഷിതമായ പ്രവേശനത്തിന് ഇമെയിൽ വേരിഫിക്കേഷൻ നിർബന്ധമാണ്'
                  : 'Mandatory verification for family document protection'
                : mode === 'reset-password-otp'
                ? lang === 'ml'
                  ? 'പാസ്‌വേഡ് മാറ്റാൻ 6 അക്ക കോഡ് നൽകുക'
                  : 'Enter the 6-digit recovery code to verify your identity'
                : mode === 'reset-password-dob'
                ? lang === 'ml'
                  ? 'പാസ്‌വേഡ് മാറ്റുന്നതിന് മുൻപ് അക്കൗണ്ടിലുള്ള ജനനത്തീയതി സ്ഥിരീകരിക്കുക'
                  : 'Confirm your registered date of birth before resetting password'
                : mode === 'reset-password-new'
                ? lang === 'ml'
                  ? 'നിങ്ങളുടെ കുടുംബ വോൾട്ടിനായി പുതിയ സുരക്ഷിത പാസ്‌വേഡ് നൽകുക'
                  : 'Choose a strong new password for your Kudumba Vault'
                : lang === 'ml'
                ? 'സുരക്ഷിത എൻക്രിപ്റ്റഡ് കുടുംബ രേഖകൾ'
                : 'Secure cloud storage for family records'}
            </p>
          </div>
        </div>

        {/* Mode Toggle Tabs (Only on Login/Register) */}
        {(mode === 'login' || mode === 'register') && (
          <div className="flex rounded-xl bg-[#F4F5F7] p-1 mb-5">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-all cursor-pointer font-malayalam ${
                mode === 'login'
                  ? 'bg-white text-[#0B0B0C] shadow-xs'
                  : 'text-[#5B6168] hover:text-[#0B0B0C]'
              }`}
            >
              {lang === 'ml' ? 'പ്രവേശിക്കുക (Sign In)' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-all cursor-pointer font-malayalam ${
                mode === 'register'
                  ? 'bg-white text-[#0B0B0C] shadow-xs'
                  : 'text-[#5B6168] hover:text-[#0B0B0C]'
              }`}
            >
              {lang === 'ml' ? 'പുതിയ അക്കൗണ്ട് (Register)' : 'Register'}
            </button>
          </div>
        )}

        {/* Mandatory Authentication Prompt Banner */}
        {promptMessage && (mode === 'login' || mode === 'register') && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#FEE2E2] bg-[#FFF5F5] p-3 text-[12.5px] text-[#E03A45]">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-[#E03A45]" />
            <div className="font-malayalam">
              <p className="font-semibold text-[#0B0B0C]">
                {lang === 'ml' ? 'തുടരുന്നതിന് ലോഗിൻ ചെയ്യുക' : 'Please sign in or create an account to continue.'}
              </p>
              {promptMessage !== 'Please sign in or create an account to continue.' && (
                <p className="text-[11.5px] text-[#5B6168] mt-0.5">
                  {promptMessage}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Inactivity Session Expiry Banner */}
        {inactivityExpired && mode === 'login' && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#FDE68A] bg-[#FEF3C7] p-3 text-[12.5px] text-[#92400E]">
            <Clock className="h-4 w-4 shrink-0 mt-0.5 text-[#B45309]" />
            <div className="font-malayalam">
              <p className="font-semibold">
                {lang === 'ml' ? 'സെഷൻ കാലഹരണപ്പെട്ടു (Session Expired)' : 'Session Expired'}
              </p>
              <p className="text-[11.5px] text-[#B45309] mt-0.5">
                {lang === 'ml'
                  ? '7 ദിവസത്തെ പ്രവർത്തനമില്ലായ്മ കാരണം നിങ്ങളുടെ സെഷൻ കാലഹരണപ്പെട്ടു. ദയവായി വീണ്ടും സൈൻ ഇൻ ചെയ്യുക.'
                  : 'Your session has expired due to 7 consecutive days of inactivity. Please sign in again to unlock your Kudumba Vault.'}
              </p>
            </div>
          </div>
        )}

        {/* Alerts */}
        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#FEE2E2] bg-[#FFF5F5] p-3 text-[12.5px] text-[#E03A45]">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="font-malayalam">{error}</span>
          </div>
        )}

        {successNotice && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#DCFCE7] bg-[#F0FDF4] p-3 text-[12.5px] text-[#16A34A]">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="font-malayalam">{successNotice}</span>
          </div>
        )}

        {/* VIEW 1 & 2: Login or Register Form */}
        {(mode === 'login' || mode === 'register') && (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="block text-[12px] font-medium text-[#5B6168] mb-1 font-malayalam">
                  {lang === 'ml' ? 'പൂർണ്ണമായ പേര് (Full Name) *' : 'Full Name *'}
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 h-4 w-4 text-[#8C939D]" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Sreedevi Menon"
                    className="w-full rounded-xl border border-[#E6E8EC] bg-white pl-10 pr-4 py-2 text-[13.5px] text-[#0B0B0C] placeholder-[#8C939D] focus:border-[#0B0B0C] focus:outline-hidden"
                  />
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="block text-[12px] font-medium text-[#5B6168] mb-1 font-malayalam">
                  {lang === 'ml' ? 'കുടുംബപ്പേര് (Family Name) *' : 'Family Name *'}
                </label>
                <div className="relative">
                  <Home className="absolute left-3.5 top-3 h-4 w-4 text-[#8C939D]" />
                  <input
                    type="text"
                    required
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    placeholder={lang === 'ml' ? 'ഉദാ. ചാലിൽ / മേനോൻ കുടുംബം' : 'e.g. Chalil / Menon Family'}
                    className="w-full rounded-xl border border-[#E6E8EC] bg-white pl-10 pr-4 py-2 text-[13.5px] text-[#0B0B0C] placeholder-[#8C939D] focus:border-[#0B0B0C] focus:outline-hidden"
                  />
                </div>
                <p className="mt-1 text-[11px] text-[#8C939D] font-malayalam">
                  {lang === 'ml'
                    ? 'ഇത് നിങ്ങളുടെ വോൾട്ടിന്റെ പ്രധാന പേരായി മുകളിൽ ദൃശ്യമാകും.'
                    : 'This will be displayed as your household vault brand name.'}
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[12px] font-medium text-[#5B6168] font-malayalam">
                  {lang === 'ml' ? 'ഇമെയിൽ വിലാസം (Email) *' : 'Email Address *'}
                </label>
                {mode === 'register' && isCheckingEmail && (
                  <span className="flex items-center gap-1 text-[11px] text-[#8C939D] font-malayalam animate-in fade-in">
                    <Loader2 className="h-3 w-3 animate-spin text-[#8C939D]" />
                    {lang === 'ml' ? 'പരിശോധിക്കുന്നു...' : 'Checking...'}
                  </span>
                )}
              </div>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-[#8C939D]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="name@example.com"
                  data-testid="auth-email-input"
                  aria-invalid={mode === 'register' && isEmailDuplicate}
                  aria-describedby={mode === 'register' && isEmailDuplicate ? 'register-email-duplicate-error' : undefined}
                  className={`w-full rounded-xl border bg-white pl-10 pr-4 py-2 text-[13.5px] text-[#0B0B0C] placeholder-[#8C939D] focus:outline-hidden transition-colors ${
                    mode === 'register' && isEmailDuplicate
                      ? 'border-[#E03A45] focus:border-[#E03A45]'
                      : 'border-[#E6E8EC] focus:border-[#0B0B0C]'
                  }`}
                />
                {mode === 'register' && isCheckingEmail && (
                  <div className="absolute right-3.5 top-3 text-[#8C939D]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </div>

              {/* Inline Already Consumed Trial Alert */}
              {mode === 'register' && hasUsedTrial && !isEmailDuplicate && (
                <div
                  role="alert"
                  data-testid="trial-consumed-alert"
                  className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[12px] leading-snug"
                >
                  <p className="font-medium">
                    {lang === 'ml'
                      ? 'ഈ ഇമെയിൽ വിലാസത്തിൽ സൗജന്യ ട്രയൽ ഇതിനകം ഉപയോഗിച്ചു കഴിഞ്ഞു. വോൾട്ട് ഉപയോഗിക്കുന്നത് തുടരാൻ ദയവായി '
                      : 'This email has already used its free trial. Please '}
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="font-bold underline underline-offset-2 hover:text-amber-950 cursor-pointer"
                    >
                      {lang === 'ml' ? 'സൈൻ ഇൻ' : 'sign in'}
                    </button>
                    {lang === 'ml' ? ' ചെയ്ത് പ്ലാൻ തിരഞ്ഞെടുക്കുക.' : ' and choose a plan to continue using your vault.'}
                  </p>
                </div>
              )}

              {/* Inline Duplicate Email Alert */}
              {mode === 'register' && isEmailDuplicate && (
                <p
                  id="register-email-duplicate-error"
                  role="alert"
                  data-testid="duplicate-email-alert"
                  className="mt-1.5 text-[12px] text-[#E03A45] font-malayalam leading-snug"
                >
                  {lang === 'ml' ? (
                    <>
                      ഈ ഇമെയിൽ വിലാസം ഇതിനകം ഉപയോഗത്തിലാണ്. ദയവായി{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('login')}
                        data-testid="duplicate-signin-btn"
                        className="font-semibold underline underline-offset-2 hover:text-[#991B1B] cursor-pointer"
                      >
                        സൈൻ ഇൻ
                      </button>{' '}
                      ചെയ്യുക അല്ലെങ്കിൽ മറ്റൊരു ഇമെയിൽ ഉപയോഗിക്കുക.
                    </>
                  ) : (
                    <>
                      Email already in use. Please{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('login')}
                        data-testid="duplicate-signin-btn"
                        className="font-semibold underline underline-offset-2 hover:text-[#991B1B] cursor-pointer"
                      >
                        sign in
                      </button>{' '}
                      or use a different email address.
                    </>
                  )}
                </p>
              )}
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-[12px] font-medium text-[#5B6168] mb-1 font-malayalam">
                  {lang === 'ml' ? 'ജനനത്തീയതി (Date of Birth) *' : 'Date of Birth *'}
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-3 h-4 w-4 text-[#8C939D]" />
                  <input
                    type="date"
                    required
                    max={todayStr}
                    min="1900-01-01"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full rounded-xl border border-[#E6E8EC] bg-white pl-10 pr-4 py-2 text-[13.5px] text-[#0B0B0C] focus:border-[#0B0B0C] focus:outline-hidden"
                  />
                </div>
                <p className="mt-1 text-[11px] text-[#8C939D] font-malayalam">
                  {lang === 'ml'
                    ? 'ഭാവി തീയതികൾ അനുവദനീയമല്ല. സുരക്ഷിതമായി സൂക്ഷിക്കുന്നു.'
                    : 'Used for secure profile identification. Non-future dates only.'}
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[12px] font-medium text-[#5B6168] font-malayalam">
                  {lang === 'ml' ? 'പാസ്‌വേഡ് (Password) *' : 'Password *'}
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={handleForgotPasswordClick}
                    className="text-[11.5px] text-[#E03A45] hover:underline cursor-pointer font-malayalam"
                  >
                    {lang === 'ml' ? 'പാസ്‌വേഡ് മറന്നോ?' : 'Forgot password?'}
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-[#8C939D]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  data-testid="auth-password-input"
                  className="w-full rounded-xl border border-[#E6E8EC] bg-white pl-10 pr-10 py-2 text-[13.5px] text-[#0B0B0C] placeholder-[#8C939D] focus:border-[#0B0B0C] focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-2.5 text-[#8C939D] hover:text-[#0B0B0C] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {mode === 'register' && (
                <p className="mt-1 text-[11px] text-[#8C939D] font-malayalam">
                  {lang === 'ml' ? 'കുറഞ്ഞത് 8 അക്ഷരങ്ങൾ വേണം' : 'Must be at least 8 characters long'}
                </p>
              )}
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-[12px] font-medium text-[#5B6168] mb-1 font-malayalam">
                  {lang === 'ml' ? 'പാസ്‌വേഡ് വീണ്ടും നൽകുക (Confirm Password) *' : 'Confirm Password *'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-[#8C939D]" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#E6E8EC] bg-white pl-10 pr-10 py-2 text-[13.5px] text-[#0B0B0C] placeholder-[#8C939D] focus:border-[#0B0B0C] focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-2.5 text-[#8C939D] hover:text-[#0B0B0C] cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-1 text-[11px] text-[#E03A45] font-malayalam">
                    {lang === 'ml' ? 'പാസ്‌വേഡുകൾ പൊരുത്തപ്പെടുന്നില്ല' : 'Passwords do not match'}
                  </p>
                )}
              </div>
            )}

            <Button
              type="submit"
              disabled={
                isLoading ||
                (mode === 'register' &&
                  (password !== confirmPassword || isEmailDuplicate || hasUsedTrial || isCheckingEmail))
              }
              className="w-full h-11 justify-center bg-[#E03A45] hover:bg-[#C42F3A] text-white rounded-xl font-semibold shadow-xs transition-all mt-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="flex items-center gap-2 font-malayalam">
                  {mode === 'login'
                    ? lang === 'ml'
                      ? 'പ്രവേശിക്കുക'
                      : 'Sign In'
                    : lang === 'ml'
                    ? 'രജിസ്റ്റർ ചെയ്യുക'
                    : 'Create Vault Account'}
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>
        )}

        {/* VIEW 3: Dedicated 6-Digit Email OTP Verification Screen */}
        {mode === 'verify-email' && (
          <form onSubmit={handleVerifyOtp} className="space-y-5 py-2">
            <div className="rounded-2xl border border-[#FEE2E2] bg-[#FFF5F5] p-4 text-center">
              <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFE4E6] text-[#E03A45]">
                <ShieldCheck className="h-6 w-6 stroke-[2.2]" />
              </div>
              <h3 className="text-[16px] font-bold text-[#0B0B0C] font-malayalam">
                {lang === 'ml' ? 'ഇമെയിൽ വിലാസം സ്ഥിരീകരിക്കുക' : 'Verify your email address'}
              </h3>
              <p className="mt-1 text-[12.5px] text-[#5B6168] font-malayalam">
                {lang === 'ml'
                  ? `${email || 'നിങ്ങളുടെ ഇമെയിൽ'}-ലേക്ക് അയച്ച 6 അക്ക കോഡ് രേഖപ്പെടുത്തുക.`
                  : `Enter the 6-digit code sent to ${email || 'your email'}.`}
              </p>
            </div>

            {/* Numeric OTP Input with Paste Support & Keyboard Navigation */}
            <div>
              <label className="block text-[12px] font-medium text-[#5B6168] mb-2.5 text-center font-malayalam">
                {lang === 'ml' ? `സ്ഥിരീകരണ കോഡ് (${otpLength}-Digit OTP)` : `${otpLength}-Digit Verification Code`}
              </label>
              <div className="flex justify-center gap-1.5 sm:gap-2">
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpInputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    onPaste={(e) => handleOtpPasteEvent(idx, e)}
                    aria-label={`Verification code digit ${idx + 1} of ${otpLength}`}
                    className={`text-center font-bold text-[#0B0B0C] rounded-xl border border-[#E6E8EC] bg-[#F8F9FA] focus:bg-white focus:border-[#E03A45] focus:ring-2 focus:ring-[#E03A45]/20 focus:outline-hidden transition-all shadow-2xs ${
                      otpLength === 8
                        ? 'w-9 h-11 sm:w-10 sm:h-12 text-lg sm:text-xl'
                        : 'w-11 h-13 sm:w-12 sm:h-14 text-xl sm:text-2xl'
                    }`}
                  />
                ))}
              </div>
              <div className="flex justify-center mt-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = otpLength === 6 ? 8 : 6;
                    setOtpLength(next);
                    setOtp(Array(next).fill(''));
                    setOtpError(null);
                  }}
                  className="text-[11.5px] text-[#8C939D] hover:text-[#5B6168] hover:underline cursor-pointer font-malayalam transition-colors"
                >
                  {otpLength === 6
                    ? (lang === 'ml' ? '8 അക്ക കോഡാണോ ലഭിച്ചത്? ഇവിടെ ക്ലിക്ക് ചെയ്യുക' : 'Received an 8-digit code? Switch to 8 boxes')
                    : (lang === 'ml' ? 'സാധാരണ 6 അക്ക കോഡിലേക്ക് മാറുക' : 'Switch to standard 6 boxes')}
                </button>
              </div>
            </div>

            {otpError && (
              <div className="rounded-xl border border-[#FEE2E2] bg-[#FFF5F5] p-3 text-[12px] text-[#E03A45] flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-malayalam">{otpError}</span>
              </div>
            )}

            {/* Verify Action Button */}
            <Button
              type="submit"
              disabled={isVerifyingOtp || otp.join('').length < otpLength}
              className="w-full h-11 justify-center bg-[#E03A45] hover:bg-[#C42F3A] text-white rounded-xl font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isVerifyingOtp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="flex items-center gap-2 font-malayalam">
                  {lang === 'ml' ? 'കോഡ് സ്ഥിരീകരിക്കുക' : 'Verify Code'}
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>

            {/* Resend Code with Countdown & Change Email Link */}
            <div className="flex items-center justify-between pt-1 text-[12.5px]">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0 || isLoading || isVerifyingOtp}
                className="flex items-center gap-1.5 font-medium text-[#E03A45] hover:text-[#C42F3A] disabled:text-[#8C939D] disabled:cursor-not-allowed cursor-pointer transition-colors font-malayalam"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>
                  {resendCooldown > 0
                    ? lang === 'ml'
                      ? `വീണ്ടും അയക്കുക (${resendCooldown}s)`
                      : `Resend code in ${resendCooldown}s`
                    : lang === 'ml'
                    ? 'കോഡ് വീണ്ടും അയക്കുക'
                    : 'Resend code'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleChangeEmail}
                className="font-medium text-[#5B6168] hover:text-[#0B0B0C] cursor-pointer font-malayalam transition-colors"
              >
                {lang === 'ml' ? 'ഇമെയിൽ മാറ്റുക' : 'Change email'}
              </button>
            </div>

            <div className="pt-2 border-t border-[#F0F2F5] text-center">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-[12.5px] font-medium text-[#5B6168] hover:text-[#0B0B0C] cursor-pointer font-malayalam"
              >
                {lang === 'ml' ? '← ലോഗിൻ പേജിലേക്ക് മടങ്ങുക' : '← Back to Sign In'}
              </button>
            </div>
          </form>
        )}

        {/* VIEW 4: Forgot Password Request (Enter Email only when not already available) */}
        {mode === 'forgot-password' && (
          <form onSubmit={handleSubmit} className="space-y-4 py-1">
            <p className="text-[12.5px] text-[#5B6168] font-malayalam">
              {lang === 'ml'
                ? 'നിങ്ങളുടെ രജിസ്റ്റർ ചെയ്ത ഇമെയിൽ വിലാസം നൽകുക. പാസ്‌വേഡ് റീസെറ്റ് ചെയ്യാനുള്ള സ്ഥിരീകരണ കോഡ് അയക്കുന്നതാണ്.'
                : 'Enter your registered account email. We will send a verification code to reset your password.'}
            </p>

            <div>
              <label className="block text-[12px] font-medium text-[#5B6168] mb-1 font-malayalam">
                {lang === 'ml' ? 'ഇമെയിൽ വിലാസം (Email)' : 'Email Address'}
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-[#8C939D]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  data-testid="recovery-email-input"
                  className="w-full rounded-xl border border-[#E6E8EC] bg-white pl-10 pr-4 py-2 text-[13.5px] text-[#0B0B0C] placeholder-[#8C939D] focus:border-[#0B0B0C] focus:outline-hidden"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 justify-center bg-[#E03A45] hover:bg-[#C42F3A] text-white rounded-xl font-semibold shadow-xs transition-all cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="font-malayalam">
                  {lang === 'ml' ? 'റിക്കവറി കോഡ് അയക്കുക' : 'Send Recovery Code'}
                </span>
              )}
            </Button>

            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full py-1 text-center text-[12.5px] font-medium text-[#5B6168] hover:text-[#0B0B0C] cursor-pointer font-malayalam"
            >
              {lang === 'ml' ? '← ലോഗിൻ പേജിലേക്ക് മടങ്ങുക' : '← Back to Sign In'}
            </button>
          </form>
        )}

        {/* VIEW 4b: Password Recovery 6-Digit OTP Verification Screen */}
        {mode === 'reset-password-otp' && (
          <form onSubmit={handleVerifyRecoveryOtp} className="space-y-5 py-2">
            <div className="rounded-2xl border border-[#FEE2E2] bg-[#FFF5F5] p-4 text-center">
              <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFE4E6] text-[#E03A45]">
                <KeyRound className="h-6 w-6 stroke-[2.2]" />
              </div>
              <h3 className="text-[16px] font-bold text-[#0B0B0C] font-malayalam">
                {lang === 'ml' ? 'ഇൻബോക്സ് പരിശോധിക്കുക' : 'Check your email'}
              </h3>
              <p className="mt-1 text-[12.5px] text-[#5B6168] font-malayalam leading-relaxed">
                {lang === 'ml' ? (
                  <>
                    ഈ വിലാസത്തിൽ അക്കൗണ്ട് ഉണ്ടെങ്കിൽ, ഞങ്ങൾ പാസ്‌വേഡ് റീസെറ്റ് കോഡ് അയച്ചിട്ടുണ്ട്:{' '}
                    <span className="font-mono font-bold text-[#0B0B0C] break-all bg-white/70 px-1.5 py-0.5 rounded border border-[#FEE2E2]">
                      {maskEmail(recoveryEmail)}
                    </span>
                  </>
                ) : (
                  <>
                    If an account exists for this address, we've sent a password-reset code to{' '}
                    <span className="font-mono font-bold text-[#0B0B0C] break-all bg-white/70 px-1.5 py-0.5 rounded border border-[#FEE2E2]">
                      {maskEmail(recoveryEmail)}
                    </span>
                    .
                  </>
                )}
              </p>
            </div>

            {/* Adaptive OTP Inputs (6 or 8 digits) */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-[12px] font-medium text-[#5B6168] font-malayalam">
                  {lang === 'ml'
                    ? `${recoveryOtpLength}-അക്ക റിക്കവറി കോഡ്`
                    : `${recoveryOtpLength}-Digit Password Recovery Code`}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const nextLen = recoveryOtpLength === 6 ? 8 : 6;
                    setRecoveryOtpLength(nextLen);
                    setRecoveryOtp(Array(nextLen).fill(''));
                    setRecoveryOtpError(null);
                  }}
                  className="text-[11px] font-medium text-[#E03A45] hover:underline cursor-pointer"
                >
                  {recoveryOtpLength === 6
                    ? lang === 'ml'
                      ? '8 അക്ക കോഡ് ആണോ? മാറ്റുക'
                      : 'Received 8 digits? Switch to 8'
                    : lang === 'ml'
                    ? '6 അക്ക കോഡ് ആണോ? മാറ്റുക'
                    : 'Switch to 6 digits'}
                </button>
              </div>
              <div className="flex justify-center gap-1 sm:gap-1.5">
                {recoveryOtp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      recoveryOtpInputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                    value={digit}
                    onChange={(e) => handleRecoveryOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleRecoveryOtpKeyDown(idx, e)}
                    onPaste={(e) => handleRecoveryOtpPasteEvent(idx, e)}
                    aria-label={`Recovery code digit ${idx + 1} of ${recoveryOtpLength}`}
                    className={`text-center font-bold text-[#0B0B0C] rounded-xl border border-[#E6E8EC] bg-[#F8F9FA] focus:bg-white focus:border-[#E03A45] focus:ring-2 focus:ring-[#E03A45]/20 focus:outline-hidden transition-all shadow-2xs ${
                      recoveryOtpLength === 8
                        ? 'w-9 h-11 sm:w-10 sm:h-12 text-lg sm:text-xl'
                        : 'w-11 h-13 sm:w-12 sm:h-14 text-xl sm:text-2xl'
                    }`}
                  />
                ))}
              </div>
            </div>

            {recoveryOtpError && (
              <div className="rounded-xl border border-[#FEE2E2] bg-[#FFF5F5] p-3 text-[12px] text-[#E03A45] flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-malayalam">{recoveryOtpError}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={isVerifyingRecoveryOtp || recoveryOtp.join('').length < recoveryOtpLength}
              className="w-full h-11 justify-center bg-[#E03A45] hover:bg-[#C42F3A] text-white rounded-xl font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isVerifyingRecoveryOtp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="flex items-center gap-2 font-malayalam">
                  {lang === 'ml' ? 'കോഡ് സ്ഥിരീകരിക്കുക' : 'Verify Code'}
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>

            {/* Resend & Change Email Actions */}
            <div className="flex items-center justify-between pt-1 text-[12.5px]">
              <button
                type="button"
                onClick={handleResendRecoveryOtp}
                disabled={resendCooldown > 0 || isLoading || isVerifyingRecoveryOtp}
                className="flex items-center gap-1.5 font-medium text-[#E03A45] hover:text-[#C42F3A] disabled:text-[#8C939D] disabled:cursor-not-allowed cursor-pointer transition-colors font-malayalam"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>
                  {resendCooldown > 0
                    ? lang === 'ml'
                      ? `വീണ്ടും അയക്കുക (${resendCooldown}s)`
                      : `Resend code in ${resendCooldown}s`
                    : lang === 'ml'
                    ? 'കോഡ് വീണ്ടും അയക്കുക'
                    : 'Resend code'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('forgot-password');
                  setRecoveryOtp(Array(6).fill(''));
                  setRecoveryOtpError(null);
                  setError(null);
                }}
                className="font-medium text-[#5B6168] hover:text-[#0B0B0C] cursor-pointer font-malayalam transition-colors"
              >
                {lang === 'ml' ? 'ഇമെയിൽ മാറ്റുക' : 'Change email'}
              </button>
            </div>

            <div className="pt-2 border-t border-[#F0F2F5] text-center">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-[12.5px] font-medium text-[#5B6168] hover:text-[#0B0B0C] cursor-pointer font-malayalam"
              >
                {lang === 'ml' ? '← ലോഗിൻ പേജിലേക്ക് മടങ്ങുക' : '← Back to Sign In'}
              </button>
            </div>
          </form>
        )}

        {/* VIEW 5: Password Recovery Step 2 - Date of Birth Challenge */}
        {mode === 'reset-password-dob' && (
          <form onSubmit={handleSubmit} className="space-y-4 py-1">
            <div className="rounded-xl border border-[#E6E8EC] bg-[#F8F9FA] p-3 text-[12px] text-[#5B6168] font-malayalam">
              {lang === 'ml'
                ? 'റിക്കവറി കോഡ് സ്ഥിരീകരിച്ചു (ഘട്ടം 1/2). തുടർന്നുപോകുവാൻ നിങ്ങളുടെ ജനനത്തീയതി രേഖപ്പെടുത്തുക.'
                : 'Recovery code verified (Step 1 of 2). Please verify your date of birth to authorize a password change.'}
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#5B6168] mb-1 font-malayalam">
                {lang === 'ml' ? 'ജനനത്തീയതി (Date of Birth) *' : 'Date of Birth *'}
              </label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-3 h-4 w-4 text-[#8C939D]" />
                <input
                  type="date"
                  required
                  max={todayStr}
                  min="1900-01-01"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full rounded-xl border border-[#E6E8EC] bg-white pl-10 pr-4 py-2 text-[13.5px] text-[#0B0B0C] focus:border-[#0B0B0C] focus:outline-hidden"
                />
              </div>
              <p className="mt-1 text-[11px] text-[#8C939D] font-malayalam">
                {lang === 'ml'
                  ? 'അക്കൗണ്ടിൽ രജിസ്റ്റർ ചെയ്ത ജനനത്തീയതി നൽകുക.'
                  : 'Must match the registered date of birth on your account.'}
              </p>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !dateOfBirth}
              className="w-full h-11 justify-center bg-[#E03A45] hover:bg-[#C42F3A] text-white rounded-xl font-semibold shadow-xs transition-all cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="flex items-center gap-2 font-malayalam">
                  {lang === 'ml' ? 'ജനനത്തീയതി സ്ഥിരീകരിക്കുക' : 'Verify Date of Birth'}
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>

            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full py-1 text-center text-[12.5px] font-medium text-[#5B6168] hover:text-[#0B0B0C] cursor-pointer font-malayalam"
            >
              {lang === 'ml' ? '← ലോഗിൻ പേജിലേക്ക് മടങ്ങുക' : '← Back to Sign In'}
            </button>
          </form>
        )}

        {/* VIEW 6: Password Recovery Step 3 - Set New Password */}
        {mode === 'reset-password-new' && (
          <form onSubmit={handleSubmit} className="space-y-4 py-1">
            <div className="rounded-xl border border-[#DCFCE7] bg-[#F0FDF4] p-3 text-[12px] text-[#16A34A] font-malayalam">
              {lang === 'ml'
                ? 'ജനനത്തീയതി സ്ഥിരീകരിച്ചു! നിങ്ങളുടെ പുതിയ പാസ്‌വേഡ് നിശ്ചയിക്കാം.'
                : 'Identity verified successfully! Enter your new password below.'}
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#5B6168] mb-1 font-malayalam">
                {lang === 'ml' ? 'പുതിയ പാസ്‌വേഡ് (New Password) *' : 'New Password *'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-[#8C939D]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  data-testid="auth-password-input"
                  className="w-full rounded-xl border border-[#E6E8EC] bg-white pl-10 pr-10 py-2 text-[13.5px] text-[#0B0B0C] placeholder-[#8C939D] focus:border-[#0B0B0C] focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-2.5 text-[#8C939D] hover:text-[#0B0B0C] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-[#8C939D] font-malayalam">
                {lang === 'ml' ? 'കുറഞ്ഞത് 8 അക്ഷരങ്ങൾ വേണം' : 'Must be at least 8 characters long'}
              </p>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#5B6168] mb-1 font-malayalam">
                {lang === 'ml' ? 'പാസ്‌വേഡ് വീണ്ടും നൽകുക (Confirm Password) *' : 'Confirm Password *'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-[#8C939D]" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[#E6E8EC] bg-white pl-10 pr-10 py-2 text-[13.5px] text-[#0B0B0C] placeholder-[#8C939D] focus:border-[#0B0B0C] focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-2.5 text-[#8C939D] hover:text-[#0B0B0C] cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-[11px] text-[#E03A45] font-malayalam">
                  {lang === 'ml' ? 'പാസ്‌വേഡുകൾ പൊരുത്തപ്പെടുന്നില്ല' : 'Passwords do not match'}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading || password.length < 8 || password !== confirmPassword}
              className="w-full h-11 justify-center bg-[#E03A45] hover:bg-[#C42F3A] text-white rounded-xl font-semibold shadow-xs transition-all cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="flex items-center gap-2 font-malayalam">
                  {lang === 'ml' ? 'പാസ്‌വേഡ് മാറ്റുക' : 'Update Password'}
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              )}
            </Button>

            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full py-1 text-center text-[12.5px] font-medium text-[#5B6168] hover:text-[#0B0B0C] cursor-pointer font-malayalam"
            >
              {lang === 'ml' ? '← ലോഗിൻ പേജിലേക്ക് മടങ്ങുക' : '← Back to Sign In'}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-[11px] text-[#8C939D] font-malayalam">
          {lang === 'ml'
            ? 'സ്വകാര്യ സുരക്ഷിത സംഭരണം • എൻഡ്-ടു-എൻഡ് രഹസ്യസ്വഭാവം'
            : 'Private & Secure • Powered by Supabase Auth & MongoDB'}
        </p>
      </div>
    </div>
  );
};
