import React, { useState, useEffect, useContext, createContext, useRef, useCallback } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import axios from "axios";
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend } from 'recharts';
import Website from "./Website";

// Countries list for dropdown
const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon",
  "Canada", "Cape Verde", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica",
  "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "East Timor", "Ecuador",
  "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau",
  "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland",
  "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait",
  "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico",
  "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru",
  "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman",
  "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe",
  "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia",
  "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan",
  "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City",
  "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Authentication Context
const AuthContext = createContext();

// Financial Context for cross-component data refresh
const FinancialContext = createContext();

// Financial Provider
const FinancialProvider = ({ children }) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const triggerFinancialRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };
  
  return (
    <FinancialContext.Provider value={{ refreshTrigger, triggerFinancialRefresh }}>
      {children}
    </FinancialContext.Provider>
  );
};

// Hook to use financial context
const useFinancial = () => {
  const context = useContext(FinancialContext);
  if (!context) {
    throw new Error('useFinancial must be used within a FinancialProvider');
  }
  return context;
};

// Authentication Provider
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [isSetupCompleted, setIsSetupCompleted] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Set axios default authorization header and setup interceptor
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Setup axios response interceptor to handle auth errors
  useEffect(() => {
    // Request interceptor - ensure token is always set from localStorage
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        const storedToken = localStorage.getItem('token');
        if (storedToken && !config.headers['Authorization']) {
          config.headers['Authorization'] = `Bearer ${storedToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle auth errors
    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        // Handle 401 Unauthorized errors
        if (error.response?.status === 401) {
          console.log('Session expired or unauthorized - logging out');
          // Clear token and redirect to login
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
          setMustChangePassword(false);
          // Show user-friendly message
          if (error.config?.url && !error.config.url.includes('/auth/login')) {
            alert('Your session has expired. Please log in again.');
          }
        }
        return Promise.reject(error);
      }
    );

    // Cleanup interceptors on unmount
    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  // Check setup status on app load
  useEffect(() => {
    const checkSetupStatus = async () => {
      try {
        const response = await axios.get(`${API}/setup/status`);
        setIsSetupCompleted(response.data.is_completed);
      } catch (error) {
        console.error('Error checking setup status:', error);
      } finally {
        setCheckingSetup(false);
      }
    };
    checkSetupStatus();
  }, []);

  // Check if user is authenticated on app load
  useEffect(() => {
    const checkAuth = async () => {
      if (token && isSetupCompleted) {
        try {
          const response = await axios.get(`${API}/auth/me`);
          setUser(response.data);
        } catch (error) {
          console.error('Token invalid:', error);
          logout();
        }
      }
      setLoading(false);
    };
    
    if (!checkingSetup) {
      checkAuth();
    }
  }, [token, isSetupCompleted, checkingSetup]);

  const login = async (username, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, {
        username,
        password
      });
      
      const { access_token, must_change_password: mustChange } = response.data;
      localStorage.setItem('token', access_token);
      
      // Set authorization header immediately before making the next request
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      setToken(access_token);
      
      // Get user info
      const userResponse = await axios.get(`${API}/auth/me`);
      setUser(userResponse.data);
      
      // Check if password change is required
      if (mustChange) {
        setMustChangePassword(true);
        return { success: true, mustChangePassword: true };
      }
      
      return { success: true, mustChangePassword: false };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Login failed' 
      };
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      await axios.post(`${API}/auth/change-password`, {
        current_password: currentPassword,
        new_password: newPassword
      });
      setMustChangePassword(false);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Password change failed' 
      };
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await axios.post(`${API}/auth/logout`);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
      setMustChangePassword(false);
      delete axios.defaults.headers.common['Authorization'];
    }
  };

  const completeSetup = async (setupData) => {
    try {
      await axios.post(`${API}/setup/complete`, setupData);
      setIsSetupCompleted(true);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Setup failed' 
      };
    }
  };

  const value = {
    user,
    token,
    loading,
    isSetupCompleted,
    checkingSetup,
    mustChangePassword,
    login,
    logout,
    changePassword,
    completeSetup
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuth = () => {
  return useContext(AuthContext);
};

// Setup Wizard Component
const SetupWizard = () => {
  const [formData, setFormData] = useState({
    hotel_name: '',
    hotel_address: '',
    hotel_email: '',
    timezone: 'Asia/Colombo',  // Default to Sri Lanka timezone
    cash_balance: 0,
    bank_balance: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPostReset, setIsPostReset] = useState(false);
  const { completeSetup } = useAuth();

  // Check if this is a post-reset setup and pre-fill data
  useEffect(() => {
    const checkPostResetSetup = async () => {
      try {
        // Check if hotel settings exist (indicating post-reset scenario)
        const settingsResponse = await axios.get(`${API}/settings`);
        if (settingsResponse.data && settingsResponse.data.hotel_name) {
          setIsPostReset(true);
          setFormData(prev => ({
            ...prev,
            hotel_name: settingsResponse.data.hotel_name || '',
            hotel_address: settingsResponse.data.hotel_address || '',
            hotel_email: settingsResponse.data.hotel_email || '',
            timezone: settingsResponse.data.timezone || 'Asia/Colombo'
          }));
        }
      } catch (error) {
        // If settings don't exist, this is a fresh setup
        console.log('Fresh setup - no existing settings');
      }
    };
    checkPostResetSetup();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await completeSetup(formData);
    
    if (!result.success) {
      setError(result.error);
    }
    
    setLoading(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === 'cash_balance' || name === 'bank_balance' 
        ? parseFloat(value) || 0 
        : value
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            {isPostReset ? 'Re-initialize Your Hotel' : 'Welcome!'}
          </h1>
          <p className="text-gray-400">
            {isPostReset 
              ? 'After the complete reset, please set your initial cash and bank balances to restart your financial tracking'
              : "Let's set up your hotel management system"
            }
          </p>
        </div>

        {error && (
          <div className="bg-red-600 text-white p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Hotel Name
            </label>
            <input
              type="text"
              name="hotel_name"
              value={formData.hotel_name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Enter your hotel name"
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Hotel Address
            </label>
            <textarea
              name="hotel_address"
              value={formData.hotel_address}
              onChange={handleChange}
              required
              rows={3}
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Enter your hotel address"
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Hotel Email
            </label>
            <input
              type="email"
              name="hotel_email"
              value={formData.hotel_email}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Enter hotel email address"
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Hotel Timezone
            </label>
            <select
              name="timezone"
              value={formData.timezone}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <option value="Asia/Colombo">Asia/Colombo (Sri Lanka)</option>
              <option value="Asia/Kolkata">Asia/Kolkata (India)</option>
              <option value="Asia/Dubai">Asia/Dubai (UAE)</option>
              <option value="Asia/Singapore">Asia/Singapore</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
              <option value="Europe/London">Europe/London (GMT)</option>
              <option value="Europe/Paris">Europe/Paris (CET)</option>
              <option value="Australia/Sydney">Australia/Sydney</option>
              <option value="Asia/Tokyo">Asia/Tokyo (Japan)</option>
              <option value="UTC">UTC</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              All timestamps in the application will use this timezone
            </p>
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Initial Cash Balance {isPostReset ? '(Post-Reset)' : ''}
            </label>
            <input
              type="number"
              name="cash_balance"
              value={formData.cash_balance}
              onChange={handleChange}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="0.00"
            />
            <p className="text-xs text-gray-500 mt-1">
              {isPostReset 
                ? 'Enter your current cash balance to restart financial tracking'
                : 'Starting cash balance for your hotel'
              }
            </p>
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Initial Bank Balance {isPostReset ? '(Post-Reset)' : ''}
            </label>
            <input
              type="number"
              name="bank_balance"
              value={formData.bank_balance}
              onChange={handleChange}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="0.00"
            />
            <p className="text-xs text-gray-500 mt-1">
              {isPostReset 
                ? 'Enter your current bank balance to restart financial tracking'
                : 'Starting bank balance for your hotel'
              }
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading 
              ? (isPostReset ? 'Re-initializing...' : 'Setting up...') 
              : (isPostReset ? 'Complete Re-initialization' : 'Complete Setup')
            }
          </button>
        </form>

        <div className="mt-6 p-4 bg-gray-700 rounded-lg">
          <p className="text-sm text-gray-300 mb-2">Default admin credentials:</p>
          <p className="text-xs text-gray-400">Username: <strong className="text-white">admin</strong></p>
          <p className="text-xs text-gray-400">Password: <strong className="text-white">admin123</strong></p>
          <p className="text-xs text-gray-500 mt-2">You can change these after logging in.</p>
        </div>
      </div>
    </div>
  );
};

// Login Component
const LoginPage = () => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(credentials.username, credentials.password);
    
    if (!result.success) {
      setError(result.error);
    }
    
    setLoading(false);
  };

  const handleRequestOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setForgotPasswordMessage('');

    try {
      await axios.post(`${API}/auth/request-otp`, {
        email: forgotPasswordEmail
      });
      setForgotPasswordMessage('If the email is registered, an OTP has been sent.');
      setOtpStep(true);
    } catch (error) {
      setError(error.response?.data?.detail || 'Failed to send OTP. Please ensure email settings are configured.');
    }
    
    setLoading(false);
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      await axios.post(`${API}/auth/verify-otp-reset`, {
        email: forgotPasswordEmail,
        otp: otp,
        new_password: newPassword
      });
      alert('Password reset successful! Please login with your new password.');
      setShowForgotPassword(false);
      setOtpStep(false);
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setForgotPasswordEmail('');
    } catch (error) {
      setError(error.response?.data?.detail || 'Invalid or expired OTP');
    }
    
    setLoading(false);
  };

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
  };

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">
              {otpStep ? 'Reset Password' : 'Forgot Password'}
            </h1>
            <p className="text-gray-400">
              {otpStep ? 'Enter the OTP sent to your email and your new password' : 'Enter your email to receive an OTP'}
            </p>
          </div>

          {error && (
            <div className="bg-red-600 text-white p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {forgotPasswordMessage && !otpStep && (
            <div className="bg-green-600 text-white p-3 rounded-lg mb-4">
              {forgotPasswordMessage}
            </div>
          )}

          {!otpStep ? (
            <form onSubmit={handleRequestOTP} className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="Enter your registered email"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending OTP...' : 'Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  OTP Code
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  maxLength={6}
                  className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-center text-xl tracking-widest"
                  placeholder="Enter 6-digit OTP"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="Enter new password (min 8 characters)"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="Confirm new password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}

          <div className="mt-4 text-center">
            <button
              onClick={() => {
                setShowForgotPassword(false);
                setOtpStep(false);
                setError('');
                setForgotPasswordMessage('');
                setOtp('');
                setNewPassword('');
                setConfirmPassword('');
              }}
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Hotel Management</h1>
          <p className="text-gray-400">Sign in to your account</p>
        </div>

        {error && (
          <div className="bg-red-600 text-white p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Username
            </label>
            <input
              type="text"
              name="username"
              value={credentials.username}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Enter your username"
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Password
            </label>
            <input
              type="password"
              name="password"
              value={credentials.password}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setShowForgotPassword(true)}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            Forgot Password?
          </button>
        </div>
      </div>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading, isSetupCompleted, checkingSetup, mustChangePassword, changePassword } = useAuth();
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (mustChangePassword) {
      setShowPasswordChangeModal(true);
    }
  }, [mustChangePassword]);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }

    if (passwordForm.currentPassword === passwordForm.newPassword) {
      setPasswordError('New password must be different from current password');
      return;
    }

    setChangingPassword(true);
    const result = await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
    
    if (result.success) {
      alert('Password changed successfully!');
      setShowPasswordChangeModal(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } else {
      setPasswordError(result.error);
    }
    setChangingPassword(false);
  };

  if (checkingSetup || loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!isSetupCompleted) {
    return <SetupWizard />;
  }

  if (!user) {
    return <LoginPage />;
  }

  // Show password change modal if required
  if (showPasswordChangeModal && mustChangePassword) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">🔐</div>
            <h1 className="text-2xl font-bold text-white mb-2">Change Your Password</h1>
            <p className="text-gray-400">For security reasons, you must change your password before continuing.</p>
          </div>

          {passwordError && (
            <div className="bg-red-600 text-white p-3 rounded-lg mb-4">
              {passwordError}
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Current Password
              </label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                required
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                placeholder="Enter current password"
              />
              <p className="text-xs text-gray-500 mt-1">Default: admin123</p>
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                New Password
              </label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                required
                minLength={8}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                placeholder="Enter new password (min 8 characters)"
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                required
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                placeholder="Confirm new password"
              />
            </div>

            <button
              type="submit"
              disabled={changingPassword}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {changingPassword ? 'Changing Password...' : 'Change Password & Continue'}
            </button>
          </form>

          <div className="mt-4 p-3 bg-amber-900/30 border border-amber-700 rounded-lg">
            <p className="text-amber-300 text-sm">
              <strong>Security Tips:</strong>
            </p>
            <ul className="text-amber-200 text-xs mt-1 list-disc list-inside">
              <li>Use at least 8 characters</li>
              <li>Mix letters, numbers, and symbols</li>
              <li>Don't reuse old passwords</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

// Page-level permission guard
const PageGuard = ({ pageId, children }) => {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'Admin') return children;
  const perms = user.page_permissions || [];
  if (perms.length === 0) return <div className="min-h-screen bg-gray-900 flex items-center justify-center"><div className="text-center"><h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2><p className="text-gray-400">You don't have permission to view this page.</p></div></div>;
  if (!perms.includes(pageId)) return <div className="min-h-screen bg-gray-900 flex items-center justify-center"><div className="text-center"><h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2><p className="text-gray-400">You don't have permission to view this page.</p></div></div>;
  return children;
};

// Real-time clock component
const RealTimeClock = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { user, logout } = useAuth();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await logout();
    }
  };

  return (
    <div className="flex items-center space-x-2 sm:space-x-4">
      <div className="text-xs sm:text-sm text-gray-400 text-right">
        <div className="hidden sm:block">Welcome, {user?.full_name || user?.username || 'User'}</div>
        <div className="text-xs">
          <span className="hidden sm:inline">{currentTime.toLocaleDateString()} | </span>
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="text-xs sm:text-sm text-red-400 hover:text-red-300 bg-red-900 px-2 py-1 rounded flex-shrink-0"
      >
        Logout
      </button>
    </div>
  );
};

// Dashboard Component
const Dashboard = () => {
  const [rooms, setRooms] = useState([]);
  const [upcomingBookings, setUpcomingBookings] = useState([]);
  const [upcomingBookingsPage, setUpcomingBookingsPage] = useState(1);
  const [checkedInCustomers, setCheckedInCustomers] = useState([]);
  const [roomsPendingCleaning, setRoomsPendingCleaning] = useState([]);
  const [cleaningStaff, setCleaningStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Cleaning section state
  const [cleaningSectionExpanded, setCleaningSectionExpanded] = useState(true);
  const [showAssignStaffModal, setShowAssignStaffModal] = useState(false);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [selectedCleaningRoom, setSelectedCleaningRoom] = useState(null);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  
  // Get current user context
  const { user } = useAuth();
  
  // Get financial context to trigger refreshes across components
  const { triggerFinancialRefresh } = useFinancial();
  
  // Modal states
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showNewBookingModal, setShowNewBookingModal] = useState(false);
  const [showEditBookingModal, setShowEditBookingModal] = useState(false);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [showStatusSelectionModal, setShowStatusSelectionModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  
  // Dropdown state for booking actions and customer actions
  const [openDropdowns, setOpenDropdowns] = useState({});
  const [openCustomerDropdowns, setOpenCustomerDropdowns] = useState({});
  
  // Advance payment modal state
  const [showAdvancePaymentModal, setShowAdvancePaymentModal] = useState(false);
  const [advancePaymentData, setAdvancePaymentData] = useState({
    amount: '',
    payment_method: 'Cash',
    notes: ''
  });
  
  // Extend stay modal state
  const [showExtendStayModal, setShowExtendStayModal] = useState(false);
  const [extendStayData, setExtendStayData] = useState({
    new_checkout_date: ''
  });
  
  // Early checkout modal state  
  const [showEarlyCheckoutModal, setShowEarlyCheckoutModal] = useState(false);
  const [earlyCheckoutPreview, setEarlyCheckoutPreview] = useState(null);
  const [earlyCheckoutData, setEarlyCheckoutData] = useState({
    additional_amount: 0,
    discount_amount: 0,
    payment_method: 'Cash'
  });
  const [showPaymentCollectionModal, setShowPaymentCollectionModal] = useState(false);
  const [paymentCollectionData, setPaymentCollectionData] = useState({
    amount: 0,
    payment_method: 'Cash'
  });
  
  // Room availability checker state
  const [availabilityData, setAvailabilityData] = useState(null);
  const [availabilityDates, setAvailabilityDates] = useState({
    check_in_date: '',
    check_out_date: ''
  });
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  
  // Form states
  const [checkinData, setCheckinData] = useState({
    advance_amount: 0,
    notes: '',
    payment_method: 'Cash'
  });
  const [checkoutData, setCheckoutData] = useState({
    additional_amount: '',
    discount_amount: '',
    payment_method: 'Cash'
  });
  const [checkoutTaxPreview, setCheckoutTaxPreview] = useState(null);
  const [showPrintInvoiceDialog, setShowPrintInvoiceDialog] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [availableRoomsForBooking, setAvailableRoomsForBooking] = useState([]);
  const [availableChannels, setAvailableChannels] = useState([]);
  const [selectedBookingStatus, setSelectedBookingStatus] = useState('Upcoming');
  const [newBookingData, setNewBookingData] = useState({
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    country: '',
    guest_id_passport: '',
    guest_id_proof: '',
    guest_id_proof_filename: '',
    room_number: '',
    check_in_date: '',
    check_out_date: '',
    stay_type: 'Night Stay',
    rate_per_night: '',
    booking_amount: 0,
    advance_amount: 0,
    advance_payment_method: 'Cash',
    commission_amount: 0,
    booking_channel_id: '',
    booking_channel_name: 'Direct',
    additional_notes: ''
  });
  const [editBookingData, setEditBookingData] = useState({
    room_number: '',
    check_in_date: '',
    check_out_date: '',
    additional_notes: ''
  });
  const [hotelSettings, setHotelSettings] = useState({
    hotel_name: 'Hotel Management System',
    hotel_logo: '',
    hotel_address: '',
    hotel_phone: '',
    hotel_contact: '',
    hotel_email: '',
    currency: 'LKR'
  });

  useEffect(() => {
    initializeData();
    
    // Add click outside handler for dropdowns
    const handleClickOutside = (event) => {
      // Close dropdowns when clicking outside
      if (!event.target.closest('.relative')) {
        closeAllDropdowns();
        closeAllCustomerDropdowns();
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const initializeData = async () => {
    try {
      // No longer auto-initialize sample data - let admin manage via reset feature
      // await axios.post(`${API}/init-data`);
      
      // Fetch all data
      await Promise.all([
        fetchRooms(),
        fetchUpcomingBookings(),
        fetchCheckedInCustomers(),
        fetchRoomsPendingCleaning(),
        fetchCleaningStaff(),
        fetchHotelSettings(),
        fetchAvailableChannels()
      ]);
    } catch (error) {
      console.error('Error initializing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoomsPendingCleaning = async () => {
    try {
      const response = await axios.get(`${API}/cleaning/pending`);
      setRoomsPendingCleaning(response.data);
    } catch (error) {
      console.error('Error fetching rooms pending cleaning:', error);
    }
  };

  const fetchCleaningStaff = async () => {
    try {
      const response = await axios.get(`${API}/cleaning/staff`);
      setCleaningStaff(response.data);
    } catch (error) {
      console.error('Error fetching cleaning staff:', error);
    }
  };

  const handleAssignStaff = async (staffId) => {
    if (!selectedCleaningRoom) return;
    try {
      await axios.post(`${API}/cleaning/assign?room_number=${selectedCleaningRoom.room_number}&staff_id=${staffId}`);
      setShowAssignStaffModal(false);
      setSelectedCleaningRoom(null);
      await fetchRoomsPendingCleaning();
    } catch (error) {
      console.error('Error assigning staff:', error);
      alert('Error assigning staff. Please try again.');
    }
  };

  const handleMarkRoomCleaned = async (roomNumber) => {
    try {
      await axios.post(`${API}/cleaning/complete/${roomNumber}`);
      await Promise.all([fetchRoomsPendingCleaning(), fetchRooms()]);
    } catch (error) {
      console.error('Error marking room cleaned:', error);
      alert('Error marking room as cleaned. Please try again.');
    }
  };

  const handleAddCleaningStaff = async () => {
    if (!newStaffName.trim()) {
      alert('Please enter staff name');
      return;
    }
    try {
      await axios.post(`${API}/cleaning/staff?name=${encodeURIComponent(newStaffName)}&phone=${encodeURIComponent(newStaffPhone)}`);
      setShowAddStaffModal(false);
      setNewStaffName('');
      setNewStaffPhone('');
      await fetchCleaningStaff();
    } catch (error) {
      console.error('Error adding staff:', error);
      alert('Error adding staff. Please try again.');
    }
  };

  const handleDeleteCleaningStaff = async (staffId) => {
    if (!window.confirm('Are you sure you want to remove this staff member?')) return;
    try {
      await axios.delete(`${API}/cleaning/staff/${staffId}`);
      await fetchCleaningStaff();
    } catch (error) {
      console.error('Error removing staff:', error);
      alert('Error removing staff. Please try again.');
    }
  };

  const fetchHotelSettings = async () => {
    try {
      const response = await axios.get(`${API}/settings`);
      setHotelSettings({
        hotel_name: response.data.hotel_name || 'Hotel Management System',
        hotel_logo: response.data.hotel_logo || '',
        hotel_address: response.data.hotel_address || '',
        hotel_phone: response.data.hotel_phone || '',
        hotel_contact: response.data.hotel_contact || '',
        hotel_email: response.data.hotel_email || '',
        currency: response.data.currency || 'LKR'
      });
    } catch (error) {
      console.error('Error fetching hotel settings:', error);
    }
  };

  const fetchAvailableChannels = async () => {
    try {
      const response = await axios.get(`${API}/booking-channels`);
      setAvailableChannels(response.data.filter(channel => channel.is_active));
    } catch (error) {
      console.error('Error fetching booking channels:', error);
    }
  };

  // Check room availability function
  const checkRoomAvailability = async () => {
    if (!availabilityDates.check_in_date || !availabilityDates.check_out_date) {
      alert('Please select both check-in and check-out dates');
      return;
    }

    setCheckingAvailability(true);
    try {
      const params = new URLSearchParams({
        check_in_date: availabilityDates.check_in_date,
        check_out_date: availabilityDates.check_out_date
      });
      
      const response = await axios.get(`${API}/rooms/availability/check?${params}`);
      setAvailabilityData(response.data);
      setShowAvailabilityModal(true);
    } catch (error) {
      console.error('Error checking availability:', error);
      if (error.response?.data?.detail) {
        alert(error.response.data.detail);
      } else {
        alert('Error checking room availability. Please try again.');
      }
    } finally {
      setCheckingAvailability(false);
    }
  };

  // Clear availability data when dates change
  const handleDateChange = (field, value) => {
    setAvailabilityDates({
      ...availabilityDates,
      [field]: value
    });
    // Clear previous results when dates change
    if (availabilityData) {
      setAvailabilityData(null);
    }
  };

  // Handle dropdown toggle for booking actions
  const toggleDropdown = (bookingId) => {
    setOpenDropdowns(prev => ({
      ...prev,
      [bookingId]: !prev[bookingId]
    }));
  };

  const closeAllDropdowns = () => {
    setOpenDropdowns({});
  };

  // Handle booking field changes with total calculation
  const handleBookingFieldChange = async (field, value) => {
    const updatedData = { ...newBookingData, [field]: value };
    
    // Calculate total booking amount when rate, dates, or stay type changes
    if (['rate_per_night', 'check_in_date', 'check_out_date', 'stay_type'].includes(field)) {
      const ratePerNight = parseFloat(updatedData.rate_per_night) || 0;
      
      if (updatedData.stay_type === 'Short Time') {
        // For short time, use the rate as-is (single charge)
        updatedData.booking_amount = ratePerNight;
      } else if (updatedData.stay_type === 'Night Stay' && updatedData.check_in_date && updatedData.check_out_date) {
        // For night stay, calculate based on number of nights
        const checkIn = new Date(updatedData.check_in_date);
        const checkOut = new Date(updatedData.check_out_date);
        const nights = Math.max(1, Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)));
        updatedData.booking_amount = ratePerNight * nights;
      } else {
        // Default to single night if dates not set
        updatedData.booking_amount = ratePerNight;
      }
    }
    
    // Update available rooms when dates change
    if (['check_in_date', 'check_out_date', 'stay_type'].includes(field)) {
      try {
        const availableRooms = await getAvailableRoomsForDates(
          updatedData.check_in_date,
          updatedData.check_out_date
        );
        setAvailableRoomsForBooking(availableRooms);
      } catch (error) {
        console.error('Error updating available rooms:', error);
        // Fallback to all non-occupied rooms
        setAvailableRoomsForBooking(getAvailableRooms());
      }
    }
    
    // Auto-calculate commission if channel has auto_rate
    if (['rate_per_night', 'check_in_date', 'check_out_date', 'stay_type', 'booking_channel_id'].includes(field)) {
      const selectedChannel = availableChannels.find(ch => ch.id === updatedData.booking_channel_id);
      if (selectedChannel && selectedChannel.auto_rate !== false && selectedChannel.commission_rate > 0 && updatedData.booking_amount > 0) {
        updatedData.commission_amount = parseFloat((updatedData.booking_amount * selectedChannel.commission_rate / 100).toFixed(2));
      }
    }
    
    setNewBookingData(updatedData);
  };

  const fetchRooms = async () => {
    try {
      const response = await axios.get(`${API}/rooms`);
      setRooms(response.data);
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }
  };

  const fetchUpcomingBookings = async () => {
    try {
      const response = await axios.get(`${API}/bookings/upcoming`);
      setUpcomingBookings(response.data);
    } catch (error) {
      console.error('Error fetching upcoming bookings:', error);
    }
  };

  const fetchCheckedInCustomers = async () => {
    try {
      const response = await axios.get(`${API}/customers/checked-in`);
      setCheckedInCustomers(response.data);
    } catch (error) {
      console.error('Error fetching checked-in customers:', error);
    }
  };

  const handleCheckout = async (customer) => {
    setSelectedCustomer(customer);
    setCheckoutData({ additional_amount: '', discount_amount: '', payment_method: 'Cash' });
    setCheckoutTaxPreview(null);
    
    // Fetch tax preview for room charges
    try {
      const roomCharges = customer.room_charges || 0;
      const response = await axios.post(`${API}/taxes/calculate-booking?base_amount=${roomCharges}`);
      setCheckoutTaxPreview(response.data);
    } catch (error) {
      console.error('Error fetching tax preview:', error);
      setCheckoutTaxPreview({ total_tax: 0, breakdown: [] });
    }
    
    setShowCheckoutModal(true);
  };

  // Recalculate taxes when additional charges or discount changes
  const recalculateCheckoutTaxes = async (roomCharges, additionalAmount, discountAmount) => {
    try {
      const taxableAmount = (roomCharges || 0) + (additionalAmount || 0) - (discountAmount || 0);
      if (taxableAmount > 0) {
        const response = await axios.post(`${API}/taxes/calculate-booking?base_amount=${taxableAmount}`);
        setCheckoutTaxPreview(response.data);
      } else {
        setCheckoutTaxPreview({ total_tax: 0, breakdown: [] });
      }
    } catch (error) {
      console.error('Error recalculating taxes:', error);
    }
  };

  const confirmCheckout = async () => {
    try {
      // Fetch latest hotel settings for invoice
      const settingsResponse = await axios.get(`${API}/settings`);
      const latestSettings = settingsResponse.data;
      
      const response = await axios.post(`${API}/checkout`, {
        customer_id: selectedCustomer.id,
        additional_amount: parseFloat(checkoutData.additional_amount) || 0,
        discount_amount: parseFloat(checkoutData.discount_amount) || 0,
        payment_method: checkoutData.payment_method
      });
      
      // Store invoice data for printing with latest settings
      setInvoiceData({
        customer: selectedCustomer,
        billing: response.data.billing_details,
        checkout_data: checkoutData,
        hotel_settings: latestSettings  // Include latest settings
      });
      
      setShowCheckoutModal(false);
      setShowPrintInvoiceDialog(true);
      
      // Refresh data after checkout (including rooms pending cleaning)
      await Promise.all([
        fetchRooms(),
        fetchCheckedInCustomers(),
        fetchRoomsPendingCleaning()
      ]);
    } catch (error) {
      console.error('Error during checkout:', error);
      alert('Error during checkout: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Handle advance payment
  const handleAdvancePayment = (customer) => {
    setSelectedCustomer(customer);
    setAdvancePaymentData({ amount: '', payment_method: 'Cash', notes: '' });
    setShowAdvancePaymentModal(true);
  };

  const confirmAdvancePayment = async () => {
    try {
      await axios.post(`${API}/advance-payment`, {
        customer_id: selectedCustomer.id,
        amount: parseFloat(advancePaymentData.amount) || 0,
        payment_method: advancePaymentData.payment_method,
        notes: advancePaymentData.notes
      });
      
      setShowAdvancePaymentModal(false);
      setSelectedCustomer(null);
      
      // Refresh data after advance payment
      await Promise.all([
        fetchCheckedInCustomers()
      ]);
      
      // Trigger financial refresh across all components
      triggerFinancialRefresh();
      
      alert(`Advance payment of LKR ${advancePaymentData.amount} collected successfully!`);
    } catch (error) {
      console.error('Error collecting advance payment:', error);
      alert('Error collecting advance payment: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Handle extend stay
  const handleExtendStay = (customer) => {
    setSelectedCustomer(customer);
    // Set default to current checkout date + 1 day
    const currentCheckout = new Date(customer.check_out_date);
    currentCheckout.setDate(currentCheckout.getDate() + 1);
    setExtendStayData({ 
      new_checkout_date: currentCheckout.toISOString().split('T')[0]
    });
    setShowExtendStayModal(true);
  };

  const confirmExtendStay = async () => {
    try {
      const response = await axios.post(`${API}/extend-stay`, {
        customer_id: selectedCustomer.id,
        new_checkout_date: extendStayData.new_checkout_date
      });
      
      setShowExtendStayModal(false);
      setSelectedCustomer(null);
      
      // Refresh data
      await Promise.all([
        fetchCheckedInCustomers(),
        fetchRooms()
      ]);
      
      const details = response.data.details;
      alert(`Stay extended successfully!\n\nAdditional nights: ${details.additional_nights}\nAdditional charges: LKR ${details.additional_charges}\nNew total: LKR ${details.new_room_charges}`);
    } catch (error) {
      console.error('Error extending stay:', error);
      alert('Error extending stay: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Handle early checkout
  const handleEarlyCheckout = async (customer) => {
    setSelectedCustomer(customer);
    try {
      // Get checkout preview
      const response = await axios.get(`${API}/customer/${customer.id}/checkout-preview`);
      setEarlyCheckoutPreview(response.data);
      setEarlyCheckoutData({
        additional_amount: 0,
        discount_amount: 0,
        payment_method: 'Cash',
        refund_excess: false
      });
      setShowEarlyCheckoutModal(true);
    } catch (error) {
      console.error('Error getting checkout preview:', error);
      alert('Error getting checkout details: ' + (error.response?.data?.detail || error.message));
    }
  };

  const confirmEarlyCheckout = async () => {
    // Calculate the final balance to determine if collection or refund
    const actualRoomCharges = earlyCheckoutPreview.actual_room_charges;
    const restaurantCharges = earlyCheckoutPreview.restaurant_charges || 0;
    const advanceAmount = earlyCheckoutPreview.advance_amount || 0;
    const additionalAmount = parseFloat(earlyCheckoutData.additional_amount) || 0;
    const discountAmount = parseFloat(earlyCheckoutData.discount_amount) || 0;
    
    const totalDue = actualRoomCharges + restaurantCharges + additionalAmount - discountAmount;
    const finalBalance = totalDue - advanceAmount;
    
    // If customer owes money (finalBalance > 0), show payment collection modal
    if (finalBalance > 0) {
      setPaymentCollectionData({
        amount: Math.round(finalBalance),
        payment_method: 'Cash'
      });
      setShowPaymentCollectionModal(true);
      return;
    }
    
    // If customer is owed a refund (finalBalance < 0), proceed with refund
    await processEarlyCheckout(earlyCheckoutData.payment_method, Math.abs(finalBalance));
  };
  
  const processEarlyCheckout = async (paymentMethod, collectionOrRefundAmount) => {
    try {
      const actualRoomCharges = earlyCheckoutPreview.actual_room_charges;
      const restaurantCharges = earlyCheckoutPreview.restaurant_charges || 0;
      const advanceAmount = earlyCheckoutPreview.advance_amount || 0;
      const additionalAmount = parseFloat(earlyCheckoutData.additional_amount) || 0;
      const discountAmount = parseFloat(earlyCheckoutData.discount_amount) || 0;
      
      const totalDue = actualRoomCharges + restaurantCharges + additionalAmount - discountAmount;
      const finalBalance = totalDue - advanceAmount;
      
      const response = await axios.post(`${API}/early-checkout`, {
        customer_id: selectedCustomer.id,
        additional_amount: additionalAmount,
        discount_amount: discountAmount,
        payment_method: paymentMethod,
        refund_excess: true,  // Always refund if applicable
        final_balance: finalBalance,
        collection_amount: finalBalance > 0 ? collectionOrRefundAmount : 0,
        refund_amount: finalBalance < 0 ? Math.abs(finalBalance) : 0
      });
      
      setShowEarlyCheckoutModal(false);
      setShowPaymentCollectionModal(false);
      setSelectedCustomer(null);
      setEarlyCheckoutPreview(null);
      setEarlyCheckoutData({ additional_amount: 0, discount_amount: 0, payment_method: 'Cash' });
      
      // Refresh data (including rooms pending cleaning)
      await Promise.all([
        fetchCheckedInCustomers(),
        fetchRooms(),
        fetchRoomsPendingCleaning()
      ]);
      
      triggerFinancialRefresh();
      
      const billing = response.data.billing_details;
      let message = `Early checkout completed!\n\n`;
      message += `Days early: ${billing.days_early}\n`;
      message += `Final charges: LKR ${Math.round(billing.final_room_charges).toLocaleString()}\n`;
      message += `Total amount: LKR ${Math.round(billing.total_amount).toLocaleString()}`;
      
      if (finalBalance > 0) {
        message += `\n\nCollected: LKR ${Math.round(collectionOrRefundAmount).toLocaleString()} (${paymentMethod})`;
      } else if (finalBalance < 0) {
        message += `\n\nRefund given: LKR ${Math.round(Math.abs(finalBalance)).toLocaleString()} (${paymentMethod})`;
      }
      alert(message);
    } catch (error) {
      console.error('Error processing early checkout:', error);
      alert('Error processing early checkout: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Handle booking cancellation (admin only)
  const handleCancelBookingForCustomer = async (customer) => {
    if (!window.confirm(`Are you sure you want to cancel the booking for ${customer.name}? This will remove the guest from the room and cannot be undone.`)) {
      return;
    }

    try {
      // Find the booking for this customer
      const allBookingsResponse = await axios.get(`${API}/bookings`);
      const allBookings = allBookingsResponse.data.bookings || [];
      
      const booking = allBookings.find(b => 
        b.guest_name === customer.name && 
        b.room_number === customer.current_room &&
        (b.status === 'Checked-in' || b.status === 'Checked In')
      );
      
      if (booking) {
        await axios.post(`${API}/cancel/${booking.id}`);
        
        // Refresh data after cancellation (including rooms pending cleaning)
        await Promise.all([
          fetchRooms(),
          fetchCheckedInCustomers(),
          fetchUpcomingBookings(),
          fetchRoomsPendingCleaning()
        ]);
        
        alert(`Booking for ${customer.name} has been cancelled successfully.`);
      } else {
        alert('Unable to find the booking record for this customer.');
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Error cancelling booking: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Dropdown toggle functions
  const closeAllCustomerDropdowns = () => {
    setOpenCustomerDropdowns({});
  };

  const toggleCustomerDropdown = (customerId) => {
    setOpenCustomerDropdowns(prev => ({
      ...prev,
      [customerId]: !prev[customerId]
    }));
  };

  const handleCheckin = async (booking) => {
    setSelectedBooking(booking);
    setCheckinData({ advance_amount: 0, notes: '', payment_method: 'Cash', new_room_number: '' });
    setShowCheckinModal(true);
  };

  const confirmCheckin = async () => {
    try {
      await axios.post(`${API}/checkin`, {
        booking_id: selectedBooking.id,
        advance_amount: checkinData.advance_amount,
        notes: checkinData.notes,
        payment_method: checkinData.payment_method,
        new_room_number: checkinData.new_room_number || null
      });
      
      setShowCheckinModal(false);
      setSelectedBooking(null);
      
      // Refresh all data after check-in
      await Promise.all([
        fetchRooms(),
        fetchUpcomingBookings(),
        fetchCheckedInCustomers()
      ]);
    } catch (error) {
      console.error('Error during check-in:', error);
      alert('Error during check-in. Please ensure the room is available.');
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (window.confirm('Are you sure you want to cancel this booking?')) {
      try {
        await axios.post(`${API}/cancel/${bookingId}`);
        
        // Refresh data after cancellation
        await Promise.all([
          fetchRooms(),
          fetchUpcomingBookings()
        ]);
      } catch (error) {
        console.error('Error cancelling booking:', error);
        alert('Error cancelling booking. Please try again.');
      }
    }
  };

  const calculateTotal = () => {
    if (!selectedCustomer) return 0;
    const roomCharges = selectedCustomer.room_charges || 500;
    const restaurantCharges = selectedCustomer.restaurant_charges || 0;
    const advanceAmount = selectedCustomer.advance_amount || 0;
    const additionalAmount = parseFloat(checkoutData.additional_amount) || 0;
    const discountAmount = parseFloat(checkoutData.discount_amount) || 0;
    return roomCharges + restaurantCharges + additionalAmount - advanceAmount - discountAmount;
  };

  const handlePdfUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Only PDF files are allowed');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setNewBookingData(prev => ({
        ...prev,
        guest_id_proof: reader.result.split(',')[1], // base64 without prefix
        guest_id_proof_filename: file.name
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleNewBooking = async () => {
    try {
      // Validate required fields - only name, room, check-in date, and rate per night are required
      const requiredFields = ['guest_name', 'room_number', 'check_in_date'];
      const missingFields = requiredFields.filter(field => !newBookingData[field]);
      
      // For night stay, checkout date is required
      if (newBookingData.stay_type === 'Night Stay' && !newBookingData.check_out_date) {
        missingFields.push('check_out_date');
      }

      // Rate per night is required
      if (!newBookingData.rate_per_night || parseFloat(newBookingData.rate_per_night) <= 0) {
        missingFields.push('rate_per_night');
      }
      
      if (missingFields.length > 0) {
        alert('Please fill in all required fields (Name, Room, Dates, and Rate per Night)');
        return;
      }

      // Check if check-in date is in the past
      const today = new Date().toISOString().split('T')[0];
      const checkInDate = newBookingData.check_in_date;
      
      if (checkInDate < today) {
        // Past date detected - show status selection dialog
        setShowStatusSelectionModal(true);
        return;
      }

      // Future date - proceed with normal booking creation
      await createBookingWithStatus('Upcoming');
    } catch (error) {
      console.error('Error creating booking:', error);
      alert('Error creating booking. Please try again.');
    }
  };

  const createBookingWithStatus = async (status) => {
    try {
      // Prepare booking data - send the calculated booking_amount to backend
      const bookingData = {
        ...newBookingData,
        booking_amount: newBookingData.booking_amount, // This is the calculated total
        commission_amount: parseFloat(newBookingData.commission_amount) || 0,
        advance_amount: parseFloat(newBookingData.advance_amount) || 0,
        advance_payment_method: newBookingData.advance_payment_method || 'Cash',
        booking_status: status
      };

      // For Short Time bookings, ensure check_out_date is handled correctly
      if (newBookingData.stay_type === 'Short Time') {
        // For short time, don't send check_out_date - let backend handle it
        delete bookingData.check_out_date;
      } else if (bookingData.check_out_date === '') {
        // Convert empty string to null for proper backend handling
        bookingData.check_out_date = null;
      }

      await axios.post(`${API}/bookings`, bookingData);
      
      setShowNewBookingModal(false);
      setShowStatusSelectionModal(false);
      setSelectedBookingStatus('Upcoming');
      setNewBookingData({
        guest_name: '',
        guest_email: '',
        guest_phone: '',
        guest_country: '',
        guest_id_passport: '',
        guest_id_proof: '',
        guest_id_proof_filename: '',
        room_number: '',
        check_in_date: '',
        check_out_date: '',
        stay_type: 'Night Stay',
        rate_per_night: '',
        booking_amount: 0,
        advance_amount: 0,
        advance_payment_method: 'Cash',
        commission_amount: 0,
        booking_channel_id: '',
        booking_channel_name: 'Direct',
        additional_notes: ''
      });
      
      // Refresh data after adding booking
      await Promise.all([
        fetchRooms(),
        fetchUpcomingBookings(),
        fetchCheckedInCustomers() // Also refresh checked-in customers if status was "Checked In"
      ]);
      
      if (status === 'Checked In') {
        alert('Booking created and guest checked in successfully!');
      } else {
        alert('Booking added successfully!');
      }
    } catch (error) {
      console.error('Error creating booking:', error);
      alert('Error creating booking. Please try again.');
    }
  };

  const handleEditBooking = async () => {
    try {
      const response = await axios.put(`${API}/bookings/${selectedBooking.id}`, editBookingData);
      
      setShowEditBookingModal(false);
      setSelectedBooking(null);
      
      // Refresh data after editing booking
      await Promise.all([
        fetchUpcomingBookings(),
        fetchCheckedInCustomers(),
        fetchRooms() // Refresh rooms to update availability
      ]);
      
      // Show specific success message with changes made
      if (response.data.changes && response.data.changes.length > 0) {
        alert(`Booking updated successfully!\n\nChanges made:\n• ${response.data.changes.join('\n• ')}`);
      } else {
        alert('Booking updated successfully!');
      }
    } catch (error) {
      console.error('Error updating booking:', error);
      const errorMessage = error.response?.data?.detail || 'Error updating booking. Please try again.';
      alert(`Failed to update booking:\n\n${errorMessage}`);
    }
  };

  const openEditBookingModal = (booking) => {
    setSelectedBooking(booking);
    setEditBookingData({
      room_number: booking.room_number || '',
      check_in_date: booking.check_in_date,
      check_out_date: booking.check_out_date,
      additional_notes: booking.additional_notes || ''
    });
    
    // Get available rooms for the selected dates (excluding current room)
    const availableRooms = rooms.filter(room => 
      room.status !== 'Occupied' || room.room_number === booking.room_number
    );
    setAvailableRoomsForBooking(availableRooms);
    
    setShowEditBookingModal(true);
  };

  const openNewBookingModal = () => {
    // Initialize with all non-occupied rooms
    setAvailableRoomsForBooking(getAvailableRooms());
    
    // Set default dates: today for check-in, tomorrow for check-out
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    setNewBookingData(prev => ({
      ...prev,
      check_in_date: todayStr,
      check_out_date: tomorrowStr
    }));
    
    setShowNewBookingModal(true);
  };

  const getAvailableRooms = () => {
    // If dates are selected, we should check availability for those specific dates
    // For now, return all rooms except occupied ones
    // TODO: This should check against the room availability API for the selected dates
    return rooms.filter(room => room.status !== 'Occupied');
  };

  // Function to get available rooms for specific dates
  const getAvailableRoomsForDates = async (checkInDate, checkOutDate) => {
    if (!checkInDate || (newBookingData.stay_type === 'Night Stay' && !checkOutDate)) {
      return rooms.filter(room => room.status !== 'Occupied');
    }

    try {
      const params = new URLSearchParams({
        check_in_date: checkInDate,
        check_out_date: checkOutDate || checkInDate
      });
      
      const response = await axios.get(`${API}/rooms/availability/check?${params}`);
      return response.data.rooms || [];
    } catch (error) {
      console.error('Error checking room availability:', error);
      // Fallback to showing all non-occupied rooms
      return rooms.filter(room => room.status !== 'Occupied');
    }
  };

  const getRoomStatusColor = (status) => {
    switch (status) {
      case 'Available':
        return 'bg-green-100 border-green-500';
      case 'Occupied':
        return 'bg-red-100 border-red-500';
      case 'Booked':
        return 'bg-orange-100 border-orange-500';
      case 'Reserved':
        return 'bg-yellow-100 border-yellow-500';
      default:
        return 'bg-gray-100 border-gray-500';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Available':
        return '🟢';
      case 'Occupied':
        return '🔴';
      case 'Booked':
        return '🟠';
      case 'Reserved':
        return '🟡';
      default:
        return '⚪';
    }
  };

  // Function to get room status including booked status
  const getRoomDisplayStatus = (room) => {
    // If room is already Occupied, return Occupied
    if (room.status === 'Occupied') {
      return 'Occupied';
    }
    
    // Check if room has bookings for today
    const today = new Date().toISOString().split('T')[0];
    const roomBookings = upcomingBookings.filter(booking => 
      booking.room_number === room.room_number &&
      booking.check_in_date === today
    );
    
    // If there are bookings for today and room is available, mark as Booked
    if (roomBookings.length > 0 && room.status === 'Available') {
      return 'Booked';
    }
    
    // Otherwise return the original status
    return room.status;
  };

  const handlePrintInvoice = () => {
    const printWindow = window.open('', '_blank');
    const invoiceHTML = generateInvoiceHTML();
    printWindow.document.write(invoiceHTML);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
    setShowPrintInvoiceDialog(false);
    setSelectedCustomer(null);
  };

  const generateInvoiceHTML = () => {
    if (!invoiceData) return '';
    
    const { customer, billing, hotel_settings } = invoiceData;
    const settings = hotel_settings || hotelSettings; // Fallback to component settings
    const currentDate = new Date().toLocaleString();
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice - ${customer.name}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
          .header { display: flex; align-items: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
          .logo { width: 80px; height: 80px; margin-right: 20px; object-fit: contain; }
          .hotel-info h1 { margin: 0; font-size: 24px; color: #2563eb; }
          .hotel-info p { margin: 2px 0; font-size: 14px; color: #666; }
          .invoice-details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
          .section { background: #f8f9fa; padding: 15px; border-radius: 8px; }
          .section h3 { margin: 0 0 10px 0; color: #1f2937; font-size: 16px; }
          .billing-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .billing-table th, .billing-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          .billing-table th { background: #f3f4f6; font-weight: 600; }
          .total-row { font-weight: bold; background: #dbeafe; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          ${settings.hotel_logo ? `<img src="${settings.hotel_logo}" alt="Hotel Logo" class="logo" />` : ''}
          <div class="hotel-info">
            <h1>${settings.hotel_name || 'Hotel Management System'}</h1>
            <p><strong>Address:</strong> ${settings.hotel_address || 'Hotel Address'}</p>
            <p><strong>Phone:</strong> ${settings.hotel_phone || settings.hotel_contact || 'Contact Number'}</p>
            <p><strong>Email:</strong> ${settings.hotel_email || 'hotel@email.com'}</p>
          </div>
        </div>

        <h2 style="text-align: center; color: #1f2937; margin: 20px 0;">CHECKOUT INVOICE</h2>

        <div class="invoice-details">
          <div class="section">
            <h3>Guest Information</h3>
            <p><strong>Name:</strong> ${customer.name}</p>
            <p><strong>Phone:</strong> ${customer.phone || 'N/A'}</p>
            <p><strong>Room:</strong> ${customer.current_room}</p>
            <p><strong>Check-in:</strong> ${customer.check_in_date}</p>
            <p><strong>Check-out:</strong> ${customer.check_out_date}</p>
          </div>
          
          <div class="section">
            <h3>Invoice Details</h3>
            <p><strong>Invoice Date:</strong> ${currentDate}</p>
            <p><strong>Payment Method:</strong> ${billing.payment_method}</p>
            <p><strong>Currency:</strong> ${settings.currency || 'LKR'}</p>
          </div>
        </div>

        <table class="billing-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Amount (${settings.currency || 'LKR'})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Room Charges</td>
              <td>${billing.room_charges.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Additional Charges</td>
              <td>${billing.additional_charges.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Advance Amount (Paid)</td>
              <td>(${billing.advance_amount.toFixed(2)})</td>
            </tr>
            <tr>
              <td>Discount</td>
              <td>(${billing.discount_amount.toFixed(2)})</td>
            </tr>
            <tr class="total-row">
              <td><strong>Total Amount</strong></td>
              <td><strong>${billing.total_amount.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <p>Thank you for choosing ${settings.hotel_name || 'our hotel'}!</p>
          <p>This is a computer-generated invoice.</p>
        </div>
      </body>
      </html>
    `;
  };

  const closePrintInvoiceDialog = () => {
    setShowPrintInvoiceDialog(false);
    setSelectedCustomer(null);
    setInvoiceData(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* Header - Gradient Style */}
      <div className="bg-gradient-to-r from-blue-800 to-cyan-700 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Dashboard</h2>
            <p className="text-blue-200">Overview of hotel operations and current status</p>
          </div>
          <button
            onClick={openNewBookingModal}
            className="bg-white text-blue-800 px-4 py-2 rounded-lg hover:bg-blue-100 flex items-center font-medium"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            New Booking
          </button>
        </div>
      </div>

      {/* Room Status - Quick View */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Room Status - Quick View</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {rooms.map((room) => {
            const displayStatus = getRoomDisplayStatus(room);
            return (
              <div
                key={room.id}
                className={`p-4 rounded-lg border-2 ${getRoomStatusColor(displayStatus)} shadow-sm hover:shadow-md transition-shadow`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-lg font-bold text-gray-900">{room.room_number}</h4>
                  <span className="text-lg">{getStatusIcon(displayStatus)}</span>
                </div>
                <p className="text-sm text-gray-600 mb-1">{room.room_type}</p>
                <p className={`text-sm font-medium ${
                  displayStatus === 'Available' ? 'text-green-700' :
                  displayStatus === 'Occupied' ? 'text-red-700' :
                  displayStatus === 'Booked' ? 'text-orange-700' :
                  'text-yellow-700'
                }`}>
                  {displayStatus}
                </p>
                {room.current_guest && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-500">Guest: {room.current_guest}</p>
                    {room.check_out_date && (
                      <p className="text-xs text-gray-500">Out: {room.check_out_date}</p>
                    )}
                  </div>
                )}
                {displayStatus === 'Booked' && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-xs text-orange-600 font-medium">Check-in today</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Room Availability Checker */}
      <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow mb-6 sm:mb-8">
        <h3 className="text-base sm:text-lg font-semibold text-white mb-4">🔍 Check Room Availability</h3>
        <p className="text-sm text-gray-300 mb-4">Select dates to check which rooms are available for booking</p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Check-in Date</label>
            <input
              type="date"
              value={availabilityDates.check_in_date}
              onChange={(e) => handleDateChange('check_in_date', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Check-out Date</label>
            <input
              type="date"
              value={availabilityDates.check_out_date}
              onChange={(e) => handleDateChange('check_out_date', e.target.value)}
              min={availabilityDates.check_in_date || new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <button
              onClick={checkRoomAvailability}
              disabled={checkingAvailability || !availabilityDates.check_in_date || !availabilityDates.check_out_date}
              className={`w-full px-4 py-2 rounded-md font-medium text-sm ${
                checkingAvailability || !availabilityDates.check_in_date || !availabilityDates.check_out_date
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {checkingAvailability ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Checking...
                </div>
              ) : (
                'Check Availability'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Upcoming Bookings */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white" data-testid="upcoming-bookings-title">
            Upcoming Bookings {upcomingBookings.length > 0 && <span className="text-sm font-normal text-gray-400">({upcomingBookings.length} total)</span>}
          </h3>
        </div>
        <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 overflow-x-auto" style={{minHeight: '300px'}}>
          {upcomingBookings.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              No upcoming bookings
            </div>
          ) : (
            <>
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Guest</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Room</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider hidden sm:table-cell">Check-in</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider hidden sm:table-cell">Check-out</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider hidden md:table-cell">Contact</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {upcomingBookings.slice((upcomingBookingsPage - 1) * 10, upcomingBookingsPage * 10).map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-700">
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <div className="text-xs sm:text-sm font-medium text-white">{booking.guest_name}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <div className="text-xs sm:text-sm text-white">{booking.room_number}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden sm:table-cell">
                      <div className="text-sm text-white">{booking.check_in_date}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden sm:table-cell">
                      <div className="text-sm text-white">{booking.check_out_date}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden md:table-cell">
                      <div className="text-sm text-white">{booking.guest_phone}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap relative">
                      <button
                        onClick={() => toggleDropdown(booking.id)}
                        className="inline-flex items-center p-1.5 sm:p-2 text-gray-400 bg-gray-700 rounded-full hover:text-gray-200 hover:bg-gray-600"
                      >
                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
                        </svg>
                      </button>
                      {openDropdowns[booking.id] && (
                        <div className="absolute right-0 z-50 mt-2 w-48 bg-gray-700 rounded-md shadow-lg ring-1 ring-black ring-opacity-5">
                          <div className="py-1">
                            <button
                              onClick={() => { handleCheckin(booking); closeAllDropdowns(); }}
                              className="flex w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                            >
                              <svg className="w-4 h-4 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                              </svg>
                              Check In
                            </button>
                            <button
                              onClick={() => { openEditBookingModal(booking); closeAllDropdowns(); }}
                              className="flex w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                            >
                              <svg className="w-4 h-4 mr-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                              </svg>
                              Edit
                            </button>
                            <button
                              onClick={() => { handleCancelBooking(booking.id); closeAllDropdowns(); }}
                              className="flex w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                            >
                              <svg className="w-4 h-4 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                              </svg>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Pagination for upcoming bookings */}
            {upcomingBookings.length > 10 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700" data-testid="upcoming-bookings-pagination">
                <span className="text-sm text-gray-400">
                  Showing {((upcomingBookingsPage - 1) * 10) + 1}-{Math.min(upcomingBookingsPage * 10, upcomingBookings.length)} of {upcomingBookings.length}
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setUpcomingBookingsPage(p => Math.max(1, p - 1))}
                    disabled={upcomingBookingsPage === 1}
                    className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="upcoming-bookings-prev"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-300">
                    Page {upcomingBookingsPage} / {Math.ceil(upcomingBookings.length / 10)}
                  </span>
                  <button
                    onClick={() => setUpcomingBookingsPage(p => Math.min(Math.ceil(upcomingBookings.length / 10), p + 1))}
                    disabled={upcomingBookingsPage >= Math.ceil(upcomingBookings.length / 10)}
                    className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="upcoming-bookings-next"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </div>
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-white mb-4">Checked-in Customers</h3>
        <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 overflow-x-auto">
          {checkedInCustomers.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              No customers currently checked in
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Room</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider hidden sm:table-cell">Check-in</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider hidden md:table-cell">Check-out</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider hidden lg:table-cell">Contact</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {checkedInCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-700">
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <div className="text-xs sm:text-sm font-medium text-white">{customer.name}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <div className="text-xs sm:text-sm text-white">{customer.current_room}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden sm:table-cell">
                      <div className="text-sm text-white">{customer.check_in_date}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden md:table-cell">
                      <div className="text-sm text-white">{customer.check_out_date}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden lg:table-cell">
                      <div className="text-sm text-white">{customer.phone}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap relative">
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <button
                          onClick={() => handleCheckout(customer)}
                          className="bg-red-600 text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm hover:bg-red-700"
                        >
                          Checkout
                        </button>
                        <button
                          onClick={() => toggleCustomerDropdown(customer.id)}
                          className="bg-gray-600 text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm hover:bg-gray-700 flex items-center"
                        >
                          <span className="hidden sm:inline">Actions</span>
                          <svg className="w-4 h-4 sm:ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                      {openCustomerDropdowns[customer.id] && (
                        <div className="absolute right-0 z-50 mt-2 w-52 bg-gray-700 rounded-md shadow-lg border border-gray-600">
                          <div className="py-1">
                            <button
                              onClick={async () => {
                                try {
                                  const allBookingsResponse = await axios.get(`${API}/bookings`);
                                  const allBookings = allBookingsResponse.data.bookings || [];
                                  const booking = allBookings.find(b => 
                                    b.guest_name === customer.name && 
                                    b.room_number === customer.current_room &&
                                    (b.status === 'Checked-in' || b.status === 'Checked In')
                                  );
                                  if (booking) {
                                    openEditBookingModal(booking);
                                  } else {
                                    alert('Unable to find booking record.');
                                  }
                                  closeAllCustomerDropdowns();
                                } catch (error) {
                                  alert('Error finding booking record.');
                                  closeAllCustomerDropdowns();
                                }
                              }}
                              className="flex w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                            >
                              <svg className="w-4 h-4 mr-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                              </svg>
                              Edit Booking
                            </button>
                            <button
                              onClick={() => { handleAdvancePayment(customer); closeAllCustomerDropdowns(); }}
                              className="flex w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                            >
                              <svg className="w-4 h-4 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"/>
                              </svg>
                              Get Advance
                            </button>
                            <button
                              onClick={() => { handleExtendStay(customer); closeAllCustomerDropdowns(); }}
                              className="flex w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                            >
                              <svg className="w-4 h-4 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                              </svg>
                              Extend Stay
                            </button>
                            <button
                              onClick={() => { handleEarlyCheckout(customer); closeAllCustomerDropdowns(); }}
                              className="flex w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                            >
                              <svg className="w-4 h-4 mr-3 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                              </svg>
                              Early Checkout
                            </button>
                            {user?.role === 'Admin' && (
                              <button
                                onClick={() => { handleCancelBookingForCustomer(customer); closeAllCustomerDropdowns(); }}
                                className="flex w-full px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                              >
                                <svg className="w-4 h-4 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                                Cancel Booking
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Rooms to be Cleaned - Collapsible Section */}
      <div className="mb-8">
        <button
          onClick={() => setCleaningSectionExpanded(!cleaningSectionExpanded)}
          className="w-full flex justify-between items-center text-lg font-semibold text-white mb-4 hover:text-gray-300 transition-colors"
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            Rooms to be Cleaned
            {roomsPendingCleaning.length > 0 && (
              <span className="ml-2 bg-rose-500 text-white text-xs px-2 py-1 rounded-full">{roomsPendingCleaning.length}</span>
            )}
          </div>
          <svg className={`w-5 h-5 transform transition-transform ${cleaningSectionExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {cleaningSectionExpanded && (
          <div className="bg-rose-900/20 rounded-lg shadow-sm border border-rose-700/50 overflow-hidden" style={{minHeight: '400px'}}>
            <div className="p-4 border-b border-rose-700/50 flex justify-between items-center">
              <span className="text-gray-300 text-sm">
                {roomsPendingCleaning.length === 0 ? 'All rooms are clean!' : `${roomsPendingCleaning.length} room(s) need cleaning`}
              </span>
              <button
                onClick={() => setShowAddStaffModal(true)}
                className="bg-rose-600 text-white px-3 py-1 rounded text-sm hover:bg-rose-700 flex items-center"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Staff
              </button>
            </div>
            
            {roomsPendingCleaning.length === 0 ? (
              <div className="p-6 text-center text-gray-400 flex flex-col items-center justify-center" style={{minHeight: '320px'}}>
                <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M5 13l4 4L19 7" />
                </svg>
                <p>No rooms pending cleaning</p>
              </div>
            ) : (
              <div className="divide-y divide-rose-700/30">
                {roomsPendingCleaning.map((room) => (
                  <div key={room.room_number} className="p-4 flex items-center justify-between hover:bg-rose-800/20">
                    <div className="flex items-center space-x-4">
                      <div className="bg-rose-600/30 p-3 rounded-lg">
                        <svg className="w-6 h-6 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-white font-medium">Room {room.room_number}</p>
                        <p className="text-gray-400 text-sm">{room.room_type}</p>
                        <p className="text-gray-500 text-xs">Last guest: {room.last_guest}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      {room.assignment ? (
                        <div className="text-right mr-4">
                          <p className="text-green-400 text-sm font-medium">{room.assignment.staff_name}</p>
                          <p className="text-gray-500 text-xs">Assigned</p>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setSelectedCleaningRoom(room); setShowAssignStaffModal(true); }}
                          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
                        >
                          Assign Staff
                        </button>
                      )}
                      <button
                        onClick={() => handleMarkRoomCleaned(room.room_number)}
                        className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700 flex items-center"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Room Cleaned
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Assign Staff Modal */}
      {showAssignStaffModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Assign Cleaning Staff</h3>
            {selectedCleaningRoom && (
              <p className="text-sm text-gray-600 mb-4">Room: {selectedCleaningRoom.room_number}</p>
            )}
            
            {cleaningStaff.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-500 mb-4">No cleaning staff available</p>
                <button
                  onClick={() => { setShowAssignStaffModal(false); setShowAddStaffModal(true); }}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Add Staff Member
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {cleaningStaff.map((staff) => (
                  <button
                    key={staff.id}
                    onClick={() => handleAssignStaff(staff.id)}
                    className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center">
                      <div className="bg-blue-100 p-2 rounded-full mr-3">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-800">{staff.name}</p>
                        {staff.phone && <p className="text-sm text-gray-500">{staff.phone}</p>}
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
            
            <div className="flex justify-end mt-6">
              <button
                onClick={() => { setShowAssignStaffModal(false); setSelectedCleaningRoom(null); }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Cleaning Staff Modal */}
      {showAddStaffModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Cleaning Staff</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Staff Name *</label>
                <input
                  type="text"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter phone number"
                />
              </div>
            </div>
            
            {/* Existing Staff List */}
            {cleaningStaff.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-2">Existing Staff</p>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {cleaningStaff.map((staff) => (
                    <div key={staff.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm">{staff.name}</span>
                      <button
                        onClick={() => handleDeleteCleaningStaff(staff.id)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => { setShowAddStaffModal(false); setNewStaffName(''); setNewStaffPhone(''); }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCleaningStaff}
                disabled={!newStaffName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                Add Staff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Check-in Modal */}
      {showCheckinModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" data-testid="checkin-modal">
            <h3 className="text-lg font-semibold text-white mb-4">Check In Customer</h3>
            {selectedBooking && (
              <div className="mb-4 space-y-2">
                <p className="text-sm text-gray-400">Guest: <span className="font-medium text-white">{selectedBooking.guest_name}</span></p>
                <p className="text-sm text-gray-400">Booked Room: <span className="font-medium text-white">{selectedBooking.room_number}</span></p>
                <p className="text-sm text-gray-400">Phone: <span className="font-medium text-white">{selectedBooking.guest_phone}</span></p>
                <p className="text-sm text-gray-400">Check-in: <span className="font-medium text-white">{selectedBooking.check_in_date}</span></p>
                <p className="text-sm text-gray-400">Check-out: <span className="font-medium text-white">{selectedBooking.check_out_date}</span></p>
                
                {/* Booking Amount Summary */}
                <div className="mt-3 pt-3 border-t border-gray-700 bg-blue-900/30 rounded-md p-3">
                  <h4 className="font-medium text-blue-300 mb-2">Booking Amount</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Rate per Night:</span>
                      <span className="font-medium text-white">LKR {(selectedBooking.rate_per_night || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Room Charges:</span>
                      <span className="font-medium text-white">LKR {(selectedBooking.booking_amount || 0).toLocaleString()}</span>
                    </div>
                    {selectedBooking.commission_amount > 0 && (
                      <div className="flex justify-between text-orange-400">
                        <span>Commission ({selectedBooking.booking_channel_name}):</span>
                        <span>LKR {selectedBooking.commission_amount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-4">
              {/* Room Change Option */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Change Room (Optional)
                </label>
                <select
                  value={checkinData.new_room_number}
                  onChange={(e) => setCheckinData({...checkinData, new_room_number: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="checkin-room-change"
                >
                  <option value="">Keep original room ({selectedBooking?.room_number})</option>
                  {rooms.filter(r => r.status === 'Available' && r.room_number !== selectedBooking?.room_number).map(r => (
                    <option key={r.room_number} value={r.room_number}>
                      Room {r.room_number} - {r.room_type || 'Standard'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Select a different available room if guest prefers</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Advance Amount (LKR)
                </label>
                <input
                  type="number"
                  value={checkinData.advance_amount}
                  onChange={(e) => setCheckinData({...checkinData, advance_amount: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Payment Method
                </label>
                <select
                  value={checkinData.payment_method}
                  onChange={(e) => setCheckinData({...checkinData, payment_method: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={checkinData.notes}
                  onChange={(e) => setCheckinData({...checkinData, notes: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Any special notes..."
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCheckinModal(false)}
                className="px-4 py-2 text-gray-300 border border-gray-600 rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmCheckin}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                data-testid="confirm-checkin-btn"
              >
                Confirm Check In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Checkout Customer</h3>
            {selectedCustomer && (
              <div className="mb-4">
                <p className="text-sm text-gray-600">Guest: {selectedCustomer.name}</p>
                <p className="text-sm text-gray-600">Room: {selectedCustomer.current_room}</p>
                <p className="text-sm text-gray-600">Phone: {selectedCustomer.phone}</p>
              </div>
            )}
            
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-md">
                <h4 className="font-medium text-gray-800 mb-2">Billing Details</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Room Charges:</span>
                    <span>LKR {(selectedCustomer?.room_charges || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Restaurant Charges:</span>
                    <span>LKR {(selectedCustomer?.restaurant_charges || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Additional Charges:</span>
                    <span>LKR {(parseFloat(checkoutData.additional_amount) || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>Discount:</span>
                    <span>-LKR {(parseFloat(checkoutData.discount_amount) || 0).toLocaleString()}</span>
                  </div>
                  <hr className="my-2" />
                  <div className="flex justify-between font-medium">
                    <span>Subtotal:</span>
                    <span>LKR {(
                      (selectedCustomer?.room_charges || 0) +
                      (selectedCustomer?.restaurant_charges || 0) +
                      (parseFloat(checkoutData.additional_amount) || 0) -
                      (parseFloat(checkoutData.discount_amount) || 0)
                    ).toLocaleString()}</span>
                  </div>
                  
                  {/* Tax Breakdown */}
                  {checkoutTaxPreview && checkoutTaxPreview.breakdown && checkoutTaxPreview.breakdown.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-500 mb-1">Applicable Taxes:</p>
                      {checkoutTaxPreview.breakdown.map((tax, idx) => (
                        <div key={idx} className="flex justify-between text-orange-700">
                          <span>{tax.name} ({tax.rate}%):</span>
                          <span>LKR {tax.amount.toLocaleString()}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-medium text-orange-800 mt-1">
                        <span>Total Taxes:</span>
                        <span>LKR {checkoutTaxPreview.total_tax.toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-between text-green-600">
                    <span>Advance Paid:</span>
                    <span>-LKR {(selectedCustomer?.advance_amount || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Amount (LKR)
                </label>
                <input
                  type="number"
                  value={checkoutData.additional_amount}
                  onChange={(e) => {
                    setCheckoutData({...checkoutData, additional_amount: e.target.value});
                    // Recalculate taxes with debounce
                    const roomCharges = selectedCustomer?.room_charges || 0;
                    const additionalAmount = parseFloat(e.target.value) || 0;
                    const discountAmount = parseFloat(checkoutData.discount_amount) || 0;
                    recalculateCheckoutTaxes(roomCharges, additionalAmount, discountAmount);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discount Amount (LKR)
                </label>
                <input
                  type="number"
                  value={checkoutData.discount_amount}
                  onChange={(e) => {
                    setCheckoutData({...checkoutData, discount_amount: e.target.value});
                    // Recalculate taxes with debounce
                    const roomCharges = selectedCustomer?.room_charges || 0;
                    const additionalAmount = parseFloat(checkoutData.additional_amount) || 0;
                    const discountAmount = parseFloat(e.target.value) || 0;
                    recalculateCheckoutTaxes(roomCharges, additionalAmount, discountAmount);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <select
                  value={checkoutData.payment_method}
                  onChange={(e) => setCheckoutData({...checkoutData, payment_method: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              {/* Balance Payable - Real-time Display with Taxes */}
              <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm font-medium text-green-700 mb-1">Total Amount Payable (incl. Taxes)</p>
                    <p className={`text-3xl font-bold ${
                      (calculateTotal() + (checkoutTaxPreview?.total_tax || 0)) >= 0 ? 'text-green-800' : 'text-red-600'
                    }`}>
                      LKR {Math.abs(calculateTotal() + (checkoutTaxPreview?.total_tax || 0)).toFixed(2)}
                    </p>
                    {(calculateTotal() + (checkoutTaxPreview?.total_tax || 0)) < 0 && (
                      <p className="text-xs text-red-600 mt-1">Refund Due to Customer</p>
                    )}
                    {(calculateTotal() + (checkoutTaxPreview?.total_tax || 0)) >= 0 && (
                      <p className="text-xs text-green-600 mt-1">Amount to Collect</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCheckoutModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmCheckout}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Confirm Checkout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advance Payment Modal */}
      {showAdvancePaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Collect Advance Payment</h3>
            {selectedCustomer && (
              <div className="mb-4 bg-gray-50 p-3 rounded-md">
                <p className="text-sm text-gray-600"><strong>Guest:</strong> {selectedCustomer.name}</p>
                <p className="text-sm text-gray-600"><strong>Room:</strong> {selectedCustomer.current_room}</p>
                <p className="text-sm text-gray-600"><strong>Rate per Night:</strong> LKR {Math.round(selectedCustomer.rate_per_night || 0).toLocaleString()}</p>
                <hr className="my-2" />
                <p className="text-sm text-gray-700"><strong>Room Charges:</strong> LKR {(selectedCustomer.room_charges || 0).toLocaleString()}</p>
                <p className="text-sm text-gray-700"><strong>Restaurant Charges:</strong> LKR {(selectedCustomer.restaurant_charges || 0).toLocaleString()}</p>
                <p className="text-sm text-gray-700"><strong>Total Balance:</strong> LKR {((selectedCustomer.room_charges || 0) + (selectedCustomer.restaurant_charges || 0)).toLocaleString()}</p>
                <hr className="my-2" />
                <p className="text-sm text-green-600"><strong>Advance Paid:</strong> LKR {(selectedCustomer.advance_amount || 0).toLocaleString()}</p>
                <p className="text-sm font-semibold text-blue-700"><strong>Balance Due:</strong> LKR {((selectedCustomer.room_charges || 0) + (selectedCustomer.restaurant_charges || 0) - (selectedCustomer.advance_amount || 0)).toLocaleString()}</p>
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount to Collect *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={advancePaymentData.amount}
                  onChange={(e) => setAdvancePaymentData({...advancePaymentData, amount: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter amount"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <select
                  value={advancePaymentData.payment_method}
                  onChange={(e) => setAdvancePaymentData({...advancePaymentData, payment_method: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={advancePaymentData.notes}
                  onChange={(e) => setAdvancePaymentData({...advancePaymentData, notes: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add any notes about this advance payment"
                  rows="3"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAdvancePaymentModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmAdvancePayment}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Collect Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Stay Modal */}
      {showExtendStayModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-purple-700">Extend Stay</h3>
            <div className="mb-4 bg-gray-50 p-3 rounded-md">
              <p className="text-sm text-gray-600"><strong>Guest:</strong> {selectedCustomer.name}</p>
              <p className="text-sm text-gray-600"><strong>Room:</strong> {selectedCustomer.current_room}</p>
              <p className="text-sm text-gray-600"><strong>Check-in:</strong> {selectedCustomer.check_in_date}</p>
              <p className="text-sm text-gray-600"><strong>Current Checkout:</strong> {selectedCustomer.check_out_date}</p>
              <hr className="my-2" />
              <p className="text-sm text-purple-700"><strong>Rate per Night:</strong> LKR {Math.round(selectedCustomer.rate_per_night || 0).toLocaleString()}</p>
              <p className="text-sm text-gray-600"><strong>Current Charges:</strong> LKR {(selectedCustomer.room_charges || 0).toLocaleString()}</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Checkout Date *
                </label>
                <input
                  type="date"
                  value={extendStayData.new_checkout_date}
                  min={new Date(new Date(selectedCustomer.check_out_date).getTime() + 86400000).toISOString().split('T')[0]}
                  onChange={(e) => setExtendStayData({...extendStayData, new_checkout_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Additional charges will be calculated at LKR {Math.round(selectedCustomer.rate_per_night || 0).toLocaleString()} per night</p>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => { setShowExtendStayModal(false); setSelectedCustomer(null); }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmExtendStay}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
              >
                Extend Stay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Early Checkout Modal */}
      {showEarlyCheckoutModal && selectedCustomer && earlyCheckoutPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 text-yellow-700">Early Checkout</h3>
            
            {/* Guest Info */}
            <div className="mb-4 bg-yellow-50 p-3 rounded-md border border-yellow-200">
              <p className="text-sm"><strong>Guest:</strong> {earlyCheckoutPreview.customer_name}</p>
              <p className="text-sm"><strong>Room:</strong> {earlyCheckoutPreview.room_number}</p>
              <p className="text-sm"><strong>Check-in:</strong> {earlyCheckoutPreview.check_in_date}</p>
              <p className="text-sm"><strong>Planned Checkout:</strong> {earlyCheckoutPreview.planned_checkout_date}</p>
              <p className="text-sm"><strong>Actual Checkout:</strong> {earlyCheckoutPreview.actual_checkout_date} <span className="text-yellow-600 font-medium">({earlyCheckoutPreview.days_early} days early)</span></p>
            </div>
            
            {/* Charges Breakdown */}
            <div className="mb-4 bg-gray-50 p-3 rounded-md">
              <h4 className="font-medium mb-2">Charges Breakdown</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Actual nights stayed:</span>
                  <span>{earlyCheckoutPreview.actual_nights} nights × LKR {Math.round(earlyCheckoutPreview.price_per_night).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Room charges:</span>
                  <span>LKR {Math.round(earlyCheckoutPreview.actual_room_charges).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Restaurant charges:</span>
                  <span>LKR {Math.round(earlyCheckoutPreview.restaurant_charges || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Additional charges:</span>
                  <span>LKR {Math.round(parseFloat(earlyCheckoutData.additional_amount) || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Discount:</span>
                  <span>-LKR {Math.round(parseFloat(earlyCheckoutData.discount_amount) || 0).toLocaleString()}</span>
                </div>
                <hr className="my-2" />
                <div className="flex justify-between font-medium">
                  <span>Total Due:</span>
                  <span>LKR {Math.round(
                    earlyCheckoutPreview.actual_room_charges + 
                    (earlyCheckoutPreview.restaurant_charges || 0) + 
                    (parseFloat(earlyCheckoutData.additional_amount) || 0) - 
                    (parseFloat(earlyCheckoutData.discount_amount) || 0)
                  ).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>Advance paid:</span>
                  <span>-LKR {Math.round(earlyCheckoutPreview.advance_amount || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            {/* Final Balance - Collection or Refund */}
            {(() => {
              const totalDue = earlyCheckoutPreview.actual_room_charges + 
                (earlyCheckoutPreview.restaurant_charges || 0) + 
                (parseFloat(earlyCheckoutData.additional_amount) || 0) - 
                (parseFloat(earlyCheckoutData.discount_amount) || 0);
              const advancePaid = earlyCheckoutPreview.advance_amount || 0;
              const finalBalance = totalDue - advancePaid;
              
              if (finalBalance > 0) {
                return (
                  <div className="mb-4 bg-blue-50 p-4 rounded-md border border-blue-200">
                    <div className="text-center">
                      <p className="text-sm text-blue-600 mb-1">Amount to Collect</p>
                      <p className="text-2xl font-bold text-blue-700">LKR {Math.round(finalBalance).toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-1">Customer owes this amount</p>
                    </div>
                  </div>
                );
              } else if (finalBalance < 0) {
                return (
                  <div className="mb-4 bg-green-50 p-4 rounded-md border border-green-200">
                    <div className="text-center">
                      <p className="text-sm text-green-600 mb-1">Refund Due</p>
                      <p className="text-2xl font-bold text-green-700">LKR {Math.round(Math.abs(finalBalance)).toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-1">Customer has overpaid</p>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div className="mb-4 bg-gray-100 p-4 rounded-md border border-gray-200">
                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-1">Balance</p>
                      <p className="text-2xl font-bold text-gray-700">LKR 0</p>
                      <p className="text-xs text-gray-500 mt-1">No collection or refund needed</p>
                    </div>
                  </div>
                );
              }
            })()}
            
            {/* Additional Options */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional Charges</label>
                  <input
                    type="number"
                    step="0.01"
                    value={earlyCheckoutData.additional_amount}
                    onChange={(e) => setEarlyCheckoutData({...earlyCheckoutData, additional_amount: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Discount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={earlyCheckoutData.discount_amount}
                    onChange={(e) => setEarlyCheckoutData({...earlyCheckoutData, discount_amount: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              {/* Payment method - only show for refunds */}
              {(() => {
                const totalDue = earlyCheckoutPreview.actual_room_charges + 
                  (earlyCheckoutPreview.restaurant_charges || 0) + 
                  (parseFloat(earlyCheckoutData.additional_amount) || 0) - 
                  (parseFloat(earlyCheckoutData.discount_amount) || 0);
                const advancePaid = earlyCheckoutPreview.advance_amount || 0;
                const finalBalance = totalDue - advancePaid;
                
                if (finalBalance < 0) {
                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Refund Method</label>
                      <select
                        value={earlyCheckoutData.payment_method}
                        onChange={(e) => setEarlyCheckoutData({...earlyCheckoutData, payment_method: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                      </select>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => { setShowEarlyCheckoutModal(false); setSelectedCustomer(null); setEarlyCheckoutPreview(null); }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmEarlyCheckout}
                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
              >
                Confirm Early Checkout
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Payment Collection Modal (for early checkout when customer owes money) */}
      {showPaymentCollectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4 text-blue-700">Collect Payment</h3>
            <div className="mb-4 bg-blue-50 p-4 rounded-md border border-blue-200">
              <p className="text-center">
                <span className="text-sm text-blue-600">Amount to Collect</span><br />
                <span className="text-2xl font-bold text-blue-700">LKR {paymentCollectionData.amount.toLocaleString()}</span>
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  value={paymentCollectionData.payment_method}
                  onChange={(e) => setPaymentCollectionData({...paymentCollectionData, payment_method: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowPaymentCollectionModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => processEarlyCheckout(paymentCollectionData.payment_method, paymentCollectionData.amount)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Confirm Collection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Booking Modal */}
      {showNewBookingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="new-booking-modal">
            <h3 className="text-lg font-semibold text-white mb-4">Create New Booking</h3>
            
            <div className="grid grid-cols-2 gap-6">
              {/* Left Column - Guest Information */}
              <div className="space-y-4">
                <h4 className="text-md font-medium text-gray-300 border-b border-gray-600 pb-2">Guest Information</h4>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Guest Name *</label>
                  <input
                    type="text"
                    value={newBookingData.guest_name}
                    onChange={(e) => setNewBookingData({...newBookingData, guest_name: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter guest name"
                    required
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={newBookingData.guest_email}
                      onChange={(e) => setNewBookingData({...newBookingData, guest_email: e.target.value})}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="Email (optional)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={newBookingData.guest_phone}
                      onChange={(e) => setNewBookingData({...newBookingData, guest_phone: e.target.value})}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="Phone (optional)"
                    />
                  </div>
                </div>
                
                {/* ID/Passport and Country in same row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">ID/Passport Number</label>
                    <input
                      type="text"
                      value={newBookingData.guest_id_passport}
                      onChange={(e) => setNewBookingData({...newBookingData, guest_id_passport: e.target.value})}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="ID/Passport number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Country</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={newBookingData.guest_country}
                        onChange={(e) => setNewBookingData({...newBookingData, guest_country: e.target.value})}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                        placeholder="Type country..."
                        list="country-list"
                      />
                      <datalist id="country-list">
                        {COUNTRIES.filter(country => 
                          country.toLowerCase().includes((newBookingData.guest_country || '').toLowerCase())
                        ).map(country => (
                          <option key={country} value={country} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                </div>

                {/* ID Proof Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Upload ID / Passport (PDF)</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handlePdfUpload}
                    className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                    data-testid="booking-pdf-upload"
                  />
                  {newBookingData.guest_id_proof_filename && (
                    <div className="mt-1 flex items-center text-xs text-green-400">
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      {newBookingData.guest_id_proof_filename}
                      <button type="button" onClick={() => setNewBookingData(prev => ({...prev, guest_id_proof: '', guest_id_proof_filename: ''}))} className="ml-2 text-red-400 hover:text-red-300">Remove</button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">Max 5MB PDF file</p>
                </div>
              </div>
              
              {/* Right Column - Booking Details */}
              <div className="space-y-4">
                <h4 className="text-md font-medium text-gray-300 border-b border-gray-600 pb-2">Booking Details</h4>
                
                {/* Stay Type and Booking Channel in same row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Stay Type *</label>
                    <select
                      value={newBookingData.stay_type}
                      onChange={(e) => handleBookingFieldChange('stay_type', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="Night Stay">Night Stay</option>
                      <option value="Short Time">Short Time</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Booking Channel *</label>
                    <select
                      value={newBookingData.booking_channel_id}
                      onChange={(e) => {
                        const selectedChannel = availableChannels.find(ch => ch.id === e.target.value);
                        const updatedData = {
                          ...newBookingData, 
                          booking_channel_id: e.target.value,
                          booking_channel_name: selectedChannel ? selectedChannel.channel_name : 'Direct'
                        };
                        // Auto-calculate commission if channel has auto_rate
                        if (selectedChannel && selectedChannel.auto_rate !== false && selectedChannel.commission_rate > 0 && updatedData.booking_amount > 0) {
                          updatedData.commission_amount = parseFloat((updatedData.booking_amount * selectedChannel.commission_rate / 100).toFixed(2));
                        } else if (!selectedChannel) {
                          updatedData.commission_amount = 0;
                        }
                        setNewBookingData(updatedData);
                      }}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Direct</option>
                      {availableChannels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {channel.channel_name} ({channel.commission_rate}%)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Check-in Date *</label>
                    <input
                      type="date"
                      value={newBookingData.check_in_date}
                      onChange={(e) => {
                        handleBookingFieldChange('check_in_date', e.target.value);
                        // Auto-set checkout to next day
                        if (e.target.value && newBookingData.stay_type === 'Night Stay') {
                          const nextDay = new Date(e.target.value);
                          nextDay.setDate(nextDay.getDate() + 1);
                          const nextDayStr = nextDay.toISOString().split('T')[0];
                          setTimeout(() => handleBookingFieldChange('check_out_date', nextDayStr), 50);
                        }
                      }}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  
                  {newBookingData.stay_type === 'Night Stay' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Check-out Date *</label>
                      <input
                        type="date"
                        value={newBookingData.check_out_date}
                        onChange={(e) => handleBookingFieldChange('check_out_date', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                        required
                        min={newBookingData.check_in_date}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Check-out Date</label>
                      <input type="text" value="Same day checkout" disabled className="w-full px-3 py-2 bg-gray-600 border border-gray-600 rounded-md text-gray-400" />
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Room *</label>
                    <select
                      value={newBookingData.room_number}
                      onChange={(e) => handleBookingFieldChange('room_number', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select a room</option>
                      {(availableRoomsForBooking.length > 0 ? availableRoomsForBooking : getAvailableRooms()).map((room) => (
                        <option key={room.id} value={room.room_number}>{room.room_number}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Rate per Night (LKR) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newBookingData.rate_per_night}
                      onChange={(e) => handleBookingFieldChange('rate_per_night', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="Rate per night"
                      required
                    />
                  </div>
                </div>

                {/* Commission field - auto or manual based on channel */}
                {(() => {
                  const selectedChannel = availableChannels.find(ch => ch.id === newBookingData.booking_channel_id);
                  const isAutoRate = selectedChannel && selectedChannel.auto_rate !== false;
                  return selectedChannel ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Commission (LKR) {isAutoRate ? '- Auto' : '- Manual'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={newBookingData.commission_amount}
                        onChange={(e) => setNewBookingData({...newBookingData, commission_amount: parseFloat(e.target.value) || 0})}
                        readOnly={isAutoRate}
                        className={`w-full px-3 py-2 border rounded-md text-white focus:ring-2 focus:ring-blue-500 ${
                          isAutoRate ? 'bg-gray-600 border-gray-500 cursor-not-allowed' : 'bg-gray-700 border-gray-600'
                        }`}
                        placeholder="Commission payable"
                      />
                      {isAutoRate && (
                        <p className="text-xs text-green-400 mt-1">Auto-calculated: {selectedChannel.commission_rate}% of booking amount</p>
                      )}
                    </div>
                  ) : null;
                })()}

                {/* Advance Payment - Amount and Method in same row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Advance Amount (LKR)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newBookingData.advance_amount}
                      onChange={(e) => setNewBookingData({...newBookingData, advance_amount: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                      data-testid="booking-advance-amount"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Payment Type</label>
                    <select
                      value={newBookingData.advance_payment_method}
                      onChange={(e) => setNewBookingData({...newBookingData, advance_payment_method: e.target.value})}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                      data-testid="booking-advance-method"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Card">Card</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                  </div>
                </div>
                
                {/* Booking Summary */}
                {newBookingData.booking_amount > 0 && (
                  <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3" data-testid="booking-summary">
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-300">Total Booking Amount:</span>
                        <span className="text-white font-bold">LKR {newBookingData.booking_amount.toLocaleString()}</span>
                      </div>
                      {newBookingData.stay_type === 'Night Stay' && newBookingData.check_in_date && newBookingData.check_out_date && (
                        <div className="text-xs text-blue-400">
                          {Math.max(1, Math.ceil((new Date(newBookingData.check_out_date) - new Date(newBookingData.check_in_date)) / (1000 * 60 * 60 * 24)))} night(s) x LKR {parseFloat(newBookingData.rate_per_night || 0).toLocaleString()}
                        </div>
                      )}
                      {newBookingData.commission_amount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-orange-300">Commission ({newBookingData.booking_channel_name}):</span>
                          <span className="text-orange-400">LKR {newBookingData.commission_amount.toLocaleString()}</span>
                        </div>
                      )}
                      {newBookingData.advance_amount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-green-300">Advance Received ({newBookingData.advance_payment_method}):</span>
                          <span className="text-green-400">LKR {newBookingData.advance_amount.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm border-t border-blue-700 pt-1 mt-1">
                        <span className="text-gray-300">Balance Due:</span>
                        <span className="text-yellow-300 font-bold">LKR {Math.max(0, newBookingData.booking_amount - newBookingData.advance_amount).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Additional Notes</label>
                  <textarea
                    value={newBookingData.additional_notes}
                    onChange={(e) => setNewBookingData({...newBookingData, additional_notes: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                    rows="3"
                    placeholder="Any special requests or notes..."
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowNewBookingModal(false)}
                className="px-6 py-2 text-gray-300 border border-gray-600 rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleNewBooking}
                disabled={
                  !newBookingData.guest_name || 
                  !newBookingData.room_number || 
                  !newBookingData.check_in_date ||
                  !newBookingData.booking_amount ||
                  parseFloat(newBookingData.booking_amount) <= 0 ||
                  (newBookingData.stay_type === 'Night Stay' && !newBookingData.check_out_date)
                }
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                data-testid="create-booking-btn"
              >
                Create Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Booking Modal */}
      {showEditBookingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Edit Booking</h3>
            {selectedBooking && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Guest: <strong>{selectedBooking.guest_name}</strong></p>
                <p className="text-sm text-gray-600">Current Room: <strong>{selectedBooking.room_number}</strong></p>
                <p className="text-sm text-gray-500">Status: <strong>{selectedBooking.status}</strong></p>
                <hr className="my-2" />
                <p className="text-sm text-blue-700">
                  <strong>Rate per Night:</strong> LKR {(() => {
                    const checkin = new Date(selectedBooking.check_in_date);
                    const checkout = new Date(selectedBooking.check_out_date);
                    const nights = Math.max(1, Math.ceil((checkout - checkin) / (1000 * 60 * 60 * 24)));
                    const rate = (selectedBooking.booking_amount || 0) / nights;
                    return Math.round(rate).toLocaleString();
                  })()}
                </p>
                <p className="text-sm text-gray-600"><strong>Current Amount:</strong> LKR {(selectedBooking.booking_amount || 0).toLocaleString()}</p>
              </div>
            )}
            
            <div className="space-y-4">
              {/* Room Selection - Only for Upcoming bookings */}
              {selectedBooking && selectedBooking.status === 'Upcoming' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    🏠 Change Room Number
                  </label>
                  <select
                    value={editBookingData.room_number}
                    onChange={(e) => setEditBookingData({...editBookingData, room_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a room</option>
                    {availableRoomsForBooking.map((room) => (
                      <option key={room.room_number} value={room.room_number}>
                        Room {room.room_number} - {room.room_type} ({room.status})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-green-600 mt-1">
                    ℹ️ Room can only be changed for upcoming bookings
                  </p>
                </div>
              )}
              
              {/* Show warning for non-upcoming bookings */}
              {selectedBooking && selectedBooking.status !== 'Upcoming' && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    ⚠️ Room number cannot be changed for bookings with status: <strong>{selectedBooking.status}</strong>
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">
                    Only upcoming bookings can have room changes.
                  </p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Check-in Date
                  </label>
                  <input
                    type="date"
                    value={editBookingData.check_in_date}
                    onChange={(e) => setEditBookingData({...editBookingData, check_in_date: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Check-out Date
                  </label>
                  <input
                    type="date"
                    value={editBookingData.check_out_date}
                    onChange={(e) => setEditBookingData({...editBookingData, check_out_date: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Notes
                </label>
                <textarea
                  value={editBookingData.additional_notes}
                  onChange={(e) => setEditBookingData({...editBookingData, additional_notes: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Any special notes or changes..."
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowEditBookingModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditBooking}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {selectedBooking && selectedBooking.status === 'Upcoming' ? '💾 Save Changes' : '💾 Update Details'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Availability Modal */}
      {showAvailabilityModal && availabilityData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Room Availability Results</h3>
              <button
                onClick={() => setShowAvailabilityModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="font-semibold text-blue-800 mb-2">
                Availability for {availabilityData.check_in_date} to {availabilityData.check_out_date}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-blue-600 font-medium">Stay Duration:</span>
                  <span className="text-blue-800 ml-1">{availabilityData.stay_duration} night{availabilityData.stay_duration !== 1 ? 's' : ''}</span>
                </div>
                <div>
                  <span className="text-blue-600 font-medium">Total Rooms:</span>
                  <span className="text-blue-800 ml-1">{availabilityData.total_rooms}</span>
                </div>
                <div>
                  <span className="text-green-600 font-medium">Available Rooms:</span>
                  <span className="text-green-800 ml-1">{availabilityData.available_rooms}</span>
                </div>
              </div>
            </div>

            {availabilityData.rooms.length > 0 ? (
              <div>
                <h5 className="font-medium text-gray-900 mb-4">Available Rooms:</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availabilityData.rooms.map(room => (
                    <div key={room.id} className="border border-green-300 bg-green-50 p-4 rounded-lg">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h6 className="font-semibold text-green-800 text-lg">{room.room_number}</h6>
                          <p className="text-sm text-green-600">{room.room_type}</p>
                        </div>
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                          Available
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setNewBookingData({
                            ...newBookingData,
                            room_number: room.room_number,
                            check_in_date: availabilityData.check_in_date,
                            check_out_date: availabilityData.check_out_date,
                            booking_amount: room.price_per_night * availabilityData.stay_duration
                          });
                          setShowAvailabilityModal(false);
                          openNewBookingModal();
                        }}
                        className="w-full mt-3 px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors font-medium"
                      >
                        Book This Room
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <h5 className="font-medium text-red-800 mb-2">No Rooms Available</h5>
                <p className="text-red-600 text-sm">
                  Sorry, no rooms are available for the selected dates. Please try different dates or contact us for assistance.
                </p>
              </div>
            )}
            
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowAvailabilityModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Selection Modal for Past Date Bookings */}
      {showStatusSelectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Past Date Booking Detected</h3>
            <p className="text-gray-700 mb-4">
              You're creating a booking with a past check-in date. Please choose how you'd like to add this booking:
            </p>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-start space-x-3">
                <input
                  type="radio"
                  id="upcoming"
                  name="booking_status"
                  value="Upcoming"
                  checked={selectedBookingStatus === 'Upcoming'}
                  onChange={(e) => setSelectedBookingStatus(e.target.value)}
                  className="mt-1"
                />
                <div>
                  <label htmlFor="upcoming" className="font-medium text-gray-900 cursor-pointer">
                    Add as Upcoming Booking
                  </label>
                  <p className="text-sm text-gray-600">
                    The booking will appear in the "Upcoming Bookings" section and you can check the guest in later.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <input
                  type="radio"
                  id="checked_in"
                  name="booking_status"
                  value="Checked In"
                  checked={selectedBookingStatus === 'Checked In'}
                  onChange={(e) => setSelectedBookingStatus(e.target.value)}
                  className="mt-1"
                />
                <div>
                  <label htmlFor="checked_in" className="font-medium text-gray-900 cursor-pointer">
                    Add as Checked In Customer
                  </label>
                  <p className="text-sm text-gray-600">
                    The guest will immediately appear in the "Checked In Customers" section and the room will be marked as occupied.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowStatusSelectionModal(false);
                  setSelectedBookingStatus('Upcoming');
                }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createBookingWithStatus(selectedBookingStatus)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Create Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Invoice Dialog */}
      {showPrintInvoiceDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-white">Checkout Complete!</h3>
            
            <p className="text-gray-300 mb-6">
              Customer has been successfully checked out. Would you like to print the invoice?
            </p>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={closePrintInvoiceDialog}
                className="px-4 py-2 text-gray-300 border border-gray-600 rounded-md hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePrintInvoice}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <span>🖨️</span>
                <span>Print Invoice</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Commissions Component
const Commissions = () => {
  const [commissionSummary, setCommissionSummary] = useState(null);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [channelDetails, setChannelDetails] = useState(null);
  const [exporting, setExporting] = useState(false);

  const months = [
    { value: null, label: 'All Months' },
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  useEffect(() => {
    fetchCommissionData();
  }, [selectedYear, selectedMonth]);

  const fetchCommissionData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('year', selectedYear);
      if (selectedMonth) params.append('month', selectedMonth);

      const [summaryRes, breakdownRes] = await Promise.all([
        axios.get(`${API}/commissions/summary?${params.toString()}`),
        axios.get(`${API}/commissions/monthly-breakdown?year=${selectedYear}`)
      ]);

      setCommissionSummary(summaryRes.data);
      setMonthlyBreakdown(breakdownRes.data);
    } catch (error) {
      console.error('Error fetching commission data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChannelDetails = async (channelId, channelName) => {
    try {
      const params = new URLSearchParams();
      params.append('year', selectedYear);
      if (selectedMonth) params.append('month', selectedMonth);

      const response = await axios.get(`${API}/commissions/channel-details/${channelId}?${params.toString()}`);
      setChannelDetails(response.data);
      setSelectedChannel(channelName);
    } catch (error) {
      console.error('Error fetching channel details:', error);
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const startDate = selectedMonth 
        ? `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
        : `${selectedYear}-01-01`;
      const endDate = selectedMonth
        ? `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${new Date(selectedYear, selectedMonth, 0).getDate()}`
        : `${selectedYear}-12-31`;
      
      const response = await axios.get(`${API}/commissions/export?format=csv&start_date=${startDate}&end_date=${endDate}`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `commissions_${selectedYear}${selectedMonth ? '_' + String(selectedMonth).padStart(2, '0') : ''}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting commissions:', error);
      alert('Error exporting commissions');
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (amount) => {
    return `LKR ${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="p-6 min-h-screen bg-gray-900">
        <div className="flex justify-center items-center h-64">
          <div className="text-white">Loading commission data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-800 to-indigo-800 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Commission Tracking</h2>
            <p className="text-purple-200">Track and manage booking channel commissions</p>
          </div>
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="bg-white text-purple-800 px-4 py-2 rounded-lg hover:bg-purple-100 flex items-center font-medium disabled:opacity-50"
          >
            {exporting ? (
              <span>Exporting...</span>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-gray-700 text-white px-4 py-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-purple-500"
            >
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Month</label>
            <select
              value={selectedMonth || ''}
              onChange={(e) => setSelectedMonth(e.target.value ? parseInt(e.target.value) : null)}
              className="bg-gray-700 text-white px-4 py-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-purple-500"
            >
              {months.map(month => (
                <option key={month.value || 'all'} value={month.value || ''}>{month.label}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto">
            <div className="text-sm text-gray-400">Grand Total Payable</div>
            <div className="text-2xl font-bold text-purple-400">
              {formatCurrency(commissionSummary?.grand_total)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Summary */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Commission by Channel</h3>
          {commissionSummary?.channels?.length > 0 ? (
            <div className="space-y-3">
              {commissionSummary.channels.map((channel, index) => (
                <div 
                  key={index}
                  onClick={() => channel.channel_id && fetchChannelDetails(channel.channel_id, channel.channel_name)}
                  className={`bg-gray-700 rounded-lg p-4 ${channel.channel_id ? 'cursor-pointer hover:bg-gray-600 transition-colors' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-white font-medium">{channel.channel_name}</div>
                      <div className="text-sm text-gray-400">{channel.booking_count} booking(s)</div>
                    </div>
                    <div className="text-right">
                      <div className="text-purple-400 font-semibold">{formatCurrency(channel.total_commission)}</div>
                      <div className="text-xs text-gray-500">from {formatCurrency(channel.total_booking_amount)}</div>
                    </div>
                  </div>
                  {/* Progress bar showing percentage of total */}
                  <div className="mt-2 bg-gray-600 rounded-full h-2">
                    <div 
                      className="bg-purple-500 h-2 rounded-full"
                      style={{ width: `${(channel.total_commission / (commissionSummary.grand_total || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-400 text-center py-8">
              No commission data for selected period
            </div>
          )}
        </div>

        {/* Monthly Breakdown */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Monthly Breakdown - {selectedYear}</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 text-gray-400 font-medium">Month</th>
                  <th className="text-right py-2 text-gray-400 font-medium">Commission</th>
                </tr>
              </thead>
              <tbody>
                {monthlyBreakdown?.monthly_breakdown?.map((month) => (
                  <tr 
                    key={month.month} 
                    className={`border-b border-gray-700 hover:bg-gray-700 cursor-pointer ${
                      month.total > 0 ? '' : 'opacity-50'
                    }`}
                    onClick={() => setSelectedMonth(month.month)}
                  >
                    <td className="py-3 text-white">{month.month_name}</td>
                    <td className="py-3 text-right">
                      <span className={month.total > 0 ? 'text-purple-400 font-medium' : 'text-gray-500'}>
                        {formatCurrency(month.total)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-600">
                  <td className="py-3 text-white font-semibold">Year Total</td>
                  <td className="py-3 text-right text-purple-400 font-bold">
                    {formatCurrency(monthlyBreakdown?.year_total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Channel Details Modal */}
      {selectedChannel && channelDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-semibold text-white">{selectedChannel} - Commission Details</h3>
                <p className="text-sm text-gray-400">
                  {selectedMonth ? months.find(m => m.value === selectedMonth)?.label : 'All Months'} {selectedYear}
                </p>
              </div>
              <button
                onClick={() => { setSelectedChannel(null); setChannelDetails(null); }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400">Total Bookings</div>
                <div className="text-2xl font-bold text-white">{channelDetails.booking_count}</div>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400">Total Commission</div>
                <div className="text-2xl font-bold text-purple-400">{formatCurrency(channelDetails.total_commission)}</div>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400">Status</div>
                <div className="text-xl font-bold text-yellow-400">Payable</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 text-gray-400 font-medium">Guest</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Room</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Check-in</th>
                    <th className="text-right py-2 text-gray-400 font-medium">Booking Amt</th>
                    <th className="text-right py-2 text-gray-400 font-medium">Commission</th>
                    <th className="text-center py-2 text-gray-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {channelDetails.bookings?.map((booking) => (
                    <tr key={booking.id} className="border-b border-gray-700 hover:bg-gray-700">
                      <td className="py-3 text-white">{booking.guest_name}</td>
                      <td className="py-3 text-gray-300">{booking.room_number}</td>
                      <td className="py-3 text-gray-300">{booking.check_in_date}</td>
                      <td className="py-3 text-right text-gray-300">{formatCurrency(booking.booking_amount)}</td>
                      <td className="py-3 text-right text-purple-400 font-medium">{formatCurrency(booking.commission_amount)}</td>
                      <td className="py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          booking.status === 'Completed' ? 'bg-green-900 text-green-300' :
                          booking.status === 'Checked In' ? 'bg-blue-900 text-blue-300' :
                          booking.status === 'Cancelled' ? 'bg-red-900 text-red-300' :
                          'bg-yellow-900 text-yellow-300'
                        }`}>
                          {booking.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => { setSelectedChannel(null); setChannelDetails(null); }}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Calendar View Component - Booking.com style calendar
const CalendarView = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showBookingDetails, setShowBookingDetails] = useState(false);
  const [selectedDateBookings, setSelectedDateBookings] = useState([]);
  const [expandedBooking, setExpandedBooking] = useState(null);

  useEffect(() => {
    fetchCalendarData();
  }, [currentDate]);

  const fetchCalendarData = async () => {
    try {
      setLoading(true);
      const [bookingsRes, roomsRes] = await Promise.all([
        axios.get(`${API}/bookings`),
        axios.get(`${API}/rooms`)
      ]);
      // Handle paginated response structure
      const bookingsData = bookingsRes.data.bookings || bookingsRes.data || [];
      setBookings(Array.isArray(bookingsData) ? bookingsData : []);
      setRooms(roomsRes.data || []);
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMonthName = (date) => {
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    
    // Adjust to start week on Monday
    const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    
    return { daysInMonth, firstDayOfWeek: adjustedFirstDay };
  };

  const getBookingsForDate = (day) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const targetDate = new Date(year, month, day);
    
    return bookings.filter(booking => {
      const checkIn = new Date(booking.check_in_date);
      const checkOut = new Date(booking.check_out_date);
      
      // Check if target date falls within the booking period
      return targetDate >= checkIn && targetDate < checkOut;
    });
  };

  // Separate active and cancelled bookings
  const getActiveBookingsForDate = (day) => {
    return getBookingsForDate(day).filter(b => b.status !== 'Cancelled');
  };

  const getCancelledBookingsForDate = (day) => {
    return getBookingsForDate(day).filter(b => b.status === 'Cancelled');
  };

  const getRoomsLeftToSell = (day) => {
    const activeBookings = getActiveBookingsForDate(day);
    const occupiedRooms = activeBookings.length;
    const totalRooms = rooms.length;
    return Math.max(0, totalRooms - occupiedRooms);
  };

  const isSoldOut = (day) => {
    return getRoomsLeftToSell(day) === 0 && rooms.length > 0;
  };

  const handleDateClick = (day) => {
    const dayBookings = getBookingsForDate(day);
    setSelectedDate(day);
    setSelectedDateBookings(dayBookings);
    setShowBookingDetails(true);
    setExpandedBooking(null);
  };

  const navigateMonth = (direction) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + direction);
      return newDate;
    });
  };

  const getBookingSourceColor = (source) => {
    switch(source?.toLowerCase()) {
      case 'booking.com': return 'bg-blue-100 text-blue-800';
      case 'expedia': return 'bg-yellow-100 text-yellow-800';
      case 'agoda': return 'bg-red-100 text-red-800';
      case 'direct': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const { daysInMonth, firstDayOfWeek } = getDaysInMonth(currentDate);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-800 to-indigo-700 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Booking Calendar</h2>
            <p className="text-blue-200">View bookings by date - {rooms.length} total rooms</p>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigateMonth(-1)}
              className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-md flex items-center"
              data-testid="calendar-prev-month"
            >
              <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            <span className="text-white font-semibold text-lg">{getMonthName(currentDate)}</span>
            <button
              onClick={() => navigateMonth(1)}
              className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-md flex items-center"
              data-testid="calendar-next-month"
            >
              Next
              <svg className="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6 flex flex-wrap gap-4 items-center">
        <span className="text-gray-400 text-sm">Legend:</span>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-600 rounded"></div>
          <span className="text-gray-300 text-sm">Booked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-600 rounded"></div>
          <span className="text-gray-300 text-sm">Cancelled</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-amber-500 rounded"></div>
          <span className="text-gray-300 text-sm">Sold Out</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-700 rounded"></div>
          <span className="text-gray-300 text-sm">Available</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 bg-gray-700">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div key={day} className="p-3 text-center text-gray-300 font-semibold border-r border-gray-600 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {/* Empty cells for days before the first of the month */}
          {emptyDays.map(i => (
            <div key={`empty-${i}`} className="min-h-[120px] bg-gray-900 border-r border-b border-gray-700 last:border-r-0"></div>
          ))}

          {/* Actual days */}
          {daysArray.map(day => {
            const activeBookings = getActiveBookingsForDate(day);
            const cancelledBookings = getCancelledBookingsForDate(day);
            const activeCount = activeBookings.length;
            const cancelledCount = cancelledBookings.length;
            const roomsLeft = getRoomsLeftToSell(day);
            const soldOut = isSoldOut(day);
            const isToday = new Date().getDate() === day && 
                           new Date().getMonth() === currentDate.getMonth() && 
                           new Date().getFullYear() === currentDate.getFullYear();

            return (
              <div
                key={day}
                onClick={() => handleDateClick(day)}
                className={`min-h-[120px] p-2 border-r border-b border-gray-700 last:border-r-0 cursor-pointer transition-all hover:bg-gray-750
                  ${soldOut ? 'bg-amber-900/30' : 'bg-gray-800'}
                  ${isToday ? 'ring-2 ring-blue-500 ring-inset' : ''}
                `}
                data-testid={`calendar-day-${day}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-sm font-semibold ${isToday ? 'text-blue-400' : 'text-gray-400'}`}>
                    {day}
                  </span>
                  {activeCount > 0 && (
                    <span className="text-xs text-gray-500">{roomsLeft} left</span>
                  )}
                </div>

                {/* Active Bookings - Blue */}
                {activeCount > 0 && (
                  <div className={`${soldOut ? 'bg-amber-600' : 'bg-blue-600'} text-white text-xs px-2 py-1 rounded mb-1 text-center`}>
                    {activeCount} booked
                  </div>
                )}

                {/* Cancelled Bookings - Red */}
                {cancelledCount > 0 && (
                  <div className="bg-red-600 text-white text-xs px-2 py-1 rounded mb-1 text-center">
                    {cancelledCount} cancelled
                  </div>
                )}

                {soldOut && (
                  <div className="bg-amber-500 text-amber-900 text-xs px-2 py-1 rounded text-center font-semibold">
                    Sold out
                  </div>
                )}

                {!soldOut && activeCount === 0 && cancelledCount === 0 && rooms.length > 0 && (
                  <div className="text-gray-500 text-xs text-center mt-4">
                    {rooms.length} available
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Booking Details Modal */}
      {showBookingDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20 overflow-y-auto">
          <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 mb-8" data-testid="calendar-booking-modal">
            {/* Modal Header */}
            <div className="bg-blue-700 px-6 py-4 rounded-t-lg flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {selectedDateBookings.length} booking{selectedDateBookings.length !== 1 ? 's' : ''}
                </h3>
                <p className="text-blue-200 text-sm">
                  {new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDate).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
              <button
                onClick={() => setShowBookingDetails(false)}
                className="text-white hover:text-gray-200 text-2xl font-bold"
                data-testid="close-booking-modal"
              >
                ×
              </button>
            </div>

            {/* Bookings List */}
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {selectedDateBookings.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400">No bookings for this date</p>
                  <p className="text-gray-500 text-sm mt-2">{rooms.length} rooms available</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Room Summary Section */}
                  {(() => {
                    const activeBookings = selectedDateBookings.filter(b => b.status !== 'Cancelled');
                    const cancelledBookings = selectedDateBookings.filter(b => b.status === 'Cancelled');
                    const bookedRooms = [...new Set(activeBookings.map(b => b.room_number))].sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true}));
                    const cancelledRooms = [...new Set(cancelledBookings.map(b => b.room_number))].sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true}));
                    const availableRooms = rooms.filter(r => !bookedRooms.includes(r.room_number)).map(r => r.room_number).sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true}));
                    
                    return (
                      <div className="mb-4 space-y-2" data-testid="calendar-room-summary">
                        {/* Occupied Rooms */}
                        {bookedRooms.length > 0 && (
                          <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-blue-300 text-sm font-semibold">Occupied Rooms ({bookedRooms.length})</span>
                              <span className="text-blue-400 text-xs">{activeBookings.length} booking{activeBookings.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {bookedRooms.map(room => (
                                <span key={room} className="bg-blue-600 text-white text-xs px-2 py-1 rounded font-mono" data-testid={`occupied-room-${room}`}>
                                  {room}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Cancelled Rooms */}
                        {cancelledRooms.length > 0 && (
                          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-red-300 text-sm font-semibold">Cancelled ({cancelledBookings.length})</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {cancelledRooms.map(room => (
                                <span key={room} className="bg-red-600/60 text-red-200 text-xs px-2 py-1 rounded font-mono line-through">
                                  {room}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Available Rooms */}
                        {availableRooms.length > 0 && (
                          <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-gray-300 text-sm font-semibold">Available Rooms ({availableRooms.length})</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {availableRooms.map(room => (
                                <span key={room} className="bg-gray-600 text-gray-300 text-xs px-2 py-1 rounded font-mono" data-testid={`available-room-${room}`}>
                                  {room}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Individual Booking Cards */}
                  {selectedDateBookings.map((booking, index) => {
                    const isCancelled = booking.status === 'Cancelled';
                    return (
                    <div key={booking.id || index} className={`border rounded-lg overflow-hidden ${isCancelled ? 'border-red-700' : 'border-gray-700'}`}>
                      {/* Booking Header - Always visible */}
                      <div
                        onClick={() => setExpandedBooking(expandedBooking === booking.id ? null : booking.id)}
                        className={`px-4 py-3 flex justify-between items-center cursor-pointer ${isCancelled ? 'bg-red-900/30 hover:bg-red-900/50' : 'bg-gray-750 hover:bg-gray-700'}`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${isCancelled ? 'text-red-300' : 'text-white'}`}>{booking.guest_name}</span>
                            {isCancelled && (
                              <span className="text-xs px-2 py-0.5 rounded bg-red-600 text-white">CANCELLED</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="bg-gray-600 text-gray-200 px-2 py-0.5 rounded">Room {booking.room_number}</span>
                            <span className={`px-2 py-0.5 rounded ${getBookingSourceColor(booking.booking_channel_name)}`}>
                              {booking.booking_channel_name || 'Direct'}
                            </span>
                          </div>
                        </div>
                        <svg 
                          className={`w-5 h-5 text-gray-400 transform transition-transform ${expandedBooking === booking.id ? 'rotate-180' : ''}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>

                      {/* Expanded Details */}
                      {expandedBooking === booking.id && (
                        <div className={`px-4 py-3 border-t space-y-3 ${isCancelled ? 'bg-red-900/20 border-red-700' : 'bg-gray-800 border-gray-700'}`}>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-500">Booking ID</p>
                              <p className="text-white font-mono">{booking.id?.substring(0, 8) || 'N/A'}...</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Room Number</p>
                              <p className="text-white font-semibold text-lg">{booking.room_number}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-gray-500">Arrival</p>
                              <p className="text-white">{new Date(booking.check_in_date).toLocaleDateString()}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Departure</p>
                              <p className="text-white">{new Date(booking.check_out_date).toLocaleDateString()}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Nights</p>
                              <p className="text-white font-semibold">
                                {Math.ceil((new Date(booking.check_out_date) - new Date(booking.check_in_date)) / (1000 * 60 * 60 * 24))}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-500">Guests</p>
                              <p className="text-white">{booking.number_of_guests || booking.num_guests || 1} guest{(booking.number_of_guests || booking.num_guests || 1) !== 1 ? 's' : ''}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Amount</p>
                              <p className={`font-semibold ${isCancelled ? 'text-red-400 line-through' : 'text-green-400'}`}>LKR {booking.booking_amount?.toLocaleString() || '0'}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-500">Guest contact</p>
                              <p className="text-white">{booking.guest_phone || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Guest email</p>
                              <p className="text-white">{booking.guest_email || 'N/A'}</p>
                            </div>
                          </div>

                          <div className="text-sm">
                            <p className="text-gray-500">Status</p>
                            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                              booking.status === 'Cancelled' ? 'bg-red-900 text-red-300' :
                              booking.status === 'Checked In' || booking.status === 'Checked-in' ? 'bg-green-900 text-green-300' :
                              booking.status === 'Upcoming' ? 'bg-blue-900 text-blue-300' :
                              booking.status === 'Completed' ? 'bg-gray-700 text-gray-300' :
                              'bg-red-900 text-red-300'
                            }`}>
                              {booking.status}
                            </span>
                          </div>

                          {booking.additional_notes && (
                            <div className="text-sm">
                              <p className="text-gray-500">Notes</p>
                              <p className="text-gray-300">{booking.additional_notes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-700 flex justify-between items-center">
              <div className="text-sm text-gray-400">
                {getRoomsLeftToSell(selectedDate)} room{getRoomsLeftToSell(selectedDate) !== 1 ? 's' : ''} left to sell
              </div>
              <button
                onClick={() => setShowBookingDetails(false)}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Expenses Component - Enhanced Financial Dashboard
const Expenses = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [dailySales, setDailySales] = useState([]);
  const [financialSummary, setFinancialSummary] = useState(null);
  const [dailyFinancialSummary, setDailyFinancialSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showAddIncomeModal, setShowAddIncomeModal] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [dailyReportData, setDailyReportData] = useState(null);
  const [monthlyReportData, setMonthlyReportData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [chartData, setChartData] = useState([]);
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(null);
  const [markPaidMethod, setMarkPaidMethod] = useState('Cash');
  
  const { refreshTrigger } = useFinancial();
  
  const [roomBookingsPage, setRoomBookingsPage] = useState(1);
  const [additionalIncomePage, setAdditionalIncomePage] = useState(1);
  const [expensePage, setExpensePage] = useState(1);
  const itemsPerPage = 10;
  
  const [expenseData, setExpenseData] = useState({
    description: '',
    amount: 0,
    category: '',
    payment_method: 'Cash',
    vendor: '',
    expense_date: new Date().toISOString().split('T')[0]
  });
  const [incomeData, setIncomeData] = useState({
    description: '',
    amount: 0,
    category: '',
    payment_method: 'Cash',
    income_date: new Date().toISOString().split('T')[0]
  });

  const [expenseCategories, setExpenseCategories] = useState([]);
  const [incomeCategories, setIncomeCategories] = useState([]);
  const [newExpenseCategory, setNewExpenseCategory] = useState('');
  const [newIncomeCategory, setNewIncomeCategory] = useState('');
  const [vendors, setVendors] = useState([]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const vendorRef = useRef(null);

  const paymentMethods = ['Cash', 'Card', 'Bank Transfer', 'Add to Account'];

  const fetchCategories = async () => {
    try {
      const [expRes, incRes] = await Promise.all([
        axios.get(`${API}/categories/expense`),
        axios.get(`${API}/categories/income`)
      ]);
      setExpenseCategories(expRes.data);
      setIncomeCategories(incRes.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchVendors = async (search = '') => {
    try {
      const res = await axios.get(`${API}/vendors${search ? `?search=${search}` : ''}`);
      setVendors(res.data);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  };

  const handleAddVendor = async () => {
    if (!newVendorName.trim()) return;
    try {
      await axios.post(`${API}/vendors`, { name: newVendorName.trim() });
      setNewVendorName('');
      fetchVendors();
      setExpenseData({...expenseData, vendor: newVendorName.trim()});
      setShowVendorDropdown(false);
    } catch (error) {
      alert(error.response?.data?.detail || 'Error adding vendor');
    }
  };

  const handleAddExpenseCategory = async () => {
    if (!newExpenseCategory.trim()) return;
    try {
      await axios.post(`${API}/categories/expense`, { name: newExpenseCategory.trim() });
      setNewExpenseCategory('');
      fetchCategories();
    } catch (error) {
      alert(error.response?.data?.detail || 'Error adding category');
    }
  };

  const handleAddIncomeCategory = async () => {
    if (!newIncomeCategory.trim()) return;
    try {
      await axios.post(`${API}/categories/income`, { name: newIncomeCategory.trim() });
      setNewIncomeCategory('');
      fetchCategories();
    } catch (error) {
      alert(error.response?.data?.detail || 'Error adding category');
    }
  };

  useEffect(() => {
    fetchExpenses();
    fetchIncomes();
    fetchCategories();
    fetchDailySales();
    fetchDailyFinancialSummary();
    fetchFinancialSummary();
    fetchVendors();
    fetchDailyReport(selectedDate);
    fetchMonthlyReport(selectedYear, selectedMonth);
    fetchChartData();
  }, []);

  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchDailyFinancialSummary();
      fetchFinancialSummary();
    }
  }, [refreshTrigger]);

  // Close vendor dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (vendorRef.current && !vendorRef.current.contains(e.target)) {
        setShowVendorDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchExpenses = async () => {
    try {
      const response = await axios.get(`${API}/expenses`);
      setExpenses(response.data);
    } catch (error) { console.error('Error fetching expenses:', error); }
  };

  const fetchIncomes = async () => {
    try {
      const response = await axios.get(`${API}/incomes`);
      setIncomes(response.data);
    } catch (error) { console.error('Error fetching incomes:', error); }
  };

  const fetchDailySales = async () => {
    try {
      const response = await axios.get(`${API}/daily-sales`);
      setDailySales(response.data);
    } catch (error) { console.error('Error fetching daily sales:', error); }
  };

  const fetchFinancialSummary = async () => {
    try {
      const response = await axios.get(`${API}/financial-summary`);
      setFinancialSummary(response.data);
    } catch (error) { console.error('Error fetching financial summary:', error); }
    finally { setLoading(false); }
  };

  const fetchDailyFinancialSummary = async () => {
    try {
      const response = await axios.get(`${API}/daily-financial-summary`);
      setDailyFinancialSummary(response.data);
    } catch (error) { console.error('Error fetching daily financial summary:', error); }
  };

  const fetchDailyReport = async (dateStr) => {
    try {
      const response = await axios.get(`${API}/financial-reports/daily?date=${dateStr}`);
      setDailyReportData(response.data);
    } catch (error) { console.error('Error fetching daily report:', error); }
  };

  const fetchMonthlyReport = async (yr, mo) => {
    try {
      const response = await axios.get(`${API}/financial-reports/monthly?year=${yr}&month=${mo}`);
      setMonthlyReportData(response.data);
    } catch (error) { console.error('Error fetching monthly report:', error); }
  };

  const fetchChartData = async () => {
    try {
      const response = await axios.get(`${API}/reports/daily`);
      const last14 = (response.data || []).slice(-14);
      setChartData(last14.map(d => ({
        date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        received: d.revenue || 0,
        paid: d.expenses || 0,
        net: d.profit || 0
      })));
    } catch (error) { console.error('Error fetching chart data:', error); }
  };

  const handleAddExpense = async () => {
    try {
      if (!expenseData.description || !expenseData.amount || !expenseData.category || !expenseData.expense_date) {
        alert('Please fill in all required fields');
        return;
      }
      await axios.post(`${API}/expenses`, expenseData);
      setShowAddExpenseModal(false);
      setExpenseData({ description: '', amount: 0, category: '', payment_method: 'Cash', vendor: '', expense_date: new Date().toISOString().split('T')[0] });
      await Promise.all([fetchExpenses(), fetchFinancialSummary(), fetchDailyFinancialSummary(), fetchDailyReport(selectedDate), fetchChartData()]);
      alert('Expense added successfully!');
    } catch (error) {
      console.error('Error adding expense:', error);
      alert('Error adding expense. Please try again.');
    }
  };

  const handleAddIncome = async () => {
    try {
      if (!incomeData.description || !incomeData.amount || !incomeData.category || !incomeData.income_date) {
        alert('Please fill in all required fields');
        return;
      }
      await axios.post(`${API}/incomes`, incomeData);
      setShowAddIncomeModal(false);
      setIncomeData({ description: '', amount: 0, category: '', payment_method: 'Cash', income_date: new Date().toISOString().split('T')[0] });
      await Promise.all([fetchIncomes(), fetchDailySales(), fetchFinancialSummary(), fetchDailyFinancialSummary(), fetchDailyReport(selectedDate), fetchChartData()]);
      alert('Income added successfully!');
    } catch (error) {
      console.error('Error adding income:', error);
      alert('Error adding income. Please try again.');
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      try {
        await axios.delete(`${API}/expenses/${expenseId}`);
        await Promise.all([fetchExpenses(), fetchFinancialSummary(), fetchDailyFinancialSummary()]);
        alert('Expense deleted successfully!');
      } catch (error) { alert('Error deleting expense.'); }
    }
  };

  const handleDeleteIncome = async (id) => {
    if (window.confirm('Are you sure you want to delete this income record?')) {
      try {
        await axios.delete(`${API}/incomes/${id}`);
        await Promise.all([fetchIncomes(), fetchDailySales(), fetchFinancialSummary(), fetchDailyFinancialSummary()]);
        alert('Income record deleted successfully!');
      } catch (error) { alert('Error deleting income record.'); }
    }
  };

  const handleMarkPaid = async (expenseId) => {
    try {
      await axios.put(`${API}/expenses/${expenseId}/mark-paid`, { payment_method: markPaidMethod });
      setShowMarkPaidModal(null);
      await Promise.all([fetchExpenses(), fetchFinancialSummary(), fetchDailyFinancialSummary()]);
      alert('Expense marked as paid!');
    } catch (error) { alert('Error marking expense as paid.'); }
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    fetchDailyReport(e.target.value);
  };

  const handleMonthChange = (yr, mo) => {
    setSelectedYear(yr);
    setSelectedMonth(mo);
    fetchMonthlyReport(yr, mo);
  };

  // Download functions
  const downloadDailyExcel = () => {
    if (!dailyReportData) return;
    const wb = XLSX.utils.book_new();

    // Build detailed summary with individual records under each section
    const rows = [];
    rows.push(['DAILY SALES REPORT', '']);
    rows.push([`Date: ${dailyReportData.date}`, '']);
    rows.push(['', '']);
    
    // --- CASH RECEIVED Section ---
    const cashReceived = (dailyReportData.received?.details || []).filter(d => d['Payment Method'] === 'Cash');
    const bankReceived = (dailyReportData.received?.details || []).filter(d => d['Payment Method'] !== 'Cash');
    
    rows.push(['CASH RECEIVED', '']);
    rows.push(['Source', 'Description', 'Category', 'Amount (LKR)']);
    if (cashReceived.length > 0) {
      cashReceived.forEach(d => {
        rows.push([d.Type || '', d.Description || '', d.Category || '', d.Amount || 0]);
      });
      rows.push(['', '', 'Total Cash Received', dailyReportData.received?.cash || 0]);
    } else {
      rows.push(['No cash transactions', '', '', 0]);
    }
    rows.push(['', '']);
    
    // --- BANK RECEIVED Section ---
    rows.push(['BANK RECEIVED', '']);
    rows.push(['Source', 'Description', 'Category', 'Amount (LKR)']);
    if (bankReceived.length > 0) {
      bankReceived.forEach(d => {
        rows.push([d.Type || '', d.Description || '', d.Category || '', d.Amount || 0]);
      });
      rows.push(['', '', 'Total Bank Received', dailyReportData.received?.bank || 0]);
    } else {
      rows.push(['No bank transactions', '', '', 0]);
    }
    rows.push(['', '']);
    rows.push(['', '', 'TOTAL RECEIVED', dailyReportData.received?.total || 0]);
    rows.push(['', '']);
    
    // --- CASH PAID Section ---
    const cashPaid = (dailyReportData.paid?.details || []).filter(d => d['Payment Method'] === 'Cash');
    const bankPaid = (dailyReportData.paid?.details || []).filter(d => d['Payment Method'] !== 'Cash');
    
    rows.push(['CASH PAID', '']);
    rows.push(['Vendor', 'Description', 'Category', 'Amount (LKR)']);
    if (cashPaid.length > 0) {
      cashPaid.forEach(d => {
        rows.push([d.Vendor || '-', d.Description || '', d.Category || '', d.Amount || 0]);
      });
      rows.push(['', '', 'Total Cash Paid', dailyReportData.paid?.cash || 0]);
    } else {
      rows.push(['No cash payments', '', '', 0]);
    }
    rows.push(['', '']);
    
    // --- BANK PAID Section ---
    rows.push(['BANK PAID', '']);
    rows.push(['Vendor', 'Description', 'Category', 'Amount (LKR)']);
    if (bankPaid.length > 0) {
      bankPaid.forEach(d => {
        rows.push([d.Vendor || '-', d.Description || '', d.Category || '', d.Amount || 0]);
      });
      rows.push(['', '', 'Total Bank Paid', dailyReportData.paid?.bank || 0]);
    } else {
      rows.push(['No bank payments', '', '', 0]);
    }
    rows.push(['', '']);
    rows.push(['', '', 'TOTAL PAID', dailyReportData.paid?.total || 0]);
    rows.push(['', '']);
    
    // --- NET POSITION ---
    rows.push(['NET POSITION', '', '', dailyReportData.net_position || 0]);
    rows.push(['', '']);
    
    // --- PENDING RECEIVABLES ---
    const recvDetails = dailyReportData.pending_receivables?.details || [];
    rows.push(['PENDING RECEIVABLES', '']);
    if (recvDetails.length > 0) {
      rows.push(['Guest', 'Room', 'Booking Amount', 'Advance Paid', 'Pending Amount']);
      recvDetails.forEach(d => {
        rows.push([d.Guest || '', d.Room || '', d['Booking Amount'] || 0, d['Advance Paid'] || 0, d['Pending Amount'] || 0]);
      });
      rows.push(['', '', '', 'Total Receivables', dailyReportData.pending_receivables?.total || 0]);
    } else {
      rows.push(['No pending receivables', '', '', '', 0]);
    }
    rows.push(['', '']);
    
    // --- PENDING PAYABLES ---
    const payDetails = dailyReportData.pending_payables?.details || [];
    rows.push(['PENDING PAYABLES', '']);
    if (payDetails.length > 0) {
      rows.push(['Type', 'Description', 'Vendor', 'Category', 'Amount']);
      payDetails.forEach(d => {
        rows.push([d.Type || '', d.Description || '', d.Vendor || '', d.Category || '', d.Amount || 0]);
      });
      rows.push(['', '', '', 'Total Payables', dailyReportData.pending_payables?.total || 0]);
    } else {
      rows.push(['No pending payables', '', '', '', 0]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ width: 22 }, { width: 30 }, { width: 20 }, { width: 18 }, { width: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Sales Report');

    XLSX.writeFile(wb, `Daily_Sales_Report_${dailyReportData.date}.xlsx`);
  };

  const downloadMonthlyExcel = () => {
    if (!monthlyReportData) return;
    const wb = XLSX.utils.book_new();

    // Day-by-day sheet
    const dayRows = monthlyReportData.daily_breakdown?.map(d => ({
      Date: d.date,
      'Received (Cash)': d.received_cash,
      'Received (Bank)': d.received_bank,
      'Total Received': d.total_received,
      'Paid (Cash)': d.paid_cash,
      'Paid (Bank)': d.paid_bank,
      'Total Paid': d.total_paid,
      'Pending Payables': d.pending_payables,
      'Net Balance': d.net_balance,
      'Transactions': d.transactions
    })) || [];
    
    const gt = monthlyReportData.grand_totals || {};
    dayRows.push({
      Date: 'GRAND TOTAL',
      'Received (Cash)': gt.received_cash,
      'Received (Bank)': gt.received_bank,
      'Total Received': gt.total_received,
      'Paid (Cash)': gt.paid_cash,
      'Paid (Bank)': gt.paid_bank,
      'Total Paid': gt.total_paid,
      'Pending Payables': gt.pending_payables,
      'Net Balance': gt.net_balance,
      'Transactions': ''
    });

    const dayWs = XLSX.utils.json_to_sheet(dayRows);
    dayWs['!cols'] = Array(10).fill({ width: 16 });
    XLSX.utils.book_append_sheet(wb, dayWs, 'Daily Breakdown');

    if (monthlyReportData.income_details?.length > 0) {
      const incWs = XLSX.utils.json_to_sheet(monthlyReportData.income_details);
      XLSX.utils.book_append_sheet(wb, incWs, 'Income Details');
    }
    if (monthlyReportData.expense_details?.length > 0) {
      const expWs = XLSX.utils.json_to_sheet(monthlyReportData.expense_details);
      XLSX.utils.book_append_sheet(wb, expWs, 'Expense Details');
    }
    XLSX.writeFile(wb, `Monthly_Sales_Report_${monthlyReportData.month?.replace(' ', '_')}.xlsx`);
  };

  const getPaginatedData = (data, currentPage) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return data.slice(startIndex, startIndex + itemsPerPage);
  };

  const getTotalPages = (data) => Math.ceil(data.length / itemsPerPage);

  const renderPagination = (data, currentPage, setCurrentPage) => {
    const totalPages = getTotalPages(data);
    if (totalPages <= 1) return null;
    return (
      <div className="flex justify-center items-center space-x-2 mt-4 pb-4">
        <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
          className={`px-3 py-1 rounded text-sm ${currentPage === 1 ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>Prev</button>
        <span className="text-sm text-gray-400">{currentPage} / {totalPages}</span>
        <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}
          className={`px-3 py-1 rounded text-sm ${currentPage === totalPages ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>Next</button>
      </div>
    );
  };

  const formatCurrency = (amount) => `LKR ${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const filteredVendors = vendors.filter(v => v.toLowerCase().includes((expenseData.vendor || '').toLowerCase()));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-emerald-950 to-gray-900 rounded-xl p-6 mb-6 border border-emerald-800/30">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1" data-testid="inc-exp-title">Income & Expenses</h2>
            <p className="text-emerald-400/80 text-sm">Financial tracking, daily sales & reporting</p>
          </div>
          <div className="flex space-x-3">
            <button onClick={() => setShowAddIncomeModal(true)} data-testid="add-income-btn"
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center font-medium text-sm transition-colors">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
              Add Income
            </button>
            <button onClick={() => setShowAddExpenseModal(true)} data-testid="add-expense-btn"
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center font-medium text-sm transition-colors">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
              Add Expense
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex space-x-1 mt-5 bg-gray-800/50 rounded-lg p-1 max-w-fit">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'daily', label: 'Daily Sales' },
            { key: 'monthly', label: 'Monthly Sales' },
            { key: 'records', label: 'Records' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} data-testid={`tab-${tab.key}`}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* === OVERVIEW TAB === */}
      {activeTab === 'overview' && (
        <>
          {/* Summary Cards */}
          {dailyFinancialSummary && (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
              <div className="bg-gray-800 border border-emerald-700/30 rounded-xl p-4" data-testid="card-revenue">
                <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider mb-1">Today's Received</p>
                <p className="text-xl font-bold text-emerald-300">{formatCurrency(dailyFinancialSummary.total_revenue)}</p>
              </div>
              <div className="bg-gray-800 border border-red-700/30 rounded-xl p-4" data-testid="card-expenses">
                <p className="text-xs text-red-400 font-medium uppercase tracking-wider mb-1">Today's Paid</p>
                <p className="text-xl font-bold text-red-300">{formatCurrency(dailyFinancialSummary.total_expenses)}</p>
              </div>
              <div className="bg-gray-800 border border-blue-700/30 rounded-xl p-4" data-testid="card-cash">
                <p className="text-xs text-blue-400 font-medium uppercase tracking-wider mb-1">Cash Balance</p>
                <p className="text-xl font-bold text-blue-300">{formatCurrency(dailyFinancialSummary.cash_balance)}</p>
              </div>
              <div className="bg-gray-800 border border-violet-700/30 rounded-xl p-4" data-testid="card-bank">
                <p className="text-xs text-violet-400 font-medium uppercase tracking-wider mb-1">Bank Balance</p>
                <p className="text-xl font-bold text-violet-300">{formatCurrency(dailyFinancialSummary.bank_balance)}</p>
              </div>
              <div className="bg-gray-800 border border-amber-700/30 rounded-xl p-4" data-testid="card-receivables">
                <p className="text-xs text-amber-400 font-medium uppercase tracking-wider mb-1">Receivables</p>
                <p className="text-xl font-bold text-amber-300">{formatCurrency(dailyFinancialSummary.pending_receivables || 0)}</p>
              </div>
              <div className="bg-gray-800 border border-orange-700/30 rounded-xl p-4" data-testid="card-payables">
                <p className="text-xs text-orange-400 font-medium uppercase tracking-wider mb-1">Payables</p>
                <p className="text-xl font-bold text-orange-300">{formatCurrency(dailyFinancialSummary.pending_payables || 0)}</p>
              </div>
            </div>
          )}

          {/* Chart: Last 14 Days */}
          <div className="bg-gray-800 rounded-xl border border-gray-700/50 p-6 mb-6">
            <h3 className="text-base font-semibold text-white mb-4">Daily Revenue & Expenses (Last 14 Days)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }}
                    formatter={(value) => formatCurrency(value)} />
                  <Legend wrapperStyle={{ color: '#9CA3AF', fontSize: 12 }} />
                  <Bar dataKey="received" name="Received" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="paid" name="Paid" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Net Growth Area Chart */}
          <div className="bg-gray-800 rounded-xl border border-gray-700/50 p-6 mb-6">
            <h3 className="text-base font-semibold text-white mb-4">Net Profit Trend</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }}
                    formatter={(value) => formatCurrency(value)} />
                  <Area type="monotone" dataKey="net" name="Net Profit" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* === DAILY SALES TAB === */}
      {activeTab === 'daily' && (
        <div>
          {/* Date Picker & Download */}
          <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
            <div className="flex items-center space-x-3">
              <label className="text-sm text-gray-300">Select Date:</label>
              <input type="date" value={selectedDate} onChange={handleDateChange} data-testid="daily-date-picker"
                className="bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div className="flex space-x-2">
              <button onClick={downloadDailyExcel} data-testid="download-daily-excel"
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 flex items-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span>Download Excel</span>
              </button>
            </div>
          </div>

          {dailyReportData ? (
            <>
              {/* Daily Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div className="bg-emerald-900/40 border border-emerald-700/40 rounded-xl p-4">
                  <p className="text-xs text-emerald-400 uppercase tracking-wider mb-1">Received</p>
                  <p className="text-lg font-bold text-emerald-300">{formatCurrency(dailyReportData.received?.total)}</p>
                  <p className="text-xs text-gray-500 mt-1">Cash: {formatCurrency(dailyReportData.received?.cash)} | Bank: {formatCurrency(dailyReportData.received?.bank)}</p>
                </div>
                <div className="bg-red-900/40 border border-red-700/40 rounded-xl p-4">
                  <p className="text-xs text-red-400 uppercase tracking-wider mb-1">Paid</p>
                  <p className="text-lg font-bold text-red-300">{formatCurrency(dailyReportData.paid?.total)}</p>
                  <p className="text-xs text-gray-500 mt-1">Cash: {formatCurrency(dailyReportData.paid?.cash)} | Bank: {formatCurrency(dailyReportData.paid?.bank)}</p>
                </div>
                <div className="bg-amber-900/40 border border-amber-700/40 rounded-xl p-4">
                  <p className="text-xs text-amber-400 uppercase tracking-wider mb-1">Receivables</p>
                  <p className="text-lg font-bold text-amber-300">{formatCurrency(dailyReportData.pending_receivables?.total)}</p>
                </div>
                <div className="bg-orange-900/40 border border-orange-700/40 rounded-xl p-4">
                  <p className="text-xs text-orange-400 uppercase tracking-wider mb-1">Payables</p>
                  <p className="text-lg font-bold text-orange-300">{formatCurrency(dailyReportData.pending_payables?.total)}</p>
                </div>
                <div className={`${(dailyReportData.net_position || 0) >= 0 ? 'bg-blue-900/40 border-blue-700/40' : 'bg-orange-900/40 border-orange-700/40'} border rounded-xl p-4`}>
                  <p className="text-xs text-blue-400 uppercase tracking-wider mb-1">Net Position</p>
                  <p className={`text-lg font-bold ${(dailyReportData.net_position || 0) >= 0 ? 'text-blue-300' : 'text-orange-300'}`}>{formatCurrency(dailyReportData.net_position)}</p>
                </div>
              </div>

              {/* Received Details */}
              {dailyReportData.received?.details?.length > 0 && (
                <div className="bg-gray-800 rounded-xl border border-gray-700/50 mb-4">
                  <div className="px-5 py-3 border-b border-gray-700"><h4 className="text-sm font-semibold text-emerald-400">Amounts Received</h4></div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700" data-testid="received-table">
                      <thead className="bg-gray-750"><tr>
                        {['Type', 'Description', 'Category', 'Amount', 'Payment'].map(h => <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">{h}</th>)}
                      </tr></thead>
                      <tbody className="divide-y divide-gray-700/50">
                        {dailyReportData.received.details.map((d, i) => (
                          <tr key={i} className="hover:bg-gray-700/30">
                            <td className="px-4 py-2 text-sm text-gray-300">{d.Type}</td>
                            <td className="px-4 py-2 text-sm text-white">{d.Description}</td>
                            <td className="px-4 py-2 text-sm text-gray-400">{d.Category}</td>
                            <td className="px-4 py-2 text-sm font-medium text-emerald-400">{formatCurrency(d.Amount)}</td>
                            <td className="px-4 py-2 text-sm text-gray-400">{d['Payment Method']}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Paid Details */}
              {dailyReportData.paid?.details?.length > 0 && (
                <div className="bg-gray-800 rounded-xl border border-gray-700/50 mb-4">
                  <div className="px-5 py-3 border-b border-gray-700"><h4 className="text-sm font-semibold text-red-400">Amounts Paid</h4></div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700" data-testid="paid-table">
                      <thead className="bg-gray-750"><tr>
                        {['Description', 'Category', 'Vendor', 'Amount', 'Payment'].map(h => <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">{h}</th>)}
                      </tr></thead>
                      <tbody className="divide-y divide-gray-700/50">
                        {dailyReportData.paid.details.map((d, i) => (
                          <tr key={i} className="hover:bg-gray-700/30">
                            <td className="px-4 py-2 text-sm text-white">{d.Description}</td>
                            <td className="px-4 py-2 text-sm text-gray-400">{d.Category}</td>
                            <td className="px-4 py-2 text-sm text-gray-400">{d.Vendor || '-'}</td>
                            <td className="px-4 py-2 text-sm font-medium text-red-400">{formatCurrency(d.Amount)}</td>
                            <td className="px-4 py-2 text-sm text-gray-400">{d['Payment Method']}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Pending Receivables */}
              {dailyReportData.pending_receivables?.details?.length > 0 && (
                <div className="bg-gray-800 rounded-xl border border-gray-700/50 mb-4">
                  <div className="px-5 py-3 border-b border-gray-700"><h4 className="text-sm font-semibold text-amber-400">Pending Receivables</h4></div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700" data-testid="receivables-table">
                      <thead className="bg-gray-750"><tr>
                        {['Guest', 'Room', 'Booking Amount', 'Advance Paid', 'Pending Amount', 'Info'].map(h => <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">{h}</th>)}
                      </tr></thead>
                      <tbody className="divide-y divide-gray-700/50">
                        {dailyReportData.pending_receivables.details.map((d, i) => (
                          <tr key={i} className="hover:bg-gray-700/30">
                            <td className="px-4 py-2 text-sm text-white">{d.Guest}</td>
                            <td className="px-4 py-2 text-sm text-gray-300">{d.Room}</td>
                            <td className="px-4 py-2 text-sm text-gray-300">{formatCurrency(d['Booking Amount'])}</td>
                            <td className="px-4 py-2 text-sm text-gray-300">{formatCurrency(d['Advance Paid'])}</td>
                            <td className="px-4 py-2 text-sm font-medium text-amber-400">{formatCurrency(d['Pending Amount'])}</td>
                            <td className="px-4 py-2 text-sm text-gray-500">{d['Check In']}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Pending Payables */}
              {dailyReportData.pending_payables?.details?.length > 0 && (
                <div className="bg-gray-800 rounded-xl border border-gray-700/50 mb-4">
                  <div className="px-5 py-3 border-b border-gray-700"><h4 className="text-sm font-semibold text-orange-400">Pending Payables</h4></div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700" data-testid="payables-table">
                      <thead className="bg-gray-750"><tr>
                        {['Type', 'Description', 'Vendor', 'Category', 'Amount', 'Date'].map(h => <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">{h}</th>)}
                      </tr></thead>
                      <tbody className="divide-y divide-gray-700/50">
                        {dailyReportData.pending_payables.details.map((d, i) => (
                          <tr key={i} className="hover:bg-gray-700/30">
                            <td className="px-4 py-2 text-sm text-gray-300">{d.Type}</td>
                            <td className="px-4 py-2 text-sm text-white">{d.Description}</td>
                            <td className="px-4 py-2 text-sm text-gray-400">{d.Vendor}</td>
                            <td className="px-4 py-2 text-sm text-gray-400">{d.Category}</td>
                            <td className="px-4 py-2 text-sm font-medium text-orange-400">{formatCurrency(d.Amount)}</td>
                            <td className="px-4 py-2 text-sm text-gray-500">{d.Date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* No data message */}
              {(!dailyReportData.received?.details?.length && !dailyReportData.paid?.details?.length) && (
                <div className="bg-gray-800 rounded-xl border border-gray-700/50 p-8 text-center text-gray-400">No transactions found for this date</div>
              )}
            </>
          ) : (
            <div className="bg-gray-800 rounded-xl border border-gray-700/50 p-8 text-center text-gray-400">Loading daily report...</div>
          )}
        </div>
      )}

      {/* === MONTHLY SALES TAB === */}
      {activeTab === 'monthly' && (
        <div>
          {/* Month/Year Picker & Download */}
          <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
            <div className="flex items-center space-x-3">
              <select value={selectedMonth} onChange={(e) => handleMonthChange(selectedYear, parseInt(e.target.value))} data-testid="monthly-month-select"
                className="bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
                {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
              <select value={selectedYear} onChange={(e) => handleMonthChange(parseInt(e.target.value), selectedMonth)} data-testid="monthly-year-select"
                className="bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex space-x-2">
              <button onClick={downloadMonthlyExcel} data-testid="download-monthly-excel"
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 flex items-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span>Download Excel</span>
              </button>
            </div>
          </div>

          {/* Grand Totals Summary */}
          {monthlyReportData?.grand_totals && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-emerald-900/40 border border-emerald-700/40 rounded-xl p-4">
                <p className="text-xs text-emerald-400 uppercase tracking-wider mb-1">Total Received</p>
                <p className="text-lg font-bold text-emerald-300">{formatCurrency(monthlyReportData.grand_totals.total_received)}</p>
              </div>
              <div className="bg-red-900/40 border border-red-700/40 rounded-xl p-4">
                <p className="text-xs text-red-400 uppercase tracking-wider mb-1">Total Paid</p>
                <p className="text-lg font-bold text-red-300">{formatCurrency(monthlyReportData.grand_totals.total_paid)}</p>
              </div>
              <div className="bg-orange-900/40 border border-orange-700/40 rounded-xl p-4">
                <p className="text-xs text-orange-400 uppercase tracking-wider mb-1">Pending Payables</p>
                <p className="text-lg font-bold text-orange-300">{formatCurrency(monthlyReportData.grand_totals.pending_payables)}</p>
              </div>
              <div className={`${(monthlyReportData.grand_totals.net_balance || 0) >= 0 ? 'bg-blue-900/40 border-blue-700/40' : 'bg-orange-900/40 border-orange-700/40'} border rounded-xl p-4`}>
                <p className="text-xs text-blue-400 uppercase tracking-wider mb-1">Net Balance</p>
                <p className={`text-lg font-bold ${(monthlyReportData.grand_totals.net_balance || 0) >= 0 ? 'text-blue-300' : 'text-orange-300'}`}>{formatCurrency(monthlyReportData.grand_totals.net_balance)}</p>
              </div>
            </div>
          )}

          {/* Monthly Chart */}
          {monthlyReportData?.daily_breakdown && (
            <div className="bg-gray-800 rounded-xl border border-gray-700/50 p-6 mb-6">
              <h3 className="text-sm font-semibold text-white mb-4">Monthly Growth ({monthlyReportData.month})</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyReportData.daily_breakdown.filter(d => d.total_received > 0 || d.total_paid > 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="day" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }}
                      formatter={(value) => formatCurrency(value)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="total_received" name="Received" fill="#10B981" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="total_paid" name="Paid" fill="#EF4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Day-by-Day Table */}
          {monthlyReportData?.daily_breakdown && (
            <div className="bg-gray-800 rounded-xl border border-gray-700/50">
              <div className="px-5 py-3 border-b border-gray-700">
                <h4 className="text-sm font-semibold text-white">Day-by-Day Ledger — {monthlyReportData.month}</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700 text-xs" data-testid="monthly-ledger-table">
                  <thead className="bg-gray-750"><tr>
                    {['Date', 'Rcvd (Cash)', 'Rcvd (Bank)', 'Total Rcvd', 'Paid (Cash)', 'Paid (Bank)', 'Total Paid', 'Pending', 'Net Balance'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-400 uppercase">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {monthlyReportData.daily_breakdown.map((d, i) => (
                      <tr key={i} className={`hover:bg-gray-700/30 ${d.total_received > 0 || d.total_paid > 0 ? '' : 'opacity-40'}`}>
                        <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{d.date}</td>
                        <td className="px-3 py-2 text-emerald-400">{d.received_cash > 0 ? formatCurrency(d.received_cash) : '-'}</td>
                        <td className="px-3 py-2 text-emerald-400">{d.received_bank > 0 ? formatCurrency(d.received_bank) : '-'}</td>
                        <td className="px-3 py-2 font-medium text-emerald-300">{d.total_received > 0 ? formatCurrency(d.total_received) : '-'}</td>
                        <td className="px-3 py-2 text-red-400">{d.paid_cash > 0 ? formatCurrency(d.paid_cash) : '-'}</td>
                        <td className="px-3 py-2 text-red-400">{d.paid_bank > 0 ? formatCurrency(d.paid_bank) : '-'}</td>
                        <td className="px-3 py-2 font-medium text-red-300">{d.total_paid > 0 ? formatCurrency(d.total_paid) : '-'}</td>
                        <td className="px-3 py-2 text-orange-400">{d.pending_payables > 0 ? formatCurrency(d.pending_payables) : '-'}</td>
                        <td className={`px-3 py-2 font-medium ${d.net_balance >= 0 ? 'text-blue-300' : 'text-orange-300'}`}>
                          {d.net_balance !== 0 ? formatCurrency(d.net_balance) : '-'}
                        </td>
                      </tr>
                    ))}
                    {/* Grand Total Row */}
                    {monthlyReportData.grand_totals && (
                      <tr className="bg-gray-700/60 font-bold">
                        <td className="px-3 py-3 text-white">TOTAL</td>
                        <td className="px-3 py-3 text-emerald-400">{formatCurrency(monthlyReportData.grand_totals.received_cash)}</td>
                        <td className="px-3 py-3 text-emerald-400">{formatCurrency(monthlyReportData.grand_totals.received_bank)}</td>
                        <td className="px-3 py-3 text-emerald-300">{formatCurrency(monthlyReportData.grand_totals.total_received)}</td>
                        <td className="px-3 py-3 text-red-400">{formatCurrency(monthlyReportData.grand_totals.paid_cash)}</td>
                        <td className="px-3 py-3 text-red-400">{formatCurrency(monthlyReportData.grand_totals.paid_bank)}</td>
                        <td className="px-3 py-3 text-red-300">{formatCurrency(monthlyReportData.grand_totals.total_paid)}</td>
                        <td className="px-3 py-3 text-orange-400">{formatCurrency(monthlyReportData.grand_totals.pending_payables)}</td>
                        <td className={`px-3 py-3 ${(monthlyReportData.grand_totals.net_balance || 0) >= 0 ? 'text-blue-300' : 'text-orange-300'}`}>
                          {formatCurrency(monthlyReportData.grand_totals.net_balance)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* === RECORDS TAB === */}
      {activeTab === 'records' && (
        <>
          {/* Expense Records */}
          <div className="bg-gray-800 rounded-xl border border-gray-700/50 mb-6">
            <div className="px-5 py-3 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Expense Records</h3>
              <span className="text-xs text-gray-400">{expenses.length} records</span>
            </div>
            {expenses.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No expenses recorded</div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-700" data-testid="expense-records-table">
                    <thead className="bg-gray-750"><tr>
                      {['Description', 'Vendor', 'Amount', 'Category', 'Payment', 'Status', 'Date', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-700/50">
                      {getPaginatedData(expenses, expensePage).map((expense) => (
                        <tr key={expense.id} className="hover:bg-gray-700/30">
                          <td className="px-4 py-3 text-sm text-white">{expense.description}</td>
                          <td className="px-4 py-3 text-sm text-gray-400">{expense.vendor || '-'}</td>
                          <td className="px-4 py-3 text-sm font-medium text-red-400">{formatCurrency(expense.amount)}</td>
                          <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300">{expense.category}</span></td>
                          <td className="px-4 py-3 text-sm text-gray-400">{expense.payment_method}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${expense.payment_status === 'Paid' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-amber-900/50 text-amber-400'}`}>
                              {expense.payment_status || 'Paid'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-400">{expense.expense_date}</td>
                          <td className="px-4 py-3 text-sm space-x-2">
                            {(expense.payment_status === 'Pending') && (
                              <button onClick={() => { setShowMarkPaidModal(expense.id); setMarkPaidMethod('Cash'); }} data-testid={`mark-paid-${expense.id}`}
                                className="bg-emerald-600 text-white px-2 py-1 rounded text-xs hover:bg-emerald-700">Mark Paid</button>
                            )}
                            <button onClick={() => handleDeleteExpense(expense.id)} data-testid={`delete-expense-${expense.id}`}
                              className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {renderPagination(expenses, expensePage, setExpensePage)}
              </div>
            )}
          </div>

          {/* Income Records - Room Bookings */}
          <div className="bg-gray-800 rounded-xl border border-gray-700/50 mb-6">
            <div className="px-5 py-3 border-b border-gray-700"><h3 className="text-sm font-semibold text-emerald-400">Room Bookings Income</h3></div>
            {dailySales.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No room booking income recorded</div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-750"><tr>
                      {['Date', 'Guest', 'Room', 'Payment', 'Amount'].map(h => <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">{h}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-700/50">
                      {getPaginatedData(dailySales, roomBookingsPage).map((sale, i) => (
                        <tr key={i} className="hover:bg-gray-700/30">
                          <td className="px-4 py-3 text-sm text-gray-300">{new Date(sale.date).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-sm text-white">{sale.customer_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-300">{sale.room_number}</td>
                          <td className="px-4 py-3 text-sm text-gray-400">{sale.payment_method}</td>
                          <td className="px-4 py-3 text-sm font-medium text-emerald-400">{formatCurrency(sale.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {renderPagination(dailySales, roomBookingsPage, setRoomBookingsPage)}
              </div>
            )}
          </div>

          {/* Additional Income */}
          <div className="bg-gray-800 rounded-xl border border-gray-700/50">
            <div className="px-5 py-3 border-b border-gray-700"><h3 className="text-sm font-semibold text-blue-400">Additional Income</h3></div>
            {incomes.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No additional income recorded</div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-750"><tr>
                      {['Date', 'Description', 'Category', 'Amount', 'Action'].map(h => <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">{h}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-700/50">
                      {getPaginatedData(incomes, additionalIncomePage).map((income, i) => (
                        <tr key={i} className="hover:bg-gray-700/30">
                          <td className="px-4 py-3 text-sm text-gray-300">{new Date(income.income_date).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-sm text-white">{income.description}</td>
                          <td className="px-4 py-3 text-sm text-gray-400">{income.category}</td>
                          <td className="px-4 py-3 text-sm font-medium text-emerald-400">{formatCurrency(income.amount)}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => handleDeleteIncome(income.id)} className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {renderPagination(incomes, additionalIncomePage, setAdditionalIncomePage)}
              </div>
            )}
          </div>
        </>
      )}

      {/* === ADD EXPENSE MODAL === */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg border border-gray-700" data-testid="add-expense-modal">
            <h3 className="text-lg font-semibold text-white mb-4">Add New Expense</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description *</label>
                <input type="text" value={expenseData.description} onChange={(e) => setExpenseData({...expenseData, description: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="Enter expense description" data-testid="expense-description" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Amount (LKR) *</label>
                  <input type="number" step="0.01" value={expenseData.amount} onChange={(e) => setExpenseData({...expenseData, amount: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" placeholder="0.00" data-testid="expense-amount" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Date *</label>
                  <input type="date" value={expenseData.expense_date} onChange={(e) => setExpenseData({...expenseData, expense_date: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" data-testid="expense-date" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Category *</label>
                <select value={expenseData.category} onChange={(e) => setExpenseData({...expenseData, category: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" data-testid="expense-category">
                  <option value="">Select category</option>
                  {expenseCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                {user?.role === 'Admin' && (
                  <div className="flex mt-2 space-x-2">
                    <input type="text" value={newExpenseCategory} onChange={(e) => setNewExpenseCategory(e.target.value)}
                      className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs" placeholder="New category name" />
                    <button onClick={handleAddExpenseCategory} disabled={!newExpenseCategory.trim()} data-testid="add-expense-category-btn"
                      className="px-3 py-1 bg-teal-600 text-white rounded text-xs hover:bg-teal-700 disabled:opacity-50">+ Add</button>
                  </div>
                )}
              </div>
              {/* Vendor with Autocomplete */}
              <div ref={vendorRef} className="relative">
                <label className="block text-sm font-medium text-gray-300 mb-1">Vendor</label>
                <input type="text" value={expenseData.vendor}
                  onChange={(e) => { setExpenseData({...expenseData, vendor: e.target.value}); fetchVendors(e.target.value); setShowVendorDropdown(true); }}
                  onFocus={() => { fetchVendors(expenseData.vendor); setShowVendorDropdown(true); }}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" placeholder="Type vendor name..." data-testid="expense-vendor" />
                {showVendorDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg max-h-40 overflow-y-auto shadow-xl">
                    {filteredVendors.length > 0 ? filteredVendors.map((v, i) => (
                      <button key={i} onClick={() => { setExpenseData({...expenseData, vendor: v}); setShowVendorDropdown(false); }}
                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-600">{v}</button>
                    )) : (
                      <div className="px-3 py-2 text-xs text-gray-400">No vendors found</div>
                    )}
                    <div className="border-t border-gray-600 p-2">
                      <div className="flex space-x-2">
                        <input type="text" value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)}
                          className="flex-1 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-xs" placeholder="Add new vendor" />
                        <button onClick={handleAddVendor} disabled={!newVendorName.trim()} data-testid="add-vendor-btn"
                          className="px-3 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 disabled:opacity-50">+ Add</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Payment Method *</label>
                <select value={expenseData.payment_method} onChange={(e) => setExpenseData({...expenseData, payment_method: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" data-testid="expense-payment-method">
                  {paymentMethods.map(method => <option key={method} value={method}>{method}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {expenseData.payment_method === 'Add to Account' ? 'This will be tracked as a pending payable' :
                    `This will deduct from ${expenseData.payment_method === 'Cash' ? 'Cash Balance' : 'Bank Balance'}`}
                </p>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowAddExpenseModal(false)} className="px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 text-sm">Cancel</button>
              <button onClick={handleAddExpense} data-testid="submit-expense-btn"
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">Add Expense</button>
            </div>
          </div>
        </div>
      )}

      {/* === ADD INCOME MODAL === */}
      {showAddIncomeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg border border-gray-700" data-testid="add-income-modal">
            <h3 className="text-lg font-semibold text-white mb-4">Add New Income</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description *</label>
                <input type="text" value={incomeData.description} onChange={(e) => setIncomeData({...incomeData, description: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" placeholder="Enter income description" data-testid="income-description" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Amount (LKR) *</label>
                  <input type="number" step="0.01" value={incomeData.amount} onChange={(e) => setIncomeData({...incomeData, amount: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" placeholder="0.00" data-testid="income-amount" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Date *</label>
                  <input type="date" value={incomeData.income_date} onChange={(e) => setIncomeData({...incomeData, income_date: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" data-testid="income-date" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Category *</label>
                <select value={incomeData.category} onChange={(e) => setIncomeData({...incomeData, category: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" data-testid="income-category">
                  <option value="">Select category</option>
                  {incomeCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                {user?.role === 'Admin' && (
                  <div className="flex mt-2 space-x-2">
                    <input type="text" value={newIncomeCategory} onChange={(e) => setNewIncomeCategory(e.target.value)}
                      className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs" placeholder="New category name" />
                    <button onClick={handleAddIncomeCategory} disabled={!newIncomeCategory.trim()} data-testid="add-income-category-btn"
                      className="px-3 py-1 bg-teal-600 text-white rounded text-xs hover:bg-teal-700 disabled:opacity-50">+ Add</button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Payment Method *</label>
                <select value={incomeData.payment_method} onChange={(e) => setIncomeData({...incomeData, payment_method: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" data-testid="income-payment-method">
                  {['Cash', 'Card', 'Bank Transfer'].map(method => <option key={method} value={method}>{method}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowAddIncomeModal(false)} className="px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 text-sm">Cancel</button>
              <button onClick={handleAddIncome} data-testid="submit-income-btn"
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">Add Income</button>
            </div>
          </div>
        </div>
      )}

      {/* === MARK PAID MODAL === */}
      {showMarkPaidModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-700" data-testid="mark-paid-modal">
            <h3 className="text-lg font-semibold text-white mb-4">Mark Expense as Paid</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">Payment Method</label>
              <select value={markPaidMethod} onChange={(e) => setMarkPaidMethod(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" data-testid="mark-paid-method">
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setShowMarkPaidModal(null)} className="px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 text-sm">Cancel</button>
              <button onClick={() => handleMarkPaid(showMarkPaidModal)} data-testid="confirm-mark-paid"
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">Confirm Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Guests Component
const Guests = () => {
  const [guests, setGuests] = useState([]);
  const [filteredGuests, setFilteredGuests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [showGuestDetails, setShowGuestDetails] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showEditGuestModal, setShowEditGuestModal] = useState(false);
  const [showSMSModal, setShowSMSModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [guestsPerPage] = useState(20);
  const [smsData, setSmsData] = useState({
    phone_number: '',
    message: '',
    guest_id: ''
  });
  const [emailData, setEmailData] = useState({
    email: '',
    subject: '',
    body: '',
    guest_id: ''
  });
  const [sendingMessage, setSendingMessage] = useState(false);
  const [editGuestData, setEditGuestData] = useState({
    guest_id: '',
    name: '',
    email: '',
    phone: '',
    id_passport: '',
    country: ''
  });
  const [downloadDateRange, setDownloadDateRange] = useState({
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchGuests();
  }, []);

  useEffect(() => {
    // Filter guests based on search query
    if (searchQuery.trim() === '') {
      setFilteredGuests(guests);
    } else {
      const filtered = guests.filter(guest => {
        const searchLower = searchQuery.toLowerCase();
        const name = guest.name ? guest.name.toLowerCase() : '';
        const email = guest.email ? guest.email.toLowerCase() : '';
        const phone = guest.phone ? guest.phone.toString() : '';
        
        return name.includes(searchLower) ||
               email.includes(searchLower) ||
               phone.includes(searchQuery);
      });
      setFilteredGuests(filtered);
    }
    // Reset to first page when search changes
    setCurrentPage(1);
  }, [guests, searchQuery]);

  // Pagination logic
  const indexOfLastGuest = currentPage * guestsPerPage;
  const indexOfFirstGuest = indexOfLastGuest - guestsPerPage;
  const currentGuests = filteredGuests.slice(indexOfFirstGuest, indexOfLastGuest);
  const totalPages = Math.ceil(filteredGuests.length / guestsPerPage);

  const fetchGuests = async () => {
    try {
      const response = await axios.get(`${API}/guests`);
      setGuests(response.data);
      setFilteredGuests(response.data);
    } catch (error) {
      console.error('Error fetching guests:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGuestDetails = async (guestId) => {
    try {
      const response = await axios.get(`${API}/guests/${encodeURIComponent(guestId)}`);
      setSelectedGuest(response.data);
      setShowGuestDetails(true);
    } catch (error) {
      console.error('Error fetching guest details:', error);
      alert('Could not load guest details.');
    }
  };

  const openEditGuestModal = (guest) => {
    // Remove "Not provided" placeholder values when editing
    const cleanValue = (value) => (value === 'Not provided' ? '' : (value || ''));
    
    setEditGuestData({
      guest_id: guest.id,  // Use the unique guest identifier
      name: guest.name || '',
      email: cleanValue(guest.email),
      phone: cleanValue(guest.phone),
      id_passport: guest.id_passport || '',
      country: guest.country || ''
    });
    setShowEditGuestModal(true);
  };

  const handleUpdateGuest = async () => {
    try {
      await axios.put(`${API}/guests/update`, editGuestData);
      setShowEditGuestModal(false);
      fetchGuests(); // Refresh the list
      alert('Guest details updated successfully!');
    } catch (error) {
      console.error('Error updating guest:', error);
      alert('Error updating guest: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Open SMS Modal with pre-filled data
  const openSMSModal = (guest) => {
    setSmsData({
      phone_number: guest.phone || '',
      message: '',
      guest_id: guest.id || ''
    });
    setShowSMSModal(true);
    setActiveDropdown(null);
  };

  // Open Email Modal with pre-filled data
  const openEmailModal = (guest) => {
    setEmailData({
      email: guest.email || '',
      subject: '',
      body: '',
      guest_id: guest.id || ''
    });
    setShowEmailModal(true);
    setActiveDropdown(null);
  };

  // Send custom SMS
  const handleSendSMS = async () => {
    if (!smsData.phone_number || !smsData.message) {
      alert('Please enter phone number and message');
      return;
    }
    setSendingMessage(true);
    try {
      await axios.post(`${API}/send-custom-sms`, smsData);
      alert('SMS sent successfully!');
      setShowSMSModal(false);
      setSmsData({ phone_number: '', message: '', guest_id: '' });
    } catch (error) {
      console.error('Error sending SMS:', error);
      alert('Error sending SMS: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSendingMessage(false);
    }
  };

  // Send custom Email
  const handleSendEmail = async () => {
    if (!emailData.email || !emailData.subject || !emailData.body) {
      alert('Please fill in all fields');
      return;
    }
    setSendingMessage(true);
    try {
      await axios.post(`${API}/send-custom-email`, emailData);
      alert('Email sent successfully!');
      setShowEmailModal(false);
      setEmailData({ email: '', subject: '', body: '', guest_id: '' });
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Error sending email: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSendingMessage(false);
    }
  };

  // Toggle dropdown menu
  const toggleDropdown = (guestId) => {
    setActiveDropdown(activeDropdown === guestId ? null : guestId);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    if (activeDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [activeDropdown]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Upcoming':
        return 'bg-blue-100 text-blue-800';
      case 'Checked-in':
        return 'bg-green-100 text-green-800';
      case 'Completed':
        return 'bg-gray-100 text-gray-800';
      case 'Cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleDownloadGuests = async () => {
    try {
      if (!downloadDateRange.startDate || !downloadDateRange.endDate) {
        alert('Please select both start and end dates');
        return;
      }

      // Get all bookings and filter by date range
      const response = await axios.get(`${API}/bookings`);
      const allBookings = response.data.bookings || response.data;
      
      if (!allBookings || allBookings.length === 0) {
        alert('No booking data found.');
        return;
      }
      
      // Filter bookings based on date range (check-in dates within the selected range)
      const startDate = new Date(downloadDateRange.startDate);
      const endDate = new Date(downloadDateRange.endDate);
      
      const filteredBookings = allBookings.filter(booking => {
        if (booking.check_in_date) {
          const checkInDate = new Date(booking.check_in_date);
          return checkInDate >= startDate && checkInDate <= endDate;
        }
        return false;
      });

      // If no bookings found with date filtering, offer to download all
      let dataToDownload = filteredBookings;
      if (filteredBookings.length === 0) {
        const downloadAll = window.confirm(
          `No guest bookings found in the selected date range (${downloadDateRange.startDate} to ${downloadDateRange.endDate}). Would you like to download all ${allBookings.length} guest records instead?`
        );
        
        if (downloadAll) {
          dataToDownload = allBookings;
        } else {
          alert('No guest data downloaded.');
          return;
        }
      }

      // Prepare data for Excel export - extract guest information from bookings
      const excelData = dataToDownload.map(booking => ({
        'Guest Name': booking.guest_name || '',
        'Email': booking.guest_email || '',
        'Phone': booking.guest_phone || '',
        'Country': booking.country || '',
        'Guest ID/Passport': booking.guest_id_passport || '',
        'Room Number': booking.room_number || '',
        'Check-in Date': booking.check_in_date ? new Date(booking.check_in_date).toLocaleDateString() : '',
        'Check-out Date': booking.check_out_date ? new Date(booking.check_out_date).toLocaleDateString() : '',
        'Stay Type': booking.stay_type || '',
        'Booking Amount (LKR)': booking.booking_amount || 0,
        'Booking Status': booking.status || '',
        'Additional Notes': booking.additional_notes || '',
        'Booking Created': booking.created_at ? new Date(booking.created_at).toLocaleDateString() : ''
      }));

      // Create Excel workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      
      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Guest Data');
      
      // Generate filename
      const filename = `guest_data_${downloadDateRange.startDate}_to_${downloadDateRange.endDate}.xlsx`;
      
      // Download the Excel file
      XLSX.writeFile(wb, filename);

      setShowDownloadModal(false);
      alert(`Downloaded ${dataToDownload.length} guest records to Excel file`);
    } catch (error) {
      console.error('Error downloading guest data:', error);
      alert('Error downloading guest data: ' + (error.response?.data?.detail || error.message || 'Please try again.'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header - Gradient Style */}
      <div className="bg-gradient-to-r from-purple-800 to-pink-700 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Guests</h2>
            <p className="text-purple-200">Manage guest information and booking history</p>
          </div>
          <button
            onClick={() => setShowDownloadModal(true)}
            className="bg-white text-purple-800 px-4 py-2 rounded-lg hover:bg-purple-100 flex items-center font-medium"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Guest Data
          </button>
        </div>
      </div>

      {/* Search Section */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search guests by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-gray-800 border border-gray-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-400">🔍</span>
          </div>
        </div>
        {searchQuery && (
          <p className="mt-2 text-sm text-gray-300">
            Showing {filteredGuests.length} result(s) for "{searchQuery}"
          </p>
        )}
      </div>

      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700">
        {filteredGuests.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            {searchQuery ? `No guests found matching "${searchQuery}"` : 'No guests found'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Guest Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Total Bookings
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Upcoming Bookings
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Last Stay
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {currentGuests.map((guest) => (
                  <tr key={guest.id} className="hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">{guest.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">{guest.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">{guest.phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">{guest.total_bookings}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">{guest.upcoming_bookings}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">
                        {guest.last_stay ? guest.last_stay : 'Never'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleDropdown(guest.id);
                          }}
                          className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700 transition-colors flex items-center"
                          data-testid={`guest-actions-${guest.id}`}
                        >
                          Actions
                          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {activeDropdown === guest.id && (
                          <div className="absolute right-0 mt-1 w-40 bg-gray-700 rounded-md shadow-lg z-20 border border-gray-600">
                            <button
                              onClick={() => {
                                fetchGuestDetails(guest.id);
                                setActiveDropdown(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-600 flex items-center"
                              data-testid={`view-details-${guest.id}`}
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              View Details
                            </button>
                            <button
                              onClick={() => {
                                openEditGuestModal(guest);
                                setActiveDropdown(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-600 flex items-center"
                              data-testid={`edit-guest-${guest.id}`}
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edit
                            </button>
                            <button
                              onClick={() => openSMSModal(guest)}
                              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-600 flex items-center"
                              data-testid={`send-sms-${guest.id}`}
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                              </svg>
                              Send SMS
                            </button>
                            <button
                              onClick={() => openEmailModal(guest)}
                              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-600 flex items-center"
                              data-testid={`send-email-${guest.id}`}
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              Send Email
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-gray-700 border-t border-gray-600">
                <div className="text-sm text-gray-300">
                  Showing {indexOfFirstGuest + 1} to {Math.min(indexOfLastGuest, filteredGuests.length)} of {filteredGuests.length} guests
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 bg-gray-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-500"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-white">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 bg-gray-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-500"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SMS Modal */}
      {showSMSModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Send SMS</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                <input
                  type="text"
                  value={smsData.phone_number}
                  onChange={(e) => setSmsData({...smsData, phone_number: e.target.value})}
                  placeholder="e.g., 94771234567"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  data-testid="sms-phone-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
                <textarea
                  value={smsData.message}
                  onChange={(e) => setSmsData({...smsData, message: e.target.value})}
                  rows={4}
                  placeholder="Enter your message..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  data-testid="sms-message-input"
                />
                <p className="text-xs text-gray-500 mt-1">{smsData.message.length} characters</p>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowSMSModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={sendingMessage}
              >
                Cancel
              </button>
              <button
                onClick={handleSendSMS}
                disabled={sendingMessage}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                data-testid="send-sms-btn"
              >
                {sendingMessage ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sending...
                  </>
                ) : 'Send SMS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Send Email</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  value={emailData.email}
                  onChange={(e) => setEmailData({...emailData, email: e.target.value})}
                  placeholder="guest@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  data-testid="email-address-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                <input
                  type="text"
                  value={emailData.subject}
                  onChange={(e) => setEmailData({...emailData, subject: e.target.value})}
                  placeholder="Enter subject..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  data-testid="email-subject-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
                <textarea
                  value={emailData.body}
                  onChange={(e) => setEmailData({...emailData, body: e.target.value})}
                  rows={6}
                  placeholder="Enter your message..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  data-testid="email-body-input"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowEmailModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={sendingMessage}
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={sendingMessage}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center"
                data-testid="send-email-btn"
              >
                {sendingMessage ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sending...
                  </>
                ) : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Guest Modal */}
      {showEditGuestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Edit Guest Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editGuestData.name}
                  onChange={(e) => setEditGuestData({...editGuestData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editGuestData.email}
                  onChange={(e) => setEditGuestData({...editGuestData, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={editGuestData.phone}
                  onChange={(e) => setEditGuestData({...editGuestData, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID/Passport</label>
                <input
                  type="text"
                  value={editGuestData.id_passport}
                  onChange={(e) => setEditGuestData({...editGuestData, id_passport: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <input
                  type="text"
                  value={editGuestData.country}
                  onChange={(e) => setEditGuestData({...editGuestData, country: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowEditGuestModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateGuest}
                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
              >
                Update Guest
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guest Details Modal */}
      {showGuestDetails && selectedGuest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="guest-details-modal">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-white">Guest Details</h3>
              <button
                onClick={() => setShowGuestDetails(false)}
                className="text-gray-400 hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="mb-6">
              <h4 className="text-lg font-medium text-white mb-2">{selectedGuest.name}</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Email:</span>
                  <span className="ml-2 text-gray-200">{selectedGuest.email || 'Not provided'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Phone:</span>
                  <span className="ml-2 text-gray-200">{selectedGuest.phone || 'Not provided'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Country:</span>
                  <span className="ml-2 text-gray-200">{selectedGuest.country || 'Not provided'}</span>
                </div>
                <div>
                  <span className="text-gray-400">ID/Passport:</span>
                  <span className="ml-2 text-gray-200">{selectedGuest.id_passport || 'Not provided'}</span>
                </div>
              </div>
            </div>

            {/* ID Proof Section */}
            <div className="mb-6 p-4 bg-gray-700 rounded-lg" data-testid="guest-proof-section">
              <h4 className="text-md font-medium text-white mb-3">ID / Passport Proof</h4>
              {selectedGuest.id_proof ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <p className="text-white text-sm font-medium">{selectedGuest.id_proof_filename || 'document.pdf'}</p>
                      <p className="text-gray-400 text-xs">PDF Document</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = `data:application/pdf;base64,${selectedGuest.id_proof}`;
                        link.download = selectedGuest.id_proof_filename || 'id_proof.pdf';
                        link.click();
                      }}
                      className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
                      data-testid="download-proof-btn"
                    >
                      Download
                    </button>
                    <button
                      onClick={async () => {
                        if (!window.confirm('Delete this ID proof?')) return;
                        try {
                          const guestId = selectedGuest.email && selectedGuest.email !== 'Not provided' ? selectedGuest.email : guests.find(g => g.name === selectedGuest.name)?.id;
                          await axios.delete(`${API}/guests/delete-proof/${encodeURIComponent(guestId)}`);
                          setSelectedGuest(prev => ({...prev, id_proof: '', id_proof_filename: ''}));
                          alert('ID proof deleted successfully');
                        } catch (error) {
                          alert('Error deleting proof: ' + (error.response?.data?.detail || error.message));
                        }
                      }}
                      className="bg-red-600 text-white px-3 py-1.5 rounded text-sm hover:bg-red-700"
                      data-testid="delete-proof-btn"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-gray-400 text-sm mb-3">No ID proof uploaded</p>
                  <div className="flex items-center space-x-2">
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        if (file.type !== 'application/pdf') { alert('Only PDF files allowed'); return; }
                        if (file.size > 5 * 1024 * 1024) { alert('Max 5MB'); return; }
                        const reader = new FileReader();
                        reader.onload = async () => {
                          try {
                            const base64 = reader.result.split(',')[1];
                            const guestId = selectedGuest.email && selectedGuest.email !== 'Not provided' ? selectedGuest.email : guests.find(g => g.name === selectedGuest.name)?.id;
                            await axios.post(`${API}/guests/upload-proof`, {
                              guest_id: guestId,
                              id_proof: base64,
                              id_proof_filename: file.name
                            });
                            setSelectedGuest(prev => ({...prev, id_proof: base64, id_proof_filename: file.name}));
                            alert('ID proof uploaded successfully');
                          } catch (error) {
                            alert('Error uploading: ' + (error.response?.data?.detail || error.message));
                          }
                        };
                        reader.readAsDataURL(file);
                      }}
                      className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                      data-testid="upload-proof-input"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <h4 className="text-lg font-medium text-white mb-4">Booking History</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Room</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Check-in</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Check-out</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Booked On</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {selectedGuest.bookings.map((booking) => (
                      <tr key={booking.id} className="hover:bg-gray-700">
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-200">{booking.room_number}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-200">{booking.check_in_date}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-200">{booking.check_out_date}</td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(booking.status)}`}>
                            {booking.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-green-400 font-medium">
                          LKR {(booking.booking_amount || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-200">
                          {new Date(booking.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowGuestDetails(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Download Guest Data</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  value={downloadDateRange.startDate}
                  onChange={(e) => setDownloadDateRange({...downloadDateRange, startDate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date *
                </label>
                <input
                  type="date"
                  value={downloadDateRange.endDate}
                  onChange={(e) => setDownloadDateRange({...downloadDateRange, endDate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="text-sm text-gray-600">
                <p>Download guest data based on the selected date range. If no guests have completed stays in the date range, you'll be offered to download all guests.</p>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowDownloadModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDownloadGuests}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Download Excel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Bookings Component
const Bookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadDateRange, setDownloadDateRange] = useState({
    start_date: '',
    end_date: '',
    status: ''
  });

  useEffect(() => {
    fetchBookings();
  }, []); // Initial load only

  useEffect(() => {
    if (currentPage !== 1 || statusFilter !== '') {
      fetchBookings();
    }
  }, [currentPage, statusFilter]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      fetchBookings(1, '', statusFilter); // Reset search
    } else {
      const delayedSearch = setTimeout(() => {
        fetchBookings(1, searchTerm, statusFilter); // Search with reset to page 1
      }, 300);
      return () => clearTimeout(delayedSearch);
    }
  }, [searchTerm]);

  const fetchBookings = async (pageParam = currentPage, searchParam = searchTerm, statusParam = statusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageParam.toString(),
        limit: '20',
        search: searchParam || '', 
        status: statusParam || ''
      });
      
      const response = await axios.get(`${API}/bookings?${params}`);
      
      setBookings(response.data.bookings || []);
      setTotalPages(response.data.total_pages || 1);
      setTotalCount(response.data.total_count || 0);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      setBookings([]);
      setTotalPages(1);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (value) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleStatusChange = (value) => {
    setStatusFilter(value);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handleDownload = async () => {
    try {
      // Fetch all bookings first, then filter on frontend if needed
      let apiUrl = `${API}/bookings`;
      let queryParams = [];
      
      // Add pagination parameter to get all bookings
      queryParams.push('page=1');
      queryParams.push('limit=1000'); // Get a large number of bookings
      
      if (queryParams.length > 0) {
        apiUrl += '?' + queryParams.join('&');
      }
      
      const response = await axios.get(apiUrl);
      let bookingsData = response.data.bookings || response.data;
      
      if (!bookingsData || bookingsData.length === 0) {
        alert('No bookings found.');
        return;
      }

      // Apply date filtering on frontend
      if (downloadDateRange.start_date || downloadDateRange.end_date) {
        bookingsData = bookingsData.filter(booking => {
          const bookingDate = new Date(booking.check_in_date);
          let matchesDateRange = true;
          
          if (downloadDateRange.start_date) {
            const startDate = new Date(downloadDateRange.start_date);
            matchesDateRange = matchesDateRange && bookingDate >= startDate;
          }
          
          if (downloadDateRange.end_date) {
            const endDate = new Date(downloadDateRange.end_date);
            matchesDateRange = matchesDateRange && bookingDate <= endDate;
          }
          
          return matchesDateRange;
        });
      }

      // Apply status filtering on frontend
      if (downloadDateRange.status && downloadDateRange.status !== 'All') {
        bookingsData = bookingsData.filter(booking => 
          booking.status && booking.status.toLowerCase() === downloadDateRange.status.toLowerCase()
        );
      }
      
      if (bookingsData.length === 0) {
        alert('No bookings found for the selected criteria.');
        return;
      }

      // Prepare data for Excel export
      const excelData = bookingsData.map(booking => ({
        'Booking ID': booking.id || '',
        'Guest Name': booking.guest_name || '',
        'Guest Email': booking.guest_email || '',
        'Guest Phone': booking.guest_phone || '',
        'Country': booking.country || '',
        'Guest ID/Passport': booking.guest_id_passport || '',
        'Room Number': booking.room_number || '',
        'Check-in Date': booking.check_in_date ? new Date(booking.check_in_date).toLocaleDateString() : '',
        'Check-out Date': booking.check_out_date ? new Date(booking.check_out_date).toLocaleDateString() : '',
        'Stay Type': booking.stay_type || '',
        'Booking Amount (LKR)': booking.booking_amount || 0,
        'Status': booking.status || '',
        'Additional Notes': booking.additional_notes || '',
        'Created At': booking.created_at ? new Date(booking.created_at).toLocaleDateString() : ''
      }));

      // Create Excel workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      
      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Bookings Data');
      
      // Generate filename with filters applied
      let filename = 'bookings';
      if (downloadDateRange.start_date && downloadDateRange.end_date) {
        filename += `_${downloadDateRange.start_date}_to_${downloadDateRange.end_date}`;
      } else if (downloadDateRange.start_date) {
        filename += `_from_${downloadDateRange.start_date}`;
      } else if (downloadDateRange.end_date) {
        filename += `_until_${downloadDateRange.end_date}`;
      }
      if (downloadDateRange.status && downloadDateRange.status !== 'All') {
        filename += `_${downloadDateRange.status.toLowerCase()}`;
      }
      filename += '.xlsx';
      
      // Download the Excel file
      XLSX.writeFile(wb, filename);
      
      setShowDownloadModal(false);
      alert(`Downloaded ${bookingsData.length} booking records to Excel file`);
    } catch (error) {
      console.error('Error downloading bookings:', error);
      alert('Error downloading bookings data: ' + (error.response?.data?.detail || error.message || 'Please try again.'));
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Upcoming':
        return 'bg-blue-100 text-blue-800';
      case 'Checked-in':
        return 'bg-green-100 text-green-800';
      case 'Completed':
        return 'bg-gray-100 text-gray-800';
      case 'Cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const renderPagination = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // Previous button
    if (currentPage > 1) {
      pages.push(
        <button
          key="prev"
          onClick={() => setCurrentPage(currentPage - 1)}
          className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Previous
        </button>
      );
    }

    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => setCurrentPage(i)}
          className={`px-3 py-2 text-sm font-medium border rounded-md ${
            i === currentPage
              ? 'bg-blue-600 text-white border-blue-600'
              : 'text-gray-500 bg-white border-gray-300 hover:bg-gray-50'
          }`}
        >
          {i}
        </button>
      );
    }

    // Next button
    if (currentPage < totalPages) {
      pages.push(
        <button
          key="next"
          onClick={() => setCurrentPage(currentPage + 1)}
          className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Next
        </button>
      );
    }

    return (
      <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center text-sm text-gray-700">
          Showing {((currentPage - 1) * 20) + 1} to {Math.min(currentPage * 20, totalCount)} of {totalCount} bookings
        </div>
        <div className="flex space-x-1">
          {pages}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header - Gradient Style */}
      <div className="bg-gradient-to-r from-teal-800 to-cyan-600 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">All Bookings</h2>
            <p className="text-teal-200">Manage all hotel bookings and reservations</p>
          </div>
          <button
            onClick={() => setShowDownloadModal(true)}
            className="bg-white text-teal-800 px-4 py-2 rounded-lg hover:bg-teal-100 flex items-center font-medium"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download CSV
          </button>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by guest name, email, phone, or room number..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-600 text-white rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
          />
        </div>
        <div className="sm:w-48">
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-600 text-white rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Status</option>
            <option value="Upcoming">Upcoming</option>
            <option value="Checked-in">Checked-in</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700">
        {bookings.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            {searchTerm || statusFilter ? 'No bookings found matching your criteria' : 'No bookings found'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Guest Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Room
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Check-in
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Check-out
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">{booking.guest_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">{booking.guest_email || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">{booking.guest_phone || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">{booking.room_number}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">{booking.check_in_date}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">{booking.check_out_date}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(booking.status)}`}>
                          {booking.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'LKR'
                          }).format(booking.booking_amount || 0)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">
                          {new Date(booking.created_at).toLocaleDateString()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && renderPagination()}
          </>
        )}
      </div>

      {/* Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Download Bookings Data</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date (Optional)
                </label>
                <input
                  type="date"
                  value={downloadDateRange.start_date}
                  onChange={(e) => setDownloadDateRange({...downloadDateRange, start_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date (Optional)
                </label>
                <input
                  type="date"
                  value={downloadDateRange.end_date}
                  onChange={(e) => setDownloadDateRange({...downloadDateRange, end_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status Filter (Optional)
                </label>
                <select
                  value={downloadDateRange.status}
                  onChange={(e) => setDownloadDateRange({...downloadDateRange, status: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Status</option>
                  <option value="Upcoming">Upcoming</option>
                  <option value="Checked-in">Checked-in</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={() => setShowDownloadModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Download Excel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Rooms Component
const Rooms = () => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [showEditRoomModal, setShowEditRoomModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [roomData, setRoomData] = useState({
    room_number: '',
    room_type: '',
    price_per_night: 0,
    max_occupancy: 2,
    amenities: []
  });
  const [bulkRoomData, setBulkRoomData] = useState({
    room_prefix: '',
    start_number: 1,
    end_number: 10,
    room_type: '',
    price_per_night: 0,
    max_occupancy: 2,
    amenities: []
  });

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const response = await axios.get(`${API}/rooms`);
      setRooms(response.data);
    } catch (error) {
      console.error('Error fetching rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRoom = async () => {
    try {
      await axios.post(`${API}/rooms`, roomData);
      setShowAddRoomModal(false);
      setRoomData({
        room_number: '',
        room_type: '',
        price_per_night: 0,
        max_occupancy: 2,
        amenities: []
      });
      await fetchRooms();
    } catch (error) {
      console.error('Error adding room:', error);
      alert('Error adding room. Please try again.');
    }
  };

  const handleBulkAddRooms = async () => {
    try {
      const response = await axios.post(`${API}/rooms/bulk`, bulkRoomData);
      setShowBulkAddModal(false);
      setBulkRoomData({
        room_prefix: '',
        start_number: 1,
        end_number: 10,
        room_type: '',
        price_per_night: 0,
        max_occupancy: 2,
        amenities: []
      });
      await fetchRooms();
      const msg = `Created ${response.data.created_rooms.length} rooms: ${response.data.created_rooms.join(', ')}`;
      if (response.data.skipped_rooms.length > 0) {
        alert(`${msg}\n\nSkipped (already exist): ${response.data.skipped_rooms.join(', ')}`);
      } else {
        alert(msg);
      }
    } catch (error) {
      console.error('Error adding rooms:', error);
      alert('Error adding rooms. Please try again.');
    }
  };

  const handleBulkAmenityChange = (amenity) => {
    const currentAmenities = bulkRoomData.amenities || [];
    if (currentAmenities.includes(amenity)) {
      setBulkRoomData({
        ...bulkRoomData,
        amenities: currentAmenities.filter(a => a !== amenity)
      });
    } else {
      setBulkRoomData({
        ...bulkRoomData,
        amenities: [...currentAmenities, amenity]
      });
    }
  };

  const handleEditRoom = async () => {
    try {
      await axios.put(`${API}/rooms/${selectedRoom.id}`, roomData);
      setShowEditRoomModal(false);
      setSelectedRoom(null);
      await fetchRooms();
    } catch (error) {
      console.error('Error updating room:', error);
      alert('Error updating room. Please try again.');
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (window.confirm('Are you sure you want to delete this room?')) {
      try {
        await axios.delete(`${API}/rooms/${roomId}`);
        await fetchRooms();
      } catch (error) {
        console.error('Error deleting room:', error);
        alert('Error deleting room. Please try again.');
      }
    }
  };

  const openEditModal = (room) => {
    setSelectedRoom(room);
    setRoomData({
      room_number: room.room_number,
      room_type: room.room_type,
      price_per_night: room.price_per_night,
      max_occupancy: room.max_occupancy,
      amenities: room.amenities || []
    });
    setShowEditRoomModal(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Available':
        return 'bg-green-100 text-green-800';
      case 'Occupied':
        return 'bg-red-100 text-red-800';
      case 'Reserved':
        return 'bg-yellow-100 text-yellow-800';
      case 'Pending Cleaning':
        return 'bg-rose-200 text-rose-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoomCardBgColor = (status) => {
    if (status === 'Pending Cleaning') {
      return 'bg-rose-900/30 border-rose-700';
    }
    return 'bg-gray-800 border-gray-700';
  };

  const handleAmenityChange = (amenity) => {
    const currentAmenities = roomData.amenities || [];
    if (currentAmenities.includes(amenity)) {
      setRoomData({
        ...roomData,
        amenities: currentAmenities.filter(a => a !== amenity)
      });
    } else {
      setRoomData({
        ...roomData,
        amenities: [...currentAmenities, amenity]
      });
    }
  };

  const commonAmenities = ["WiFi", "TV", "AC", "Mini Fridge", "Room Service", "Balcony", "Bathtub", "Safe"];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header - Gradient Style */}
      <div className="bg-gradient-to-r from-slate-800 to-blue-800 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Rooms</h2>
            <p className="text-slate-200">Manage hotel rooms and their details</p>
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={() => setShowBulkAddModal(true)}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center font-medium"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Bulk Add
            </button>
            <button 
              onClick={() => setShowAddRoomModal(true)}
              className="bg-white text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-100 flex items-center font-medium"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Room
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map((room) => (
          <div key={room.id} className={`rounded-lg shadow-md overflow-hidden border ${getRoomCardBgColor(room.status)}`}>
            <div className="relative">
              <img 
                src={room.image_url} 
                alt={`Room ${room.room_number}`}
                className="w-full h-48 object-cover"
              />
              <div className={`absolute top-4 right-4 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(room.status)}`}>
                {room.status}
              </div>
            </div>
            <div className="p-4">
              <h3 className="text-lg font-semibold text-white mb-1">Room {room.room_number}</h3>
              <p className="text-sm text-gray-300 mb-2">{room.room_type}</p>
              <p className="text-lg font-bold text-white mb-2">LKR {room.price_per_night}/night</p>
              <p className="text-sm text-gray-300 mb-2">Max Occupancy: {room.max_occupancy}</p>
              <div className="mb-4">
                <p className="text-sm text-gray-300">Amenities: {room.amenities?.join(', ')}</p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => openEditModal(room)}
                  className="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colors"
                >
                  Edit Room
                </button>
                <button
                  onClick={() => handleDeleteRoom(room.id)}
                  className="flex-1 bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700 transition-colors"
                >
                  Remove Room
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Room Modal */}
      {showAddRoomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Add New Room</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Room Number *</label>
                <input
                  type="text"
                  value={roomData.room_number}
                  onChange={(e) => setRoomData({...roomData, room_number: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter room number"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Room Type *</label>
                <select
                  value={roomData.room_type}
                  onChange={(e) => setRoomData({...roomData, room_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select room type</option>
                  <option value="Single">Single</option>
                  <option value="Double">Double</option>
                  <option value="Triple">Triple</option>
                  <option value="Suite">Suite</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price per Night (LKR) *</label>
                <input
                  type="number"
                  value={roomData.price_per_night}
                  onChange={(e) => setRoomData({...roomData, price_per_night: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter price"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Occupancy *</label>
                <input
                  type="number"
                  value={roomData.max_occupancy}
                  onChange={(e) => setRoomData({...roomData, max_occupancy: parseInt(e.target.value) || 2})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="10"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amenities</label>
                <div className="grid grid-cols-2 gap-2">
                  {commonAmenities.map((amenity) => (
                    <label key={amenity} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={roomData.amenities?.includes(amenity)}
                        onChange={() => handleAmenityChange(amenity)}
                        className="mr-2"
                      />
                      <span className="text-sm">{amenity}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddRoomModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRoom}
                disabled={!roomData.room_number || !roomData.room_type || !roomData.price_per_night}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                Add Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add Rooms Modal */}
      {showBulkAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Bulk Add Rooms</h3>
            <p className="text-sm text-gray-500 mb-4">Create multiple rooms at once. Room numbers will be generated as: [Prefix][Number] (e.g., 101, 102...)</p>
            
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Floor/Prefix *</label>
                  <input
                    type="text"
                    value={bulkRoomData.room_prefix}
                    onChange={(e) => setBulkRoomData({...bulkRoomData, room_prefix: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start # *</label>
                  <input
                    type="number"
                    value={bulkRoomData.start_number}
                    onChange={(e) => setBulkRoomData({...bulkRoomData, start_number: parseInt(e.target.value) || 1})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End # *</label>
                  <input
                    type="number"
                    value={bulkRoomData.end_number}
                    onChange={(e) => setBulkRoomData({...bulkRoomData, end_number: parseInt(e.target.value) || 10})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    placeholder="10"
                  />
                </div>
              </div>
              
              <div className="bg-gray-50 p-2 rounded text-sm text-gray-600">
                Preview: {bulkRoomData.room_prefix}{String(bulkRoomData.start_number).padStart(2, '0')} to {bulkRoomData.room_prefix}{String(bulkRoomData.end_number).padStart(2, '0')} ({bulkRoomData.end_number - bulkRoomData.start_number + 1} rooms)
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Room Type *</label>
                <select
                  value={bulkRoomData.room_type}
                  onChange={(e) => setBulkRoomData({...bulkRoomData, room_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select room type</option>
                  <option value="Single">Single</option>
                  <option value="Double">Double</option>
                  <option value="Triple">Triple</option>
                  <option value="Suite">Suite</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price per Night (LKR) *</label>
                <input
                  type="number"
                  value={bulkRoomData.price_per_night}
                  onChange={(e) => setBulkRoomData({...bulkRoomData, price_per_night: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter price"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Occupancy *</label>
                <input
                  type="number"
                  value={bulkRoomData.max_occupancy}
                  onChange={(e) => setBulkRoomData({...bulkRoomData, max_occupancy: parseInt(e.target.value) || 2})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="10"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amenities</label>
                <div className="grid grid-cols-2 gap-2">
                  {commonAmenities.map((amenity) => (
                    <label key={amenity} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={bulkRoomData.amenities?.includes(amenity)}
                        onChange={() => handleBulkAmenityChange(amenity)}
                        className="mr-2"
                      />
                      <span className="text-sm">{amenity}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowBulkAddModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAddRooms}
                disabled={!bulkRoomData.room_prefix || !bulkRoomData.room_type || !bulkRoomData.price_per_night}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400"
              >
                Create {bulkRoomData.end_number - bulkRoomData.start_number + 1} Rooms
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Room Modal */}
      {showEditRoomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Edit Room</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Room Number *</label>
                <input
                  type="text"
                  value={roomData.room_number}
                  onChange={(e) => setRoomData({...roomData, room_number: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Room Type *</label>
                <select
                  value={roomData.room_type}
                  onChange={(e) => setRoomData({...roomData, room_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Single">Single</option>
                  <option value="Double">Double</option>
                  <option value="Triple">Triple</option>
                  <option value="Suite">Suite</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price per Night (LKR) *</label>
                <input
                  type="number"
                  value={roomData.price_per_night}
                  onChange={(e) => setRoomData({...roomData, price_per_night: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Occupancy *</label>
                <input
                  type="number"
                  value={roomData.max_occupancy}
                  onChange={(e) => setRoomData({...roomData, max_occupancy: parseInt(e.target.value) || 2})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="10"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amenities</label>
                <div className="grid grid-cols-2 gap-2">
                  {commonAmenities.map((amenity) => (
                    <label key={amenity} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={roomData.amenities?.includes(amenity)}
                        onChange={() => handleAmenityChange(amenity)}
                        className="mr-2"
                      />
                      <span className="text-sm">{amenity}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowEditRoomModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditRoom}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Update Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Navigation Component
const Navigation = () => {
  const location = useLocation();
  const { user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [financialDropdownOpen, setFinancialDropdownOpen] = useState(false);
  const [expensesDropdownOpen, setExpensesDropdownOpen] = useState(false);
  
  const isActive = (path) => {
    return location.pathname === path;
  };

  // Check if user has access to a page based on permissions
  const hasPageAccess = (pageId) => {
    if (!user) return false;
    if (user.role === 'Admin') return true;
    const perms = user.page_permissions || [];
    if (perms.length === 0) return false;
    return perms.includes(pageId);
  };

  const isFinancialActive = () => {
    return ['/income-expense', '/commissions'].includes(location.pathname);
  };

  const isExpensesActive = () => {
    return ['/expenses', '/restaurant-expenses', '/maintenance'].includes(location.pathname);
  };

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', pageId: 'dashboard' },
    { path: '/calendar', label: 'Calendar', pageId: 'calendar' },
    { path: '/restaurant', label: 'Restaurant', pageId: 'restaurant' },
    { path: '/rooms', label: 'Rooms', pageId: 'rooms' },
    { path: '/guests', label: 'Guests', pageId: 'guests' },
    { path: '/bookings', label: 'Bookings', pageId: 'bookings' },
    { path: '/payroll', label: 'Payroll', pageId: 'payroll' },
    { path: '/settings', label: 'Settings', pageId: 'settings' }
  ];

  const financialItems = [
    { path: '/income-expense', label: 'Income & Expense', pageId: 'income_expense' },
    { path: '/commissions', label: 'Commissions', pageId: 'commissions' },
  ];

  const expenseItems = [
    { path: '/expenses', label: 'All Expenses', pageId: 'expenses' },
    { path: '/restaurant-expenses', label: 'Restaurant Expenses', pageId: 'expenses' },
    { path: '/maintenance', label: 'Maintenance', pageId: 'expenses' },
    { path: '/stocks', label: 'Stock Management', pageId: 'stocks' }
  ];

  return (
    <nav className="bg-gray-800 shadow-sm border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Desktop Navigation */}
        <div className="hidden md:flex space-x-4 items-center">
          {navItems.slice(0, 6).filter(item => hasPageAccess(item.pageId)).map((item) => (
            <Link 
              key={item.path}
              to={item.path} 
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                isActive(item.path) 
                  ? 'bg-blue-900 text-blue-300 border-b-2 border-blue-400' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {item.label}
            </Link>
          ))}
          
          {/* Financial Dropdown */}
          {financialItems.some(item => hasPageAccess(item.pageId)) && (
          <div className="relative">
            <button
              onClick={() => { setFinancialDropdownOpen(!financialDropdownOpen); setExpensesDropdownOpen(false); }}
              onBlur={() => setTimeout(() => setFinancialDropdownOpen(false), 150)}
              className={`px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                isFinancialActive() 
                  ? 'bg-blue-900 text-blue-300 border-b-2 border-blue-400' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Financial
              <svg className={`w-4 h-4 ml-1 transform transition-transform ${financialDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {financialDropdownOpen && (
              <div className="absolute left-0 mt-1 w-44 bg-gray-700 rounded-md shadow-lg border border-gray-600 z-50">
                {financialItems.filter(item => hasPageAccess(item.pageId)).map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setFinancialDropdownOpen(false)}
                    className={`block px-4 py-2 text-sm ${
                      isActive(item.path)
                        ? 'bg-blue-800 text-blue-300'
                        : 'text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Expenses Dropdown */}
          {expenseItems.some(item => hasPageAccess(item.pageId)) && (
          <div className="relative">
            <button
              onClick={() => { setExpensesDropdownOpen(!expensesDropdownOpen); setFinancialDropdownOpen(false); }}
              onBlur={() => setTimeout(() => setExpensesDropdownOpen(false), 150)}
              className={`px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                isExpensesActive() 
                  ? 'bg-blue-900 text-blue-300 border-b-2 border-blue-400' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Expenses
              <svg className={`w-4 h-4 ml-1 transform transition-transform ${expensesDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expensesDropdownOpen && (
              <div className="absolute left-0 mt-1 w-48 bg-gray-700 rounded-md shadow-lg border border-gray-600 z-50">
                {expenseItems.filter(item => hasPageAccess(item.pageId)).map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setExpensesDropdownOpen(false)}
                    className={`block px-4 py-2 text-sm ${
                      isActive(item.path)
                        ? 'bg-blue-800 text-blue-300'
                        : 'text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          )}

          {navItems.slice(6).filter(item => hasPageAccess(item.pageId)).map((item) => (
            <Link 
              key={item.path}
              to={item.path} 
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                isActive(item.path) 
                  ? 'bg-blue-900 text-blue-300 border-b-2 border-blue-400' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden">
          <div className="flex items-center justify-between py-2">
            <span className="text-white font-medium">Hotel Management</span>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-400 hover:text-white focus:outline-none focus:text-white"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
          
          {/* Mobile Menu */}
          {isMobileMenuOpen && (
            <div className="pb-3 space-y-1">
              {navItems.slice(0, 6).filter(item => hasPageAccess(item.pageId)).map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    isActive(item.path)
                      ? 'bg-blue-900 text-blue-300'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              
              {/* Financial Section in Mobile */}
              {financialItems.some(item => hasPageAccess(item.pageId)) && (
              <div className="border-t border-gray-700 pt-2 mt-2">
                <p className="px-3 py-1 text-xs text-gray-500 uppercase">Financial</p>
                {financialItems.filter(item => hasPageAccess(item.pageId)).map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-md text-base font-medium ml-2 ${
                      isActive(item.path)
                        ? 'bg-blue-900 text-blue-300'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              )}

              {/* Expenses Section in Mobile */}
              {expenseItems.some(item => hasPageAccess(item.pageId)) && (
              <div className="border-t border-gray-700 pt-2 mt-2">
                <p className="px-3 py-1 text-xs text-gray-500 uppercase">Expenses</p>
                {expenseItems.filter(item => hasPageAccess(item.pageId)).map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-md text-base font-medium ml-2 ${
                      isActive(item.path)
                        ? 'bg-blue-900 text-blue-300'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              )}
              
              {navItems.slice(6).filter(item => hasPageAccess(item.pageId)).map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    isActive(item.path)
                      ? 'bg-blue-900 text-blue-300'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

// Restaurant Component  
const Restaurant = () => {
  // State management
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [staff, setStaff] = useState([]);
  const [orders, setOrders] = useState([]);
  const [checkedInCustomers, setCheckedInCustomers] = useState([]);
  const [hotelSettings, setHotelSettings] = useState({});
  const [restaurantTaxes, setRestaurantTaxes] = useState([]); // Taxes configured for restaurant
  const [loading, setLoading] = useState(true);
  
  // Get current user context
  const { user } = useAuth();
  
  // Get financial context for cross-component refresh
  const { triggerFinancialRefresh } = useFinancial();
  
  // UI state
  const [activeTab, setActiveTab] = useState('menu'); // menu, tables, orders, staff
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState(null);
  
  // Form states
  const [newCategory, setNewCategory] = useState({ name: '', description: '', display_order: 0 });
  const [newItem, setNewItem] = useState({
    name: '', description: '', price: 0, category_id: '', 
    is_vegetarian: false, is_spicy: false, prep_time: 15, image: ''
  });
  const [newTable, setNewTable] = useState({ table_number: '', capacity: 4, position_x: 0, position_y: 0 });
  const [newStaff, setNewStaff] = useState({ name: '', role: 'Waiter', phone: '' });
  const [newOrder, setNewOrder] = useState({
    order_type: 'table', table_id: '', room_number: '', customer_name: '',
    items: [], waiter_id: '', notes: '', service_charge_rate: 0  // Default to 0, will use tax system
  });
  const [orderItems, setOrderItems] = useState([]);
  const [paymentData, setPaymentData] = useState({
    payment_method: 'Cash',
    add_to_room_bill: false
  });
  const [menuItemDropdown, setMenuItemDropdown] = useState(null);
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editItemData, setEditItemData] = useState({
    id: '', name: '', description: '', price: 0, category_id: '',
    is_vegetarian: false, is_spicy: false, prep_time: 15
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      await Promise.all([
        fetchCategories(),
        fetchMenuItems(),
        fetchTables(),
        fetchStaff(),
        fetchOrders(),
        fetchCheckedInCustomers(),
        fetchHotelSettings(),
        fetchRestaurantTaxes()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHotelSettings = async () => {
    try {
      const response = await axios.get(`${API}/settings`);
      setHotelSettings(response.data);
    } catch (error) {
      console.error('Error fetching hotel settings:', error);
    }
  };

  const fetchRestaurantTaxes = async () => {
    try {
      const response = await axios.get(`${API}/taxes`);
      // Filter to only show taxes applicable to restaurant
      const restaurantTaxes = response.data.filter(tax => tax.is_active && tax.apply_to_restaurant);
      setRestaurantTaxes(restaurantTaxes);
    } catch (error) {
      console.error('Error fetching restaurant taxes:', error);
      setRestaurantTaxes([]);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/restaurant/categories`);
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchMenuItems = async () => {
    try {
      const response = await axios.get(`${API}/restaurant/menu-items`);
      setMenuItems(response.data);
    } catch (error) {
      console.error('Error fetching menu items:', error);
    }
  };

  const fetchTables = async () => {
    try {
      const response = await axios.get(`${API}/restaurant/tables`);
      setTables(response.data);
    } catch (error) {
      console.error('Error fetching tables:', error);
    }
  };

  const fetchStaff = async () => {
    try {
      const response = await axios.get(`${API}/restaurant/staff`);
      setStaff(response.data);
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  };

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`${API}/restaurant/orders`);
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const fetchCheckedInCustomers = async () => {
    try {
      const response = await axios.get(`${API}/customers/checked-in`);
      setCheckedInCustomers(response.data);
    } catch (error) {
      console.error('Error fetching checked-in customers:', error);
    }
  };

  // Category management
  const handleAddCategory = async () => {
    try {
      await axios.post(`${API}/restaurant/categories`, newCategory);
      setShowAddCategoryModal(false);
      setNewCategory({ name: '', description: '', display_order: 0 });
      await fetchCategories();
      alert('Category added successfully!');
    } catch (error) {
      console.error('Error adding category:', error);
      alert('Error adding category: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Menu item management  
  const handleAddItem = async () => {
    try {
      await axios.post(`${API}/restaurant/menu-items`, newItem);
      setShowAddItemModal(false);
      setNewItem({
        name: '', description: '', price: 0, category_id: '', 
        is_vegetarian: false, is_spicy: false, prep_time: 15, image: ''
      });
      await fetchMenuItems();
      alert('Menu item added successfully!');
    } catch (error) {
      console.error('Error adding menu item:', error);
      alert('Error adding menu item: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Handle image upload
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Check file size (2MB limit)
      if (file.size > 2 * 1024 * 1024) {
        alert('File size must be less than 2MB');
        event.target.value = '';
        return;
      }
      
      // Check file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        event.target.value = '';
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setNewItem({...newItem, image: e.target.result});
      };
      reader.readAsDataURL(file);
    }
  };

  // Table management
  const handleAddTable = async () => {
    try {
      await axios.post(`${API}/restaurant/tables`, newTable);
      setShowAddTableModal(false);
      setNewTable({ table_number: '', capacity: 4, position_x: 0, position_y: 0 });
      await fetchTables();
      alert('Table added successfully!');
    } catch (error) {
      console.error('Error adding table:', error);
      alert('Error adding table: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Staff management
  const handleAddStaff = async () => {
    try {
      await axios.post(`${API}/restaurant/staff`, newStaff);
      setShowAddStaffModal(false);
      setNewStaff({ name: '', role: 'Waiter', phone: '' });
      await fetchStaff();
      alert('Staff member added successfully!');
    } catch (error) {
      console.error('Error adding staff:', error);
      alert('Error adding staff: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Delete functions
  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return;
    
    try {
      await axios.delete(`${API}/restaurant/categories/${categoryId}`);
      await fetchCategories();
      await fetchMenuItems(); // Refresh menu items as well
      alert('Category deleted successfully!');
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Error deleting category: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteMenuItem = async (itemId) => {
    try {
      // Check if item can be deleted
      const checkResp = await axios.get(`${API}/restaurant/menu-items/${itemId}/can-delete`);
      if (!checkResp.data.can_delete) {
        alert(checkResp.data.reason);
        return;
      }
      if (!window.confirm('Are you sure you want to delete this menu item?')) return;
      await axios.delete(`${API}/restaurant/menu-items/${itemId}`);
      await fetchMenuItems();
      alert('Menu item deleted successfully!');
    } catch (error) {
      console.error('Error deleting menu item:', error);
      alert(error.response?.data?.detail || error.message);
    }
  };

  const openEditItemModal = (item) => {
    setEditItemData({
      id: item.id,
      name: item.name,
      description: item.description || '',
      price: item.price,
      category_id: item.category_id,
      is_vegetarian: item.is_vegetarian || false,
      is_spicy: item.is_spicy || false,
      prep_time: item.prep_time || 15
    });
    setShowEditItemModal(true);
    setMenuItemDropdown(null);
  };

  const handleUpdateMenuItem = async () => {
    try {
      await axios.put(`${API}/restaurant/menu-items/${editItemData.id}`, {
        name: editItemData.name,
        description: editItemData.description,
        price: editItemData.price,
        category_id: editItemData.category_id,
        is_vegetarian: editItemData.is_vegetarian,
        is_spicy: editItemData.is_spicy,
        prep_time: editItemData.prep_time
      });
      setShowEditItemModal(false);
      await fetchMenuItems();
      alert('Menu item updated successfully!');
    } catch (error) {
      alert('Error updating: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteTable = async (tableId) => {
    if (!window.confirm('Are you sure you want to delete this table?')) return;
    
    try {
      await axios.delete(`${API}/restaurant/tables/${tableId}`);
      await fetchTables();
      alert('Table deleted successfully!');
    } catch (error) {
      console.error('Error deleting table:', error);
      alert('Error deleting table: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteStaff = async (staffId) => {
    if (!window.confirm('Are you sure you want to delete this staff member?')) return;
    
    try {
      await axios.delete(`${API}/restaurant/staff/${staffId}`);
      await fetchStaff();
      alert('Staff member deleted successfully!');
    } catch (error) {
      console.error('Error deleting staff:', error);
      alert('Error deleting staff: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Order management
  const addItemToOrder = (item) => {
    const existingItem = orderItems.find(orderItem => orderItem.menu_item_id === item.id);
    if (existingItem) {
      setOrderItems(orderItems.map(orderItem => 
        orderItem.menu_item_id === item.id 
          ? { ...orderItem, quantity: orderItem.quantity + 1, total_price: (orderItem.quantity + 1) * item.price }
          : orderItem
      ));
    } else {
      setOrderItems([...orderItems, {
        menu_item_id: item.id,
        menu_item_name: item.name,
        quantity: 1,
        unit_price: item.price,
        total_price: item.price,
        special_notes: ''
      }]);
    }
  };

  const removeItemFromOrder = (menuItemId) => {
    setOrderItems(orderItems.filter(item => item.menu_item_id !== menuItemId));
  };

  const updateItemQuantity = (menuItemId, quantity) => {
    if (quantity <= 0) {
      removeItemFromOrder(menuItemId);
      return;
    }
    setOrderItems(orderItems.map(item => 
      item.menu_item_id === menuItemId 
        ? { ...item, quantity: quantity, total_price: quantity * item.unit_price }
        : item
    ));
  };

  const handleAddItemToOrder = addItemToOrder;
  const handleRemoveItemFromOrder = removeItemFromOrder;
  const handleUpdateItemQuantity = updateItemQuantity;

  const handleCreateOrder = async () => {
    try {
      const orderData = { ...newOrder, items: orderItems };
      await axios.post(`${API}/restaurant/orders`, orderData);
      setShowOrderModal(false);
      setNewOrder({
        order_type: 'table', table_id: '', room_number: '', customer_name: '',
        items: [], waiter_id: '', notes: '', service_charge_rate: 0
      });
      setOrderItems([]);
      await Promise.all([fetchOrders(), fetchTables()]);
      alert('Order created successfully!');
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Error creating order: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handlePayOrder = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    setSelectedOrderForPayment(order);
    setShowPaymentModal(true);
  };

  const handleProcessPayment = async () => {
    if (!selectedOrderForPayment) return;
    
    try {
      const paymentRequest = {
        payment_method: paymentData.payment_method,
        add_to_room_bill: paymentData.add_to_room_bill && selectedOrderForPayment.order_type === 'room_service'
      };
      
      await axios.post(`${API}/restaurant/orders/${selectedOrderForPayment.id}/pay`, paymentRequest);
      
      // Reset states
      setShowPaymentModal(false);
      setSelectedOrderForPayment(null);
      setPaymentData({
        payment_method: 'Cash',
        add_to_room_bill: false
      });
      
      // Refresh data
      await Promise.all([fetchOrders(), fetchTables()]);
      
      // Trigger financial refresh for real-time balance updates
      triggerFinancialRefresh();
      
      alert('Payment processed successfully!');
    } catch (error) {
      console.error('Error processing payment:', error);
      alert('Error processing payment: ' + (error.response?.data?.detail || error.message));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading restaurant data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-2">Restaurant Management</h1>
            <p className="text-sm sm:text-base text-gray-300">Manage your restaurant operations</p>
          </div>
          {(user?.role === 'Admin' || user?.role === 'Restaurant Manager') && (
            <div className="flex space-x-2 sm:space-x-4">
              <button
                onClick={() => setShowOrderModal(true)}
                className="bg-green-600 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-md hover:bg-green-700 transition-colors text-sm sm:text-base"
              >
                New Order
              </button>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1 sm:gap-2 mb-6 sm:mb-8">
          {['menu', 'tables', 'orders', 'staff'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 sm:px-6 sm:py-3 font-medium rounded-lg transition-colors text-sm sm:text-base ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Menu Tab */}
        {activeTab === 'menu' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold">Menu Management</h2>
              {(user?.role === 'Admin' || user?.role === 'Restaurant Manager') && (
                <div className="flex flex-wrap gap-2 sm:gap-4">
                  <button
                    onClick={() => setShowAddCategoryModal(true)}
                    className="bg-blue-600 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-md hover:bg-blue-700 text-sm sm:text-base"
                  >
                    Add Category
                  </button>
                  <button
                    onClick={() => setShowAddItemModal(true)}
                    className="bg-green-600 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-md hover:bg-green-700 text-sm sm:text-base"
                  >
                    Add Item
                  </button>
                </div>
              )}
            </div>

            {/* Menu Categories and Items */}
            <div className="space-y-6 sm:space-y-8">
              {categories.map(category => (
                <div key={category.id} className="bg-gray-800 rounded-lg p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4">
                    <h3 className="text-lg sm:text-xl font-semibold text-blue-400">{category.name}</h3>
                    {(user?.role === 'Admin' || user?.role === 'Restaurant Manager') && (
                      <button
                        onClick={() => handleDeleteCategory(category.id)}
                        className="mt-2 sm:mt-0 bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700"
                      >
                        Delete Category
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {menuItems
                      .filter(item => item.category_id === category.id)
                      .map(item => (
                        <div key={item.id} className="bg-gray-700 rounded-lg p-3 sm:p-4">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-2">
                            <h4 className="font-medium text-white text-sm sm:text-base mb-1 sm:mb-0">{item.name}</h4>
                            <span className="text-green-400 font-bold text-sm sm:text-base">LKR {item.price}</span>
                          </div>
                          <p className="text-gray-300 text-sm mb-2">{item.description}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-xs">
                              {item.is_vegetarian && (
                                <span className="bg-green-600 text-white px-2 py-1 rounded">Veg</span>
                              )}
                              {item.is_spicy && (
                                <span className="bg-red-600 text-white px-2 py-1 rounded">Spicy</span>
                              )}
                              <span className="text-gray-400">{item.prep_time}min</span>
                            </div>
                            {(user?.role === 'Admin' || user?.role === 'Restaurant Manager') && (
                              <div className="relative">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setMenuItemDropdown(menuItemDropdown === item.id ? null : item.id); }}
                                  className="bg-gray-600 text-white px-2 py-1 rounded text-xs hover:bg-gray-500 flex items-center"
                                  data-testid={`menu-item-actions-${item.id}`}
                                >
                                  Actions
                                  <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                {menuItemDropdown === item.id && (
                                  <div className="absolute right-0 mt-1 w-36 bg-gray-600 rounded-md shadow-lg z-20 border border-gray-500">
                                    <button
                                      onClick={() => openEditItemModal(item)}
                                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-500 flex items-center"
                                      data-testid={`edit-menu-item-${item.id}`}
                                    >
                                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                      Edit Item
                                    </button>
                                    <button
                                      onClick={() => { handleDeleteMenuItem(item.id); setMenuItemDropdown(null); }}
                                      className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-gray-500 flex items-center"
                                      data-testid={`delete-menu-item-${item.id}`}
                                    >
                                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                      Delete Item
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tables Tab */}
        {activeTab === 'tables' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold">Table Management</h2>
              {(user?.role === 'Admin' || user?.role === 'Restaurant Manager') && (
                <button
                  onClick={() => setShowAddTableModal(true)}
                  className="bg-blue-600 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-md hover:bg-blue-700 text-sm sm:text-base"
                >
                  Add Table
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
              {tables.map(table => (
                <div
                  key={table.id}
                  className={`p-3 sm:p-4 rounded-lg border-2 ${
                    table.status === 'Available' ? 'bg-green-800 border-green-600' :
                    table.status === 'Occupied' ? 'bg-red-800 border-red-600' :
                    table.status === 'Reserved' ? 'bg-yellow-800 border-yellow-600' :
                    'bg-gray-800 border-gray-600'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-lg sm:text-xl lg:text-2xl font-bold">T{table.table_number}</div>
                    <div className="text-xs sm:text-sm">{table.capacity} seats</div>
                    <div className="text-xs mt-1 capitalize">{table.status}</div>
                    {(user?.role === 'Admin' || user?.role === 'Restaurant Manager') && (
                      <button
                        onClick={() => handleDeleteTable(table.id)}
                        className="mt-2 bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="space-y-4 sm:space-y-6">
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold">Order Management</h2>
            
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Order #</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase hidden sm:table-cell">Table/Room</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase hidden lg:table-cell">Customer</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Amount</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {orders.map(order => (
                      <tr key={order.id}>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-white">{order.order_number}</td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded ${
                            order.order_type === 'table' ? 'bg-blue-600' : 'bg-purple-600'
                          }`}>
                            {order.order_type === 'table' ? 'Table' : 'Room'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-white hidden sm:table-cell">
                          {order.order_type === 'table' ? `Table ${order.table_number}` : `Room ${order.room_number}`}
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-white hidden lg:table-cell">{order.customer_name}</td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-green-400">LKR {order.total_amount}</td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded ${
                            order.payment_status === 'Paid' ? 'bg-green-600' :
                            order.payment_status === 'Room Bill' ? 'bg-purple-600' :
                            order.payment_status === 'Cancelled' ? 'bg-red-600' :
                            'bg-yellow-600'
                          }`}>
                            {order.payment_status}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-1">
                            <button
                              onClick={() => { setSelectedOrderForPayment(order); setShowPaymentModal(true); }}
                              className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700"
                              title="View"
                              data-testid={`view-order-${order.id}`}
                            >
                              View
                            </button>
                            {order.payment_status === 'Pending' && (
                              <>
                                <button
                                  onClick={() => handlePayOrder(order.id)}
                                  className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                                >
                                  Pay
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!window.confirm('Cancel this order?')) return;
                                    try {
                                      await axios.post(`${API}/restaurant/orders/${order.id}/cancel`);
                                      fetchOrders();
                                      alert('Order cancelled');
                                    } catch (err) {
                                      alert(err.response?.data?.detail || 'Error cancelling order');
                                    }
                                  }}
                                  className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Staff Tab */}
        {activeTab === 'staff' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold">Staff Management</h2>
              {(user?.role === 'Admin' || user?.role === 'Restaurant Manager') && (
                <button
                  onClick={() => setShowAddStaffModal(true)}
                  className="bg-blue-600 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-md hover:bg-blue-700 text-sm sm:text-base"
                >
                  Add Staff
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {staff.map(member => (
                <div key={member.id} className="bg-gray-800 rounded-lg p-3 sm:p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold text-white text-sm sm:text-base">{member.name}</h3>
                      <p className="text-blue-400 text-sm">{member.role}</p>
                      <p className="text-gray-300 text-xs sm:text-sm">{member.phone}</p>
                    </div>
                    {(user?.role === 'Admin' || user?.role === 'Restaurant Manager') && (
                      <button
                        onClick={() => handleDeleteStaff(member.id)}
                        className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* All Modals will be added in the next part */}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Add Menu Category</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({...newCategory, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newCategory.description}
                  onChange={(e) => setNewCategory({...newCategory, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  rows="3"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddCategoryModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCategory}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Menu Item Modal */}
      {showAddItemModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Add Menu Item</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={newItem.category_id}
                  onChange={(e) => setNewItem({...newItem, category_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  <option value="">Select Category</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price (LKR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newItem.price}
                  onChange={(e) => setNewItem({...newItem, price: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newItem.description}
                  onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  rows="3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preparation Time (minutes)</label>
                <input
                  type="number"
                  value={newItem.prep_time}
                  onChange={(e) => setNewItem({...newItem, prep_time: parseInt(e.target.value) || 15})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image (Max 2MB)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
                {newItem.image && (
                  <div className="mt-2">
                    <img 
                      src={newItem.image} 
                      alt="Preview" 
                      className="w-20 h-20 object-cover rounded-md border"
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newItem.is_vegetarian}
                    onChange={(e) => setNewItem({...newItem, is_vegetarian: e.target.checked})}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Vegetarian</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newItem.is_spicy}
                    onChange={(e) => setNewItem({...newItem, is_spicy: e.target.checked})}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Spicy</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddItemModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddItem}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Table Modal */}
      {showAddTableModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Add Table</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Table Number</label>
                <input
                  type="text"
                  value={newTable.table_number}
                  onChange={(e) => setNewTable({...newTable, table_number: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                <input
                  type="number"
                  value={newTable.capacity}
                  onChange={(e) => setNewTable({...newTable, capacity: parseInt(e.target.value) || 4})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddTableModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTable}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Add Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      {showAddStaffModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Add Staff Member</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newStaff.name}
                  onChange={(e) => setNewStaff({...newStaff, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={newStaff.role}
                  onChange={(e) => setNewStaff({...newStaff, role: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  <option value="Waiter">Waiter</option>
                  <option value="Chef">Chef</option>
                  <option value="Manager">Manager</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={newStaff.phone}
                  onChange={(e) => setNewStaff({...newStaff, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddStaffModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddStaff}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Add Staff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POS Style Order Interface */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col md:flex-row">
          {/* Left Panel - Menu Items */}
          <div className="flex-1 md:w-2/3 bg-gray-800 p-3 md:p-4 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <h2 className="text-xl md:text-2xl font-bold text-white">Menu</h2>
              <button
                onClick={() => {
                  setShowOrderModal(false);
                  setNewOrder({
                    order_type: 'table', table_id: '', room_number: '', customer_name: '',
                    items: [], waiter_id: '', notes: '', service_charge_rate: 0
                  });
                  setOrderItems([]);
                }}
                className="bg-red-500 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg hover:bg-red-600 transition-colors text-sm md:text-base"
              >
                ✕ Close
              </button>
            </div>

            {/* Order Type Selection - Mobile Optimized */}
            <div className="mb-4 md:mb-6">
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    if (orderItems.length === 0) {
                      setNewOrder({...newOrder, order_type: 'table', room_number: '', customer_name: ''});
                    }
                  }}
                  disabled={orderItems.length > 0 && newOrder.order_type !== 'table'}
                  className={`flex-1 md:flex-none px-3 md:px-6 py-2 md:py-3 rounded-lg font-medium transition-colors text-sm md:text-base ${
                    newOrder.order_type === 'table' 
                      ? 'bg-blue-600 text-white' 
                      : orderItems.length > 0 
                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  title={orderItems.length > 0 && newOrder.order_type !== 'table' ? 'Remove items from cart to switch order type' : ''}
                >
                  Table
                </button>
                <button
                  onClick={() => {
                    if (orderItems.length === 0) {
                      setNewOrder({...newOrder, order_type: 'room_service', table_id: ''});
                    }
                  }}
                  disabled={orderItems.length > 0 && newOrder.order_type !== 'room_service'}
                  className={`flex-1 md:flex-none px-3 md:px-6 py-2 md:py-3 rounded-lg font-medium transition-colors text-sm md:text-base ${
                    newOrder.order_type === 'room_service' 
                      ? 'bg-blue-600 text-white' 
                      : orderItems.length > 0 
                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  title={orderItems.length > 0 && newOrder.order_type !== 'room_service' ? 'Remove items from cart to switch order type' : ''}
                >
                  Room Service
                </button>
              </div>
              {orderItems.length > 0 && (
                <p className="text-xs text-yellow-400 mt-2">
                  ⚠️ Clear cart to switch order type
                </p>
              )}
            </div>

            {/* Table/Room Selection - Mobile Optimized */}
            {newOrder.order_type === 'table' && (
              <div className="mb-4 md:mb-6">
                <h3 className="text-base md:text-lg font-semibold mb-2 md:mb-3 text-white">Select Table</h3>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
                  {tables.filter(table => table.status === 'Available').map(table => (
                    <button
                      key={table.id}
                      onClick={() => setNewOrder({...newOrder, table_id: table.id})}
                      className={`p-2 md:p-4 rounded-lg text-center transition-colors ${
                        newOrder.table_id === table.id
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                      }`}
                    >
                      <div className="font-bold text-sm md:text-lg">T{table.table_number}</div>
                      <div className="text-xs md:text-sm">{table.capacity} seats</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {newOrder.order_type === 'room_service' && (
              <div className="mb-4 md:mb-6">
                <h3 className="text-base md:text-lg font-semibold mb-2 md:mb-3 text-white">Select Room</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                  {checkedInCustomers.map(customer => (
                    <button
                      key={customer.id}
                      onClick={() => setNewOrder({
                        ...newOrder, 
                        room_number: customer.current_room, 
                        customer_name: customer.name
                      })}
                      className={`p-2 md:p-4 rounded-lg text-left transition-colors ${
                        newOrder.room_number === customer.current_room
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                      }`}
                    >
                      <div className="font-bold text-sm md:text-lg">Room {customer.current_room}</div>
                      <div className="text-xs md:text-sm truncate">{customer.name}</div>
                      <div className="text-xs text-green-400">● Live</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Menu Categories - Mobile Optimized */}
            <div className="space-y-4 md:space-y-6">
              {categories.map(category => (
                <div key={category.id} className="bg-gray-700 rounded-lg p-3 md:p-4 shadow-sm">
                  <h3 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4 border-b border-gray-600 pb-2">
                    {category.name}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
                    {menuItems.filter(item => item.category_id === category.id).map(item => (
                      <button
                        key={item.id}
                        onClick={() => handleAddItemToOrder(item)}
                        className="bg-gray-600 rounded-lg hover:bg-gray-500 transition-colors text-left"
                      >
                        {item.image && (
                          <img 
                            src={item.image} 
                            alt={item.name}
                            className="w-full h-20 md:h-32 object-cover rounded-t-lg"
                          />
                        )}
                        <div className="p-2 md:p-4">
                          <div className="font-medium text-white text-sm md:text-base">{item.name}</div>
                          <div className="text-xs md:text-sm text-gray-300 mt-1 line-clamp-2">{item.description}</div>
                          <div className="text-sm md:text-lg font-bold text-blue-400 mt-1 md:mt-2">
                            LKR {item.price}
                          </div>
                          <div className="flex items-center space-x-1 md:space-x-2 mt-1 md:mt-2">
                            {item.is_vegetarian && (
                              <span className="bg-green-600 text-green-100 px-1.5 md:px-2 py-0.5 md:py-1 rounded text-xs">Veg</span>
                            )}
                            {item.is_spicy && (
                              <span className="bg-red-600 text-red-100 px-2 py-1 rounded text-xs">Spicy</span>
                            )}
                            <span className="text-gray-400 text-xs">{item.prep_time}min</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel - Order Summary - Mobile Optimized */}
          <div className="w-full md:w-1/3 bg-gray-900 p-4 md:p-6 overflow-y-auto max-h-[50vh] md:max-h-[calc(100vh-120px)]">
            <div className="mb-4">
              <h3 className="text-lg md:text-xl font-bold text-white mb-3 md:mb-4">Order Summary</h3>
              
              {/* Order Details */}
              <div className="space-y-2 md:space-y-3 text-sm md:text-base">
                <div className="flex justify-between">
                  <span className="text-gray-400">Type:</span>
                  <span className="font-medium text-white">{newOrder.order_type === 'table' ? 'Table' : 'Room Service'}</span>
                </div>
                
                {newOrder.order_type === 'table' && newOrder.table_id && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Table:</span>
                    <span className="font-medium text-white">
                      {tables.find(t => t.id === newOrder.table_id)?.table_number || 'N/A'}
                    </span>
                  </div>
                )}
                
                {newOrder.order_type === 'room_service' && newOrder.room_number && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Room:</span>
                    <span className="font-medium text-white">{newOrder.room_number}</span>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={newOrder.customer_name}
                    onChange={(e) => setNewOrder({...newOrder, customer_name: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                    placeholder="Enter customer name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Waiter</label>
                  <select
                    value={newOrder.waiter_id}
                    onChange={(e) => setNewOrder({...newOrder, waiter_id: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                  >
                    <option value="">Select Waiter</option>
                    {staff.filter(s => s.role === 'Waiter').map(waiter => (
                      <option key={waiter.id} value={waiter.id}>
                        {waiter.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Order Items */}
            <div className="mb-4">
              <h4 className="text-lg font-semibold mb-4 text-white">Items</h4>
              
              {orderItems.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <div className="text-4xl mb-2">🍽️</div>
                  <p>No items added yet</p>
                  <p className="text-sm">Click on menu items to add them</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                  {orderItems.map((item, index) => (
                    <div key={index} className="bg-gray-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-white">{item.menu_item_name}</div>
                        <button
                          onClick={() => handleRemoveItemFromOrder(item.menu_item_id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => handleUpdateItemQuantity(item.menu_item_id, item.quantity - 1)}
                            className="bg-gray-700 text-gray-300 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-600"
                          >
                            −
                          </button>
                          <span className="font-medium text-lg text-white">{item.quantity}</span>
                          <button
                            onClick={() => handleUpdateItemQuantity(item.menu_item_id, item.quantity + 1)}
                            className="bg-gray-700 text-gray-300 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-600"
                          >
                            +
                          </button>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-400">LKR {item.unit_price} each</div>
                          <div className="font-bold text-blue-400">LKR {item.total_price}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Order Summary Footer */}
            <div className="mt-6 pt-4 border-t border-gray-700">
              <div className="space-y-2 mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-400">Subtotal:</span>
                  <span className="font-medium text-white">LKR {orderItems.reduce((sum, item) => sum + item.total_price, 0).toFixed(2)}</span>
                </div>
                
                {/* Dynamic Taxes from Settings */}
                {restaurantTaxes.length > 0 && restaurantTaxes.map((tax, idx) => {
                  const subtotal = orderItems.reduce((sum, item) => sum + item.total_price, 0);
                  const taxAmount = tax.type === 'percentage' ? subtotal * (tax.rate / 100) : tax.rate;
                  return (
                    <div key={idx} className="flex justify-between">
                      <span className="text-orange-400">{tax.name} ({tax.rate}{tax.type === 'percentage' ? '%' : ' LKR'}):</span>
                      <span className="font-medium text-orange-300">LKR {taxAmount.toFixed(2)}</span>
                    </div>
                  );
                })}
                
                {restaurantTaxes.length === 0 && (
                  <div className="text-xs text-gray-500 italic">
                    No taxes configured for restaurant. Add taxes in Settings → Taxes & Levies.
                  </div>
                )}
                
                <div className="flex justify-between text-xl font-bold pt-2 border-t border-gray-600">
                  <span className="text-white">Total:</span>
                  <span className="text-blue-400">LKR {(() => {
                    const subtotal = orderItems.reduce((sum, item) => sum + item.total_price, 0);
                    const totalTax = restaurantTaxes.reduce((sum, tax) => {
                      return sum + (tax.type === 'percentage' ? subtotal * (tax.rate / 100) : tax.rate);
                    }, 0);
                    return (subtotal + totalTax).toFixed(2);
                  })()}</span>
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Special Notes</label>
                <textarea
                  value={newOrder.notes}
                  onChange={(e) => setNewOrder({...newOrder, notes: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                  rows="3"
                  placeholder="Special instructions..."
                />
              </div>
              
              <button
                onClick={handleCreateOrder}
                disabled={orderItems.length === 0 || (newOrder.order_type === 'table' && !newOrder.table_id) || (newOrder.order_type === 'room_service' && !newOrder.room_number)}
                className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                {orderItems.length === 0 ? 'Add Items to Order' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedOrderForPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md" data-testid="payment-modal">
            <h3 className="text-lg font-semibold mb-4 text-white">Process Payment</h3>
            
            {/* Order Details */}
            <div className="mb-4 p-4 bg-gray-700 rounded-lg">
              <h4 className="font-medium text-white mb-2">Order Details</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Order Number:</span>
                  <span className="font-medium text-white">{selectedOrderForPayment.order_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Customer:</span>
                  <span className="font-medium text-white">{selectedOrderForPayment.customer_name}</span>
                </div>
                {selectedOrderForPayment.order_type === 'room_service' && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Room:</span>
                    <span className="font-medium text-white">{selectedOrderForPayment.room_number}</span>
                  </div>
                )}
                {selectedOrderForPayment.order_type === 'table' && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Table:</span>
                    <span className="font-medium text-white">{selectedOrderForPayment.table_number}</span>
                  </div>
                )}
                {/* Item breakdown */}
                {selectedOrderForPayment.items && (
                  <div className="mt-2 border-t border-gray-600 pt-2 space-y-1">
                    {selectedOrderForPayment.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-gray-300">
                        <span>{item.menu_item_name} x{item.quantity}</span>
                        <span>LKR {(item.total_price || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t border-gray-600 pt-2 mt-2 space-y-1">
                  <div className="flex justify-between text-gray-300">
                    <span>Subtotal:</span>
                    <span>LKR {(selectedOrderForPayment.subtotal || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Tax:</span>
                    <span>LKR {(selectedOrderForPayment.tax_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Service Charge:</span>
                    <span>LKR {(selectedOrderForPayment.service_charge || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t border-gray-600 pt-2 text-green-400">
                    <span>Total:</span>
                    <span>LKR {(selectedOrderForPayment.total_amount || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Room Service Special Options */}
            {selectedOrderForPayment.order_type === 'room_service' && (
              <div className="mb-4">
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={paymentData.add_to_room_bill}
                    onChange={(e) => setPaymentData({...paymentData, add_to_room_bill: e.target.checked})}
                    className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-300">Add to Room Bill (will be charged at checkout)</span>
                </label>
              </div>
            )}

            {/* Payment Method Selection */}
            {(!paymentData.add_to_room_bill || selectedOrderForPayment.order_type !== 'room_service') && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">Payment Method</label>
                <select
                  value={paymentData.payment_method}
                  onChange={(e) => setPaymentData({...paymentData, payment_method: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedOrderForPayment(null);
                  setPaymentData({ payment_method: 'Cash', add_to_room_bill: false });
                }}
                className="px-4 py-2 text-gray-300 border border-gray-600 rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessPayment}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                data-testid="confirm-payment-btn"
              >
                {paymentData.add_to_room_bill && selectedOrderForPayment.order_type === 'room_service' 
                  ? 'Add to Room Bill' 
                  : 'Process Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Menu Item Modal */}
      {showEditItemModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md" data-testid="edit-menu-item-modal">
            <h3 className="text-lg font-semibold text-white mb-4">Edit Menu Item</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
                <input
                  type="text"
                  value={editItemData.name}
                  onChange={(e) => setEditItemData({...editItemData, name: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  data-testid="edit-item-name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={editItemData.description}
                  onChange={(e) => setEditItemData({...editItemData, description: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Price (LKR) *</label>
                  <input
                    type="number"
                    value={editItemData.price}
                    onChange={(e) => setEditItemData({...editItemData, price: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    data-testid="edit-item-price"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Prep Time (min)</label>
                  <input
                    type="number"
                    value={editItemData.prep_time}
                    onChange={(e) => setEditItemData({...editItemData, prep_time: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Category *</label>
                <select
                  value={editItemData.category_id}
                  onChange={(e) => setEditItemData({...editItemData, category_id: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  data-testid="edit-item-category"
                >
                  <option value="">Select Category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex space-x-4">
                <label className="flex items-center text-gray-300 text-sm">
                  <input
                    type="checkbox"
                    checked={editItemData.is_vegetarian}
                    onChange={(e) => setEditItemData({...editItemData, is_vegetarian: e.target.checked})}
                    className="mr-2"
                  />
                  Vegetarian
                </label>
                <label className="flex items-center text-gray-300 text-sm">
                  <input
                    type="checkbox"
                    checked={editItemData.is_spicy}
                    onChange={(e) => setEditItemData({...editItemData, is_spicy: e.target.checked})}
                    className="mr-2"
                  />
                  Spicy
                </label>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowEditItemModal(false)} className="px-4 py-2 text-gray-300 border border-gray-600 rounded-md hover:bg-gray-700">Cancel</button>
              <button onClick={handleUpdateMenuItem} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" data-testid="save-edit-item-btn">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Temporary placeholder for Restaurant component
const RestaurantOld = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">Restaurant Management</h1>
        <p className="text-gray-300">Coming soon...</p>
      </div>
    </div>
  );
};

// Payroll Component
const Payroll = () => {
  const [employees, setEmployees] = useState([]);
  const [salaryComponents, setSalaryComponents] = useState([]);
  const [loans, setLoans] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [summary, setSummary] = useState({});
  const [payrollSettings, setPayrollSettings] = useState({
    epf_employee_rate: 8,
    epf_employer_rate: 12,
    etf_rate: 3,
    enable_epf: true,
    enable_etf: true,
    tax_enabled: false,
    tax_rate: 0,
    custom_taxes: []
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('employees');
  
  // Modal states
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [showAddComponentModal, setShowAddComponentModal] = useState(false);
  const [showAddLoanModal, setShowAddLoanModal] = useState(false);
  const [showProcessPayrollModal, setShowProcessPayrollModal] = useState(false);
  const [showPayrollSettingsModal, setShowPayrollSettingsModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  
  // Form states
  const [employeeForm, setEmployeeForm] = useState({
    employee_id: '', first_name: '', last_name: '', email: '', phone: '', nic: '',
    address: '', hire_date: '', department: '', designation: '', employment_type: 'Full-time',
    basic_salary: 0, payment_frequency: 'Monthly', bank_name: '', bank_account: '', bank_branch: '',
    epf_number: '', tax_number: ''
  });
  
  const [componentForm, setComponentForm] = useState({
    name: '', type: 'allowance', amount_type: 'fixed', amount: 0, percentage_of: '', is_taxable: true, applies_to_all: false
  });
  
  const [loanForm, setLoanForm] = useState({
    employee_id: '', loan_type: 'Salary Advance', amount: 0, interest_rate: 0,
    disbursement_date: '', repayment_start_date: '', installment_amount: 0,
    installment_frequency: 'Monthly', total_installments: 12, notes: ''
  });
  
  const [payrollForm, setPayrollForm] = useState({
    pay_period_start: '', pay_period_end: '', payment_date: ''
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const [empRes, compRes, loanRes, runRes, summaryRes, settingsRes] = await Promise.all([
        axios.get(`${API}/payroll/employees`),
        axios.get(`${API}/payroll/salary-components`),
        axios.get(`${API}/payroll/loans`),
        axios.get(`${API}/payroll/runs`),
        axios.get(`${API}/payroll/summary`),
        axios.get(`${API}/payroll/settings`).catch(() => ({ data: payrollSettings }))
      ]);
      setEmployees(empRes.data);
      setSalaryComponents(compRes.data);
      setLoans(loanRes.data);
      setPayrollRuns(runRes.data);
      setSummary(summaryRes.data);
      if (settingsRes.data) setPayrollSettings(settingsRes.data);
    } catch (error) {
      console.error('Error fetching payroll data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePayrollSettings = async () => {
    try {
      await axios.put(`${API}/payroll/settings`, payrollSettings);
      setShowPayrollSettingsModal(false);
      alert('Payroll settings saved successfully!');
    } catch (error) {
      alert('Error saving settings');
    }
  };

  const handleAddEmployee = async () => {
    try {
      await axios.post(`${API}/payroll/employees`, employeeForm);
      setShowAddEmployeeModal(false);
      setEmployeeForm({
        employee_id: '', first_name: '', last_name: '', email: '', phone: '', nic: '',
        address: '', hire_date: '', department: '', designation: '', employment_type: 'Full-time',
        basic_salary: 0, payment_frequency: 'Monthly', bank_name: '', bank_account: '', bank_branch: '',
        epf_number: '', tax_number: ''
      });
      fetchAllData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Error adding employee');
    }
  };

  const handleAddComponent = async () => {
    try {
      await axios.post(`${API}/payroll/salary-components`, componentForm);
      setShowAddComponentModal(false);
      setComponentForm({ name: '', type: 'allowance', amount_type: 'fixed', amount: 0, percentage_of: '', is_taxable: true, applies_to_all: false });
      fetchAllData();
    } catch (error) {
      alert('Error adding component');
    }
  };

  const handleAddLoan = async () => {
    try {
      await axios.post(`${API}/payroll/loans`, loanForm);
      setShowAddLoanModal(false);
      setLoanForm({
        employee_id: '', loan_type: 'Salary Advance', amount: 0, interest_rate: 0,
        disbursement_date: '', repayment_start_date: '', installment_amount: 0,
        installment_frequency: 'Monthly', total_installments: 12, notes: ''
      });
      fetchAllData();
    } catch (error) {
      alert('Error adding loan');
    }
  };

  const handleProcessPayroll = async () => {
    try {
      const response = await axios.post(`${API}/payroll/process?pay_period_start=${payrollForm.pay_period_start}&pay_period_end=${payrollForm.pay_period_end}&payment_date=${payrollForm.payment_date}`);
      alert(response.data.message);
      setShowProcessPayrollModal(false);
      setPayrollForm({ pay_period_start: '', pay_period_end: '', payment_date: '' });
      fetchAllData();
    } catch (error) {
      alert(error.response?.data?.detail || 'Error processing payroll');
    }
  };

  const departments = ['Front Desk', 'Housekeeping', 'Restaurant', 'Maintenance', 'Management', 'Security', 'Other'];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header - Gradient Style */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-700 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Payroll Management</h2>
            <p className="text-emerald-200">Manage employees, salaries, loans and payroll with EPF/ETF</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowPayrollSettingsModal(true)}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-500 flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
            <button
              onClick={() => setShowProcessPayrollModal(true)}
              className="bg-white text-emerald-800 px-4 py-2 rounded-lg hover:bg-emerald-100 flex items-center font-medium"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Process Payroll
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Total Employees</p>
          <p className="text-2xl font-bold text-white">{summary.total_employees || 0}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Monthly Payroll</p>
          <p className="text-2xl font-bold text-green-400">LKR {(summary.total_monthly_salary || 0).toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Active Loans</p>
          <p className="text-2xl font-bold text-yellow-400">{summary.active_loans || 0}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Loan Balance</p>
          <p className="text-2xl font-bold text-red-400">LKR {(summary.total_loan_balance || 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-6 border-b border-gray-700">
        {['employees', 'components', 'loans', 'payroll_history'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium ${activeTab === tab ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
          >
            {tab.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Employees Tab */}
      {activeTab === 'employees' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Employees</h3>
            <button onClick={() => setShowAddEmployeeModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              Add Employee
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Designation</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Basic Salary</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-700">
                    <td className="px-4 py-3 text-sm text-gray-300">{emp.employee_id}</td>
                    <td className="px-4 py-3 text-sm text-white">{emp.first_name} {emp.last_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{emp.department}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{emp.designation}</td>
                    <td className="px-4 py-3 text-sm text-green-400">LKR {emp.basic_salary?.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${emp.status === 'Active' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                        {emp.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Salary Components Tab */}
      {activeTab === 'components' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Salary Components (Allowances & Deductions)</h3>
            <button onClick={() => setShowAddComponentModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              Add Component
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
            <div>
              <h4 className="text-green-400 font-medium mb-3">Allowances</h4>
              {salaryComponents.filter(c => c.type === 'allowance').map((comp) => (
                <div key={comp.id} className="bg-gray-700 p-3 rounded-lg mb-2 flex justify-between">
                  <div>
                    <p className="text-white">{comp.name}</p>
                    <p className="text-sm text-gray-400">{comp.amount_type === 'fixed' ? `LKR ${comp.amount}` : `${comp.amount}%`}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${comp.applies_to_all ? 'bg-blue-900 text-blue-300' : 'bg-gray-600 text-gray-300'}`}>
                    {comp.applies_to_all ? 'All' : 'Custom'}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <h4 className="text-red-400 font-medium mb-3">Deductions</h4>
              {salaryComponents.filter(c => c.type === 'deduction').map((comp) => (
                <div key={comp.id} className="bg-gray-700 p-3 rounded-lg mb-2 flex justify-between">
                  <div>
                    <p className="text-white">{comp.name}</p>
                    <p className="text-sm text-gray-400">{comp.amount_type === 'fixed' ? `LKR ${comp.amount}` : `${comp.amount}%`}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${comp.applies_to_all ? 'bg-blue-900 text-blue-300' : 'bg-gray-600 text-gray-300'}`}>
                    {comp.applies_to_all ? 'All' : 'Custom'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loans Tab */}
      {activeTab === 'loans' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Employee Loans</h3>
            <button onClick={() => setShowAddLoanModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              Add Loan
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Installment</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {loans.map((loan) => {
                  const emp = employees.find(e => e.id === loan.employee_id);
                  return (
                    <tr key={loan.id} className="hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm text-white">{emp ? `${emp.first_name} ${emp.last_name}` : 'Unknown'}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">{loan.loan_type}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">LKR {loan.amount?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">LKR {loan.installment_amount?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-yellow-400">LKR {loan.remaining_balance?.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${loan.status === 'Active' ? 'bg-yellow-900 text-yellow-300' : 'bg-green-900 text-green-300'}`}>
                          {loan.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payroll History Tab */}
      {activeTab === 'payroll_history' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold text-white">Payroll History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Pay Period</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Payment Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Gross</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Deductions</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Net</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">EPF (Emp+Empr)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {payrollRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-700">
                    <td className="px-4 py-3 text-sm text-white">{run.pay_period_start} to {run.pay_period_end}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{run.payment_date}</td>
                    <td className="px-4 py-3 text-sm text-green-400">LKR {run.total_gross?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-red-400">LKR {run.total_deductions?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-blue-400">LKR {run.total_net?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">LKR {((run.total_epf_employee || 0) + (run.total_epf_employer || 0)).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs rounded-full bg-green-900 text-green-300">{run.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddEmployeeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto my-8">
            <h3 className="text-lg font-semibold mb-4">Add New Employee</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID *</label>
                <input type="text" value={employeeForm.employee_id} onChange={(e) => setEmployeeForm({...employeeForm, employee_id: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" placeholder="EMP001" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NIC</label>
                <input type="text" value={employeeForm.nic} onChange={(e) => setEmployeeForm({...employeeForm, nic: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" placeholder="National ID" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input type="text" value={employeeForm.first_name} onChange={(e) => setEmployeeForm({...employeeForm, first_name: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input type="text" value={employeeForm.last_name} onChange={(e) => setEmployeeForm({...employeeForm, last_name: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={employeeForm.email} onChange={(e) => setEmployeeForm({...employeeForm, email: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="text" value={employeeForm.phone} onChange={(e) => setEmployeeForm({...employeeForm, phone: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                <select value={employeeForm.department} onChange={(e) => setEmployeeForm({...employeeForm, department: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md">
                  <option value="">Select Department</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Designation *</label>
                <input type="text" value={employeeForm.designation} onChange={(e) => setEmployeeForm({...employeeForm, designation: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" placeholder="e.g. Manager, Staff" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hire Date *</label>
                <input type="date" value={employeeForm.hire_date} onChange={(e) => setEmployeeForm({...employeeForm, hire_date: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Basic Salary (LKR) *</label>
                <input type="number" value={employeeForm.basic_salary} onChange={(e) => setEmployeeForm({...employeeForm, basic_salary: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                <input type="text" value={employeeForm.bank_name} onChange={(e) => setEmployeeForm({...employeeForm, bank_name: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account</label>
                <input type="text" value={employeeForm.bank_account} onChange={(e) => setEmployeeForm({...employeeForm, bank_account: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">EPF Number</label>
                <input type="text" value={employeeForm.epf_number} onChange={(e) => setEmployeeForm({...employeeForm, epf_number: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
                <select value={employeeForm.employment_type} onChange={(e) => setEmployeeForm({...employeeForm, employment_type: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md">
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Contract">Contract</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowAddEmployeeModal(false)} className="px-4 py-2 border rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddEmployee} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Add Employee</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Component Modal */}
      {showAddComponentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Salary Component</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" value={componentForm.name} onChange={(e) => setComponentForm({...componentForm, name: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" placeholder="e.g. Transport Allowance" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select value={componentForm.type} onChange={(e) => setComponentForm({...componentForm, type: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md">
                  <option value="allowance">Allowance</option>
                  <option value="deduction">Deduction</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount Type</label>
                <select value={componentForm.amount_type} onChange={(e) => setComponentForm({...componentForm, amount_type: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md">
                  <option value="fixed">Fixed Amount</option>
                  <option value="percentage">Percentage</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount {componentForm.amount_type === 'percentage' ? '(%)' : '(LKR)'}</label>
                <input type="number" value={componentForm.amount} onChange={(e) => setComponentForm({...componentForm, amount: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div className="flex items-center">
                <input type="checkbox" checked={componentForm.applies_to_all} onChange={(e) => setComponentForm({...componentForm, applies_to_all: e.target.checked})}
                  className="mr-2" id="appliesAll" />
                <label htmlFor="appliesAll" className="text-sm text-gray-700">Apply to all employees</label>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowAddComponentModal(false)} className="px-4 py-2 border rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddComponent} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Add Component</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Loan Modal */}
      {showAddLoanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Add Employee Loan</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
                <select value={loanForm.employee_id} onChange={(e) => setLoanForm({...loanForm, employee_id: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md">
                  <option value="">Select Employee</option>
                  {employees.filter(e => e.status === 'Active').map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loan Type</label>
                <select value={loanForm.loan_type} onChange={(e) => setLoanForm({...loanForm, loan_type: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md">
                  <option value="Salary Advance">Salary Advance</option>
                  <option value="Personal Loan">Personal Loan</option>
                  <option value="Emergency Loan">Emergency Loan</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (LKR) *</label>
                <input type="number" value={loanForm.amount} onChange={(e) => setLoanForm({...loanForm, amount: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Installment (LKR) *</label>
                <input type="number" value={loanForm.installment_amount} onChange={(e) => setLoanForm({...loanForm, installment_amount: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of Installments</label>
                <input type="number" value={loanForm.total_installments} onChange={(e) => setLoanForm({...loanForm, total_installments: parseInt(e.target.value) || 12})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Disbursement Date</label>
                <input type="date" value={loanForm.disbursement_date} onChange={(e) => setLoanForm({...loanForm, disbursement_date: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Repayment Start Date</label>
                <input type="date" value={loanForm.repayment_start_date} onChange={(e) => setLoanForm({...loanForm, repayment_start_date: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowAddLoanModal(false)} className="px-4 py-2 border rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddLoan} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Add Loan</button>
            </div>
          </div>
        </div>
      )}

      {/* Process Payroll Modal */}
      {showProcessPayrollModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Process Payroll</h3>
            <p className="text-sm text-gray-600 mb-4">This will calculate salaries for all active employees including EPF/ETF contributions.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pay Period Start *</label>
                <input type="date" value={payrollForm.pay_period_start} onChange={(e) => setPayrollForm({...payrollForm, pay_period_start: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pay Period End *</label>
                <input type="date" value={payrollForm.pay_period_end} onChange={(e) => setPayrollForm({...payrollForm, pay_period_end: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
                <input type="date" value={payrollForm.payment_date} onChange={(e) => setPayrollForm({...payrollForm, payment_date: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowProcessPayrollModal(false)} className="px-4 py-2 border rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={handleProcessPayroll} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Process Payroll</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Maintenance Component
const Maintenance = () => {
  const [items, setItems] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [summary, setSummary] = useState({});
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('items');
  
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  
  const [itemForm, setItemForm] = useState({
    item_name: '', description: '', quantity: 1, unit_price: 0, purchase_date: '',
    room_number: '', category: 'General', vendor: '', invoice_number: '', notes: ''
  });
  
  const [taskForm, setTaskForm] = useState({
    room_number: '', task_type: 'Repair', description: '', priority: 'Medium',
    assigned_to: '', estimated_cost: 0, scheduled_date: '', notes: ''
  });

  const categories = ['General', 'Plumbing', 'Electrical', 'Furniture', 'Appliance', 'Cleaning Supplies', 'Linen', 'Paint', 'Other'];
  const taskTypes = ['Repair', 'Replacement', 'Inspection', 'Cleaning', 'Installation', 'Other'];
  const priorities = ['Low', 'Medium', 'High', 'Urgent'];

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const [itemsRes, tasksRes, summaryRes, roomsRes] = await Promise.all([
        axios.get(`${API}/maintenance/items`),
        axios.get(`${API}/maintenance/tasks`),
        axios.get(`${API}/maintenance/summary`),
        axios.get(`${API}/rooms`)
      ]);
      setItems(itemsRes.data);
      setTasks(tasksRes.data);
      setSummary(summaryRes.data);
      setRooms(roomsRes.data);
    } catch (error) {
      console.error('Error fetching maintenance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    try {
      await axios.post(`${API}/maintenance/items`, itemForm);
      setShowAddItemModal(false);
      setItemForm({ item_name: '', description: '', quantity: 1, unit_price: 0, purchase_date: '', room_number: '', category: 'General', vendor: '', invoice_number: '', notes: '' });
      fetchAllData();
    } catch (error) {
      alert('Error adding item');
    }
  };

  const handleAddTask = async () => {
    try {
      await axios.post(`${API}/maintenance/tasks`, taskForm);
      setShowAddTaskModal(false);
      setTaskForm({ room_number: '', task_type: 'Repair', description: '', priority: 'Medium', assigned_to: '', estimated_cost: 0, scheduled_date: '', notes: '' });
      fetchAllData();
    } catch (error) {
      alert('Error adding task');
    }
  };

  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    try {
      await axios.put(`${API}/maintenance/tasks/${taskId}`, { status: newStatus });
      fetchAllData();
    } catch (error) {
      alert('Error updating task');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header - Gradient Style */}
      <div className="bg-gradient-to-r from-orange-700 to-amber-600 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Maintenance Tracking</h2>
            <p className="text-orange-200">Track room maintenance items, tasks and expenses</p>
          </div>
          <button
            onClick={() => setShowAddItemModal(true)}
            className="bg-white text-orange-800 px-4 py-2 rounded-lg hover:bg-orange-100 flex items-center font-medium"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Purchase
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Total Expense</p>
          <p className="text-2xl font-bold text-red-400">LKR {(summary.total_expense || 0).toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Pending Tasks</p>
          <p className="text-2xl font-bold text-yellow-400">{summary.tasks?.pending || 0}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">In Progress</p>
          <p className="text-2xl font-bold text-blue-400">{summary.tasks?.in_progress || 0}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Completed</p>
          <p className="text-2xl font-bold text-green-400">{summary.tasks?.completed || 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-6 border-b border-gray-700">
        {['items', 'tasks'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium ${activeTab === tab ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
          >
            {tab === 'items' ? 'Purchases & Items' : 'Maintenance Tasks'}
          </button>
        ))}
      </div>

      {/* Items Tab */}
      {activeTab === 'items' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Maintenance Purchases</h3>
            <button onClick={() => setShowAddItemModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              Add Purchase
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Room</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Vendor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-700">
                    <td className="px-4 py-3 text-sm text-gray-300">{item.purchase_date}</td>
                    <td className="px-4 py-3 text-sm text-white">{item.item_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{item.category}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{item.room_number || 'General'}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{item.quantity}</td>
                    <td className="px-4 py-3 text-sm text-red-400">LKR {item.total_price?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{item.vendor || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Maintenance Tasks</h3>
            <button onClick={() => setShowAddTaskModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              Add Task
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Room</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-700">
                    <td className="px-4 py-3 text-sm text-white">{task.room_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{task.task_type}</td>
                    <td className="px-4 py-3 text-sm text-gray-300 max-w-xs truncate">{task.description}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        task.priority === 'Urgent' ? 'bg-red-900 text-red-300' :
                        task.priority === 'High' ? 'bg-orange-900 text-orange-300' :
                        task.priority === 'Medium' ? 'bg-yellow-900 text-yellow-300' :
                        'bg-gray-600 text-gray-300'
                      }`}>{task.priority}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        task.status === 'Completed' ? 'bg-green-900 text-green-300' :
                        task.status === 'In Progress' ? 'bg-blue-900 text-blue-300' :
                        'bg-yellow-900 text-yellow-300'
                      }`}>{task.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <select 
                        value={task.status}
                        onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value)}
                        className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
                      >
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItemModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Add Maintenance Purchase</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                <input type="text" value={itemForm.item_name} onChange={(e) => setItemForm({...itemForm, item_name: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" placeholder="e.g. Light Bulb, Faucet" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select value={itemForm.category} onChange={(e) => setItemForm({...itemForm, category: e.target.value})}
                    className="w-full px-3 py-2 border rounded-md">
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Room (Optional)</label>
                  <select value={itemForm.room_number} onChange={(e) => setItemForm({...itemForm, room_number: e.target.value})}
                    className="w-full px-3 py-2 border rounded-md">
                    <option value="">General/Hotel-wide</option>
                    {rooms.map(r => <option key={r.room_number} value={r.room_number}>{r.room_number}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input type="number" value={itemForm.quantity} onChange={(e) => setItemForm({...itemForm, quantity: parseInt(e.target.value) || 1})}
                    className="w-full px-3 py-2 border rounded-md" min="1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price (LKR)</label>
                  <input type="number" value={itemForm.unit_price} onChange={(e) => setItemForm({...itemForm, unit_price: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border rounded-md" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date *</label>
                <input type="date" value={itemForm.purchase_date} onChange={(e) => setItemForm({...itemForm, purchase_date: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <input type="text" value={itemForm.vendor} onChange={(e) => setItemForm({...itemForm, vendor: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" placeholder="Supplier name" />
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm text-gray-600">Total: <strong className="text-lg">LKR {(itemForm.quantity * itemForm.unit_price).toLocaleString()}</strong></p>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowAddItemModal(false)} className="px-4 py-2 border rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddItem} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Add Purchase</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-4">Add Maintenance Task</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Room *</label>
                <select value={taskForm.room_number} onChange={(e) => setTaskForm({...taskForm, room_number: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md">
                  <option value="">Select Room</option>
                  {rooms.map(r => <option key={r.room_number} value={r.room_number}>{r.room_number} - {r.room_type}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Task Type</label>
                  <select value={taskForm.task_type} onChange={(e) => setTaskForm({...taskForm, task_type: e.target.value})}
                    className="w-full px-3 py-2 border rounded-md">
                    {taskTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select value={taskForm.priority} onChange={(e) => setTaskForm({...taskForm, priority: e.target.value})}
                    className="w-full px-3 py-2 border rounded-md">
                    {priorities.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea value={taskForm.description} onChange={(e) => setTaskForm({...taskForm, description: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" rows="3" placeholder="Describe the maintenance issue"></textarea>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Cost</label>
                  <input type="number" value={taskForm.estimated_cost} onChange={(e) => setTaskForm({...taskForm, estimated_cost: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date</label>
                  <input type="date" value={taskForm.scheduled_date} onChange={(e) => setTaskForm({...taskForm, scheduled_date: e.target.value})}
                    className="w-full px-3 py-2 border rounded-md" />
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowAddTaskModal(false)} className="px-4 py-2 border rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddTask} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Add Task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Stock Management Component
const StocksManagement = () => {
  const [stocks, setStocks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // all, restaurant, maintenance, transactions
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [menuCategories, setMenuCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  
  const [stockForm, setStockForm] = useState({
    item_name: '',
    item_type: 'restaurant',
    category: 'General',
    unit: 'pcs',
    current_stock: 0,
    low_stock_threshold: 10,
    cost_per_unit: 0,
    selling_price: 0,
    add_to_menu: true, // Auto-add restaurant items to menu
    menu_category_id: '',
    linked_menu_item_id: ''
  });
  
  const [adjustForm, setAdjustForm] = useState({
    quantity: 0,
    notes: '',
    transaction_type: 'add'
  });

  const stockCategories = {
    restaurant: ['Beverages', 'Food Items', 'Snacks', 'Dairy', 'Vegetables', 'Meat', 'General'],
    maintenance: ['Linens', 'Toiletries', 'Cleaning Supplies', 'Electrical', 'Plumbing', 'Furniture', 'General']
  };

  const units = ['pcs', 'bottles', 'kg', 'liters', 'sets', 'boxes', 'packets', 'rolls'];

  useEffect(() => {
    fetchStocks();
    fetchTransactions();
    fetchSummary();
    fetchMenuItems();
    fetchMenuCategories();
  }, []);

  const fetchStocks = async () => {
    try {
      const response = await axios.get(`${API}/stocks`);
      setStocks(response.data);
    } catch (error) {
      console.error('Error fetching stocks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await axios.get(`${API}/stocks/transactions?limit=50`);
      setTransactions(response.data);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await axios.get(`${API}/stocks/summary`);
      setSummary(response.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  const fetchMenuItems = async () => {
    try {
      const response = await axios.get(`${API}/restaurant/menu-items`);
      setMenuItems(response.data);
    } catch (error) {
      console.error('Error fetching menu items:', error);
    }
  };

  const fetchMenuCategories = async () => {
    try {
      const response = await axios.get(`${API}/restaurant/categories`);
      setMenuCategories(response.data);
    } catch (error) {
      console.error('Error fetching menu categories:', error);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await axios.post(`${API}/restaurant/categories`, { name: newCategoryName.trim() });
      setNewCategoryName('');
      setShowAddCategoryModal(false);
      fetchMenuCategories();
      alert('Category added successfully!');
    } catch (error) {
      alert('Error adding category: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    try {
      // First create the stock item
      const stockResponse = await axios.post(`${API}/stocks`, {
        item_name: stockForm.item_name,
        item_type: stockForm.item_type,
        category: stockForm.category,
        unit: stockForm.unit,
        current_stock: stockForm.current_stock,
        low_stock_threshold: stockForm.low_stock_threshold,
        cost_per_unit: stockForm.cost_per_unit
      });
      
      const newStockId = stockResponse.data.stock?.id;
      
      // If restaurant item and add_to_menu is checked, create menu item
      if (stockForm.item_type === 'restaurant' && stockForm.add_to_menu && stockForm.menu_category_id && stockForm.selling_price > 0) {
        try {
          const menuResponse = await axios.post(`${API}/restaurant/menu-items`, {
            name: stockForm.item_name,
            description: `${stockForm.category} item`,
            price: stockForm.selling_price,
            category_id: stockForm.menu_category_id,
            is_vegetarian: false,
            is_spicy: false,
            track_stock: true,
            stock_item_id: newStockId
          });
          
          // Update stock item with linked menu item ID
          if (menuResponse.data.id && newStockId) {
            await axios.put(`${API}/stocks/${newStockId}`, {
              linked_menu_item_id: menuResponse.data.id
            });
          }
          
          alert('Stock item added and linked to restaurant menu!');
        } catch (menuError) {
          console.error('Error adding to menu:', menuError);
          alert('Stock item added, but failed to add to menu: ' + (menuError.response?.data?.detail || menuError.message));
        }
      } else {
        alert('Stock item added successfully!');
      }
      
      setShowAddStockModal(false);
      setStockForm({
        item_name: '', item_type: 'restaurant', category: 'General', unit: 'pcs',
        current_stock: 0, low_stock_threshold: 10, cost_per_unit: 0, selling_price: 0,
        add_to_menu: true, menu_category_id: '', linked_menu_item_id: ''
      });
      fetchStocks();
      fetchSummary();
      fetchMenuItems();
    } catch (error) {
      alert('Error adding stock: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    if (!selectedStock) return;
    try {
      await axios.post(`${API}/stocks/${selectedStock.id}/adjust`, adjustForm);
      alert(`Stock ${adjustForm.transaction_type === 'add' ? 'added' : 'removed'} successfully!`);
      setShowAdjustModal(false);
      setAdjustForm({ quantity: 0, notes: '', transaction_type: 'add' });
      setSelectedStock(null);
      fetchStocks();
      fetchTransactions();
      fetchSummary();
    } catch (error) {
      alert('Error adjusting stock: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteStock = async (stockId) => {
    if (!window.confirm('Are you sure you want to delete this stock item?')) return;
    try {
      await axios.delete(`${API}/stocks/${stockId}`);
      fetchStocks();
      fetchSummary();
    } catch (error) {
      alert('Error deleting stock: ' + (error.response?.data?.detail || error.message));
    }
  };

  const openAdjustModal = (stock, type) => {
    setSelectedStock(stock);
    setAdjustForm({ quantity: 0, notes: '', transaction_type: type });
    setShowAdjustModal(true);
  };

  const getFilteredStocks = () => {
    if (activeTab === 'all') return stocks;
    if (activeTab === 'restaurant') return stocks.filter(s => s.item_type === 'restaurant');
    if (activeTab === 'maintenance') return stocks.filter(s => s.item_type === 'maintenance');
    return stocks;
  };

  const isLowStock = (stock) => stock.current_stock <= stock.low_stock_threshold;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-800 to-cyan-700 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Stock Management</h2>
            <p className="text-teal-200">Manage restaurant items and room maintenance supplies</p>
          </div>
          <button
            onClick={() => setShowAddStockModal(true)}
            className="bg-white text-teal-700 px-4 py-2 rounded-md font-medium hover:bg-teal-50"
            data-testid="add-stock-btn"
          >
            + Add Stock Item
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Total Items</p>
          <p className="text-2xl font-bold text-white">{summary.total_items || 0}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Restaurant Items</p>
          <p className="text-2xl font-bold text-blue-400">{summary.restaurant_items || 0}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Maintenance Items</p>
          <p className="text-2xl font-bold text-green-400">{summary.maintenance_items || 0}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Low Stock Alerts</p>
          <p className="text-2xl font-bold text-red-400">{summary.low_stock_count || 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 mb-6 border-b border-gray-700 overflow-x-auto">
        {[
          { id: 'all', label: 'All Items' },
          { id: 'restaurant', label: 'Restaurant' },
          { id: 'maintenance', label: 'Maintenance' },
          { id: 'transactions', label: 'Transaction History' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-medium whitespace-nowrap ${
              activeTab === tab.id 
                ? 'text-teal-400 border-b-2 border-teal-400' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stock Items Table */}
      {activeTab !== 'transactions' ? (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Item Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Current Stock</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Unit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Cost/Unit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {getFilteredStocks().length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-gray-400">
                      No stock items found. Add your first item!
                    </td>
                  </tr>
                ) : (
                  getFilteredStocks().map(stock => (
                    <tr key={stock.id} className={`hover:bg-gray-700 ${isLowStock(stock) ? 'bg-red-900/20' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-white">{stock.item_name}</div>
                        {stock.linked_menu_item_id && (
                          <div className="text-xs text-blue-400">Linked to menu</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          stock.item_type === 'restaurant' ? 'bg-blue-900 text-blue-300' : 'bg-green-900 text-green-300'
                        }`}>
                          {stock.item_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">{stock.category}</td>
                      <td className="px-4 py-3">
                        <span className={`text-lg font-bold ${isLowStock(stock) ? 'text-red-400' : 'text-white'}`}>
                          {stock.current_stock}
                        </span>
                        {isLowStock(stock) && (
                          <span className="ml-2 text-xs text-red-400">Low!</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">{stock.unit}</td>
                      <td className="px-4 py-3 text-sm text-green-400">LKR {stock.cost_per_unit?.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {isLowStock(stock) ? (
                          <span className="px-2 py-1 text-xs rounded-full bg-red-900 text-red-300">Low Stock</span>
                        ) : (
                          <span className="px-2 py-1 text-xs rounded-full bg-green-900 text-green-300">OK</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => openAdjustModal(stock, 'add')}
                            className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                            title="Add Stock"
                          >
                            +
                          </button>
                          <button
                            onClick={() => openAdjustModal(stock, 'remove')}
                            className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700"
                            title="Remove Stock"
                          >
                            -
                          </button>
                          <button
                            onClick={() => handleDeleteStock(stock.id)}
                            className="bg-gray-600 text-white px-2 py-1 rounded text-xs hover:bg-gray-500"
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Transactions Tab */
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Previous</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">New</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Notes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-gray-400">
                      No transactions yet
                    </td>
                  </tr>
                ) : (
                  transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-white">{tx.stock_item_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          tx.transaction_type === 'add' ? 'bg-green-900 text-green-300' :
                          tx.transaction_type === 'remove' ? 'bg-red-900 text-red-300' :
                          tx.transaction_type === 'sale' ? 'bg-blue-900 text-blue-300' :
                          'bg-gray-700 text-gray-300'
                        }`}>
                          {tx.transaction_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-white">{tx.quantity}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{tx.previous_stock}</td>
                      <td className="px-4 py-3 text-sm text-white">{tx.new_stock}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">{tx.notes || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{tx.created_by}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Stock Modal */}
      {showAddStockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">Add Stock Item</h3>
            <form onSubmit={handleAddStock} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Item Name *</label>
                <input
                  type="text"
                  value={stockForm.item_name}
                  onChange={(e) => setStockForm({...stockForm, item_name: e.target.value})}
                  required
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  placeholder="e.g., Water Bottles, Bed Sheets"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Type *</label>
                  <select
                    value={stockForm.item_type}
                    onChange={(e) => setStockForm({...stockForm, item_type: e.target.value, category: 'General', add_to_menu: e.target.value === 'restaurant'})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  >
                    <option value="restaurant">Restaurant</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Stock Category</label>
                  <select
                    value={stockForm.category}
                    onChange={(e) => setStockForm({...stockForm, category: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  >
                    {stockCategories[stockForm.item_type]?.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Initial Stock</label>
                  <input
                    type="number"
                    value={stockForm.current_stock}
                    onChange={(e) => setStockForm({...stockForm, current_stock: parseFloat(e.target.value) || 0})}
                    min="0"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Unit</label>
                  <select
                    value={stockForm.unit}
                    onChange={(e) => setStockForm({...stockForm, unit: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  >
                    {units.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Low Stock Alert</label>
                  <input
                    type="number"
                    value={stockForm.low_stock_threshold}
                    onChange={(e) => setStockForm({...stockForm, low_stock_threshold: parseFloat(e.target.value) || 0})}
                    min="0"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Cost per Unit (LKR)</label>
                  <input
                    type="number"
                    value={stockForm.cost_per_unit}
                    onChange={(e) => setStockForm({...stockForm, cost_per_unit: parseFloat(e.target.value) || 0})}
                    min="0"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  />
                </div>
              </div>

              {/* Restaurant-specific options */}
              {stockForm.item_type === 'restaurant' && (
                <>
                  <div className="border-t border-gray-600 pt-4 mt-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stockForm.add_to_menu}
                        onChange={(e) => setStockForm({...stockForm, add_to_menu: e.target.checked})}
                        className="w-5 h-5 rounded border-gray-500 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-white font-medium">Add to Restaurant Menu</span>
                    </label>
                    <p className="text-xs text-gray-400 mt-1 ml-8">Automatically create a menu item that links to this stock</p>
                  </div>

                  {stockForm.add_to_menu && (
                    <div className="space-y-4 bg-gray-700/50 rounded-lg p-4">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-sm font-medium text-gray-300">Menu Category *</label>
                          <button
                            type="button"
                            onClick={() => setShowAddCategoryModal(true)}
                            className="text-xs text-teal-400 hover:text-teal-300"
                          >
                            + Add New Category
                          </button>
                        </div>
                        <select
                          value={stockForm.menu_category_id}
                          onChange={(e) => setStockForm({...stockForm, menu_category_id: e.target.value})}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                          required={stockForm.add_to_menu}
                        >
                          <option value="">-- Select Menu Category --</option>
                          {menuCategories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Selling Price (LKR) *</label>
                        <input
                          type="number"
                          value={stockForm.selling_price}
                          onChange={(e) => setStockForm({...stockForm, selling_price: parseFloat(e.target.value) || 0})}
                          min="0"
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                          placeholder="Price for customers"
                          required={stockForm.add_to_menu}
                        />
                        {stockForm.cost_per_unit > 0 && stockForm.selling_price > 0 && (
                          <p className="text-xs text-green-400 mt-1">
                            Profit margin: LKR {(stockForm.selling_price - stockForm.cost_per_unit).toLocaleString()} 
                            ({((stockForm.selling_price - stockForm.cost_per_unit) / stockForm.cost_per_unit * 100).toFixed(1)}%)
                          </p>
                        )}
                      </div>
                      <div className="bg-blue-900/30 border border-blue-700 rounded-md p-3">
                        <p className="text-sm text-blue-300">
                          Stock will automatically reduce when this item is sold in the restaurant.
                        </p>
                      </div>
                    </div>
                  )}

                  {!stockForm.add_to_menu && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Link to Existing Menu Item</label>
                      <select
                        value={stockForm.linked_menu_item_id}
                        onChange={(e) => setStockForm({...stockForm, linked_menu_item_id: e.target.value})}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                      >
                        <option value="">-- None (manual stock only) --</option>
                        {menuItems.map(item => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-400 mt-1">Stock will auto-deduct when this menu item is sold</p>
                    </div>
                  )}
                </>
              )}

              {/* Maintenance-specific info */}
              {stockForm.item_type === 'maintenance' && (
                <div className="bg-amber-900/30 border border-amber-700 rounded-md p-3">
                  <p className="text-sm text-amber-300">
                    <strong>Maintenance items</strong> are managed manually. Use the +/- buttons to add stock when purchased or remove when items are damaged/lost.
                  </p>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button type="submit" className="flex-1 bg-teal-600 text-white py-2 px-4 rounded-md hover:bg-teal-700">
                  Add Item
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddStockModal(false)}
                  className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjustModal && selectedStock && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-4">
              {adjustForm.transaction_type === 'add' ? 'Add Stock' : 'Remove Stock'}
            </h3>
            <div className="mb-4 p-3 bg-gray-700 rounded-lg">
              <p className="text-white font-medium">{selectedStock.item_name}</p>
              <p className="text-gray-400 text-sm">Current: {selectedStock.current_stock} {selectedStock.unit}</p>
            </div>
            <form onSubmit={handleAdjustStock} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Quantity *</label>
                <input
                  type="number"
                  value={adjustForm.quantity}
                  onChange={(e) => setAdjustForm({...adjustForm, quantity: parseFloat(e.target.value) || 0})}
                  required
                  min="0.01"
                  step="0.01"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
                <input
                  type="text"
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm({...adjustForm, notes: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  placeholder="e.g., Purchased from supplier"
                />
              </div>
              <div className="flex space-x-3 pt-2">
                <button
                  type="submit"
                  className={`flex-1 py-2 px-4 rounded-md text-white ${
                    adjustForm.transaction_type === 'add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {adjustForm.transaction_type === 'add' ? 'Add' : 'Remove'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAdjustModal(false); setSelectedStock(null); }}
                  className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm" data-testid="add-category-modal">
            <h3 className="text-lg font-semibold text-white mb-4">Add Menu Category</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Category Name *</label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  placeholder="e.g., Main Course, Beverages"
                  data-testid="category-name-input"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleAddCategory}
                  disabled={!newCategoryName.trim()}
                  className="flex-1 bg-teal-600 text-white py-2 px-4 rounded-md hover:bg-teal-700 disabled:opacity-50"
                  data-testid="save-category-btn"
                >
                  Add Category
                </button>
                <button
                  onClick={() => { setShowAddCategoryModal(false); setNewCategoryName(''); }}
                  className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Expense Tracking Component (All Expenses)
const ExpenseTracking = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  
  const [expenseForm, setExpenseForm] = useState({
    category: 'General', description: '', amount: 0, payment_method: 'Cash',
    vendor: '', expense_date: new Date().toISOString().split('T')[0]
  });

  const categories = ['General', 'Utilities', 'Supplies', 'Maintenance', 'Restaurant', 'Salaries', 'Marketing', 'Insurance', 'Rent', 'Other'];

  useEffect(() => {
    fetchExpenses();
  }, [filterCategory, dateRange]);

  const fetchExpenses = async () => {
    try {
      let url = `${API}/expenses`;
      const params = new URLSearchParams();
      if (filterCategory) params.append('category', filterCategory);
      if (dateRange.start) params.append('start_date', dateRange.start);
      if (dateRange.end) params.append('end_date', dateRange.end);
      if (params.toString()) url += `?${params.toString()}`;
      
      const response = await axios.get(url);
      setExpenses(response.data);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async () => {
    try {
      await axios.post(`${API}/expenses`, expenseForm);
      setShowAddExpenseModal(false);
      setExpenseForm({ category: 'General', description: '', amount: 0, payment_method: 'Cash', vendor: '', expense_date: new Date().toISOString().split('T')[0] });
      fetchExpenses();
    } catch (error) {
      alert('Error adding expense');
    }
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header - Gradient Style */}
      <div className="bg-gradient-to-r from-red-800 to-rose-700 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Expense Tracking</h2>
            <p className="text-red-200">Track and manage all hotel expenses</p>
          </div>
          <button
            onClick={() => setShowAddExpenseModal(true)}
            className="bg-white text-red-800 px-4 py-2 rounded-lg hover:bg-red-100 flex items-center font-medium"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Expense
          </button>
        </div>
      </div>

      {/* Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Total Expenses</p>
          <p className="text-2xl font-bold text-red-400">LKR {totalExpenses.toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Records</p>
          <p className="text-2xl font-bold text-white">{expenses.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Average per Record</p>
          <p className="text-2xl font-bold text-yellow-400">LKR {expenses.length > 0 ? Math.round(totalExpenses / expenses.length).toLocaleString() : 0}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6 flex flex-wrap gap-4 items-center border border-gray-700">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Category</label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">From Date</label>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
            className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">To Date</label>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
            className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600"
          />
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Vendor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Payment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {expenses.map((expense) => (
              <tr key={expense.id} className="hover:bg-gray-700">
                <td className="px-4 py-3 text-sm text-gray-300">{expense.expense_date}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 text-xs rounded ${
                    expense.category === 'Restaurant' ? 'bg-orange-900 text-orange-300' :
                    expense.category === 'Maintenance' ? 'bg-yellow-900 text-yellow-300' :
                    expense.category === 'Salaries' ? 'bg-blue-900 text-blue-300' :
                    'bg-gray-600 text-gray-300'
                  }`}>{expense.category}</span>
                </td>
                <td className="px-4 py-3 text-sm text-white max-w-xs truncate">{expense.description}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{expense.vendor || '-'}</td>
                <td className="px-4 py-3 text-sm text-red-400 font-medium">LKR {expense.amount?.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{expense.payment_method}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Expense Modal */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Expense</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select value={expenseForm.category} onChange={(e) => setExpenseForm({...expenseForm, category: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" value={expenseForm.description} onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" placeholder="Expense description" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (LKR)</label>
                <input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm({...expenseForm, amount: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({...expenseForm, expense_date: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <input type="text" value={expenseForm.vendor} onChange={(e) => setExpenseForm({...expenseForm, vendor: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" placeholder="Vendor name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select value={expenseForm.payment_method} onChange={(e) => setExpenseForm({...expenseForm, payment_method: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md">
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Card">Card</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowAddExpenseModal(false)} className="px-4 py-2 border rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddExpense} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">Add Expense</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Restaurant Expenses Component
const RestaurantExpenses = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  
  const [expenseForm, setExpenseForm] = useState({
    item_name: '', category: 'Ingredients', description: '', quantity: 1, unit_price: 0,
    vendor: '', expense_date: new Date().toISOString().split('T')[0]
  });

  const categories = ['Ingredients', 'Beverages', 'Kitchen Equipment', 'Utensils', 'Cleaning Supplies', 'Gas/Fuel', 'Staff Meals', 'Other'];

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    try {
      const response = await axios.get(`${API}/restaurant/expenses`);
      setExpenses(response.data);
    } catch (error) {
      console.error('Error fetching restaurant expenses:', error);
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async () => {
    try {
      const expenseData = {
        ...expenseForm,
        total_price: expenseForm.quantity * expenseForm.unit_price
      };
      await axios.post(`${API}/restaurant/expenses`, expenseData);
      setShowAddExpenseModal(false);
      setExpenseForm({ item_name: '', category: 'Ingredients', description: '', quantity: 1, unit_price: 0, vendor: '', expense_date: new Date().toISOString().split('T')[0] });
      fetchExpenses();
    } catch (error) {
      alert('Error adding expense');
    }
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.total_price || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header - Gradient Style */}
      <div className="bg-gradient-to-r from-yellow-700 to-orange-600 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Restaurant Expenses</h2>
            <p className="text-yellow-200">Track kitchen supplies, ingredients and restaurant costs</p>
          </div>
          <button
            onClick={() => setShowAddExpenseModal(true)}
            className="bg-white text-orange-800 px-4 py-2 rounded-lg hover:bg-orange-100 flex items-center font-medium"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Expense
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Total Restaurant Expenses</p>
          <p className="text-2xl font-bold text-orange-400">LKR {totalExpenses.toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Purchase Records</p>
          <p className="text-2xl font-bold text-white">{expenses.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">This Month</p>
          <p className="text-2xl font-bold text-yellow-400">LKR {expenses.filter(e => {
            const expDate = new Date(e.expense_date);
            const now = new Date();
            return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
          }).reduce((sum, e) => sum + (e.total_price || 0), 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Item</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Qty</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Unit Price</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Total</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Vendor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {expenses.map((expense) => (
              <tr key={expense.id} className="hover:bg-gray-700">
                <td className="px-4 py-3 text-sm text-gray-300">{expense.expense_date}</td>
                <td className="px-4 py-3 text-sm text-white">{expense.item_name}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 text-xs rounded bg-orange-900 text-orange-300">{expense.category}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">{expense.quantity}</td>
                <td className="px-4 py-3 text-sm text-gray-300">LKR {expense.unit_price?.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-orange-400 font-medium">LKR {expense.total_price?.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{expense.vendor || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Expense Modal */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Restaurant Expense</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                <input type="text" value={expenseForm.item_name} onChange={(e) => setExpenseForm({...expenseForm, item_name: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" placeholder="e.g. Rice, Chicken, Oil" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select value={expenseForm.category} onChange={(e) => setExpenseForm({...expenseForm, category: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input type="number" value={expenseForm.quantity} onChange={(e) => setExpenseForm({...expenseForm, quantity: parseInt(e.target.value) || 1})}
                    className="w-full px-3 py-2 border rounded-md" min="1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price (LKR)</label>
                  <input type="number" value={expenseForm.unit_price} onChange={(e) => setExpenseForm({...expenseForm, unit_price: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border rounded-md" />
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm">Total: <strong className="text-orange-600">LKR {(expenseForm.quantity * expenseForm.unit_price).toLocaleString()}</strong></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({...expenseForm, expense_date: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <input type="text" value={expenseForm.vendor} onChange={(e) => setExpenseForm({...expenseForm, vendor: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md" placeholder="Supplier name" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowAddExpenseModal(false)} className="px-4 py-2 border rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddExpense} className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700">Add Expense</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Settings Component
const Settings = () => {
  // State for different sections
  const [users, setUsers] = useState([]);
  const [hotelSettings, setHotelSettings] = useState({});
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // UI state
  const [activeTab, setActiveTab] = useState('users'); // users, settings, email, sms, templates, channels, system, logs
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showActivityLogs, setShowActivityLogs] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Email settings state
  const [emailSettings, setEmailSettings] = useState({
    provider: 'smtp',
    smtp_host: '',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    sendgrid_api_key: '',
    aws_access_key: '',
    aws_secret_key: '',
    aws_region: 'us-east-1',
    from_email: '',
    from_name: '',
    is_configured: false
  });
  const [testingEmail, setTestingEmail] = useState(false);
  const [resetting, setResetting] = useState(false);
  
  // SMS Settings state
  const [smsSettings, setSmsSettings] = useState({
    provider: 'twilio',
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_phone_number: '',
    notify_lk_user_id: '',
    notify_lk_api_key: '',
    notify_lk_sender_id: '',
    custom_api_url: '',
    custom_api_key: '',
    custom_api_method: 'POST',
    custom_api_headers: {},
    custom_api_body_template: '',
    is_configured: false
  });
  
  // Email & SMS Templates state
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [smsTemplates, setSmsTemplates] = useState([]);
  const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
  const [templateType, setTemplateType] = useState('email'); // email or sms
  const [newTemplate, setNewTemplate] = useState({
    name: '', occasion: 'custom', subject: '', body_html: '', body_text: '', body: '', variables: []
  });
  
  // Custom Message Sending state
  const [showCustomSMSModal, setShowCustomSMSModal] = useState(false);
  const [showCustomEmailModal, setShowCustomEmailModal] = useState(false);
  const [customSmsData, setCustomSmsData] = useState({ phone_number: '', message: '' });
  const [customEmailData, setCustomEmailData] = useState({ email: '', subject: '', body: '' });
  const [sendingCustomMessage, setSendingCustomMessage] = useState(false);
  
  // Tax/Levy Configuration state
  const [taxConfigs, setTaxConfigs] = useState([]);
  const [showAddTaxModal, setShowAddTaxModal] = useState(false);
  const [editingTax, setEditingTax] = useState(null);
  const [newTax, setNewTax] = useState({
    name: '',
    rate: 0,
    type: 'percentage',
    apply_to_bookings: true,
    apply_to_restaurant: false,
    description: ''
  });
  
  // Booking channels state
  const [bookingChannels, setBookingChannels] = useState([]);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [newChannel, setNewChannel] = useState({
    channel_name: '',
    channel_type: 'OTA',
    commission_rate: 0,
    auto_rate: true,
    contact_email: '',
    contact_phone: ''
  });
  
  // Channel API Integration state (for OTA integrations)
  const [channelApiSettings, setChannelApiSettings] = useState({
    booking_com_api_key: '',
    booking_com_property_id: '',
    booking_com_enabled: false,
    expedia_api_key: '',
    expedia_property_id: '',
    expedia_enabled: false,
    agoda_api_key: '',
    agoda_property_id: '',
    agoda_enabled: false
  });
  const [savingChannelApi, setSavingChannelApi] = useState(false);
  
  // Get current user context
  const { user } = useAuth();
  
  // Form states
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'Staff',
    email: '',
    page_permissions: []
  });
  
  const [availablePages, setAvailablePages] = useState([]);
  
  const [settingsForm, setSettingsForm] = useState({
    hotel_name: '',
    hotel_logo: '',
    hotel_contact: '',
    hotel_address: '',
    hotel_email: '',
    hotel_phone: '',
    currency: 'LKR',
    check_in_time: '14:00',
    check_out_time: '12:00',
    default_room_rate: 5000,
    tax_rate: 0
  });

  // Payroll settings state
  const [showPayrollSettingsModal, setShowPayrollSettingsModal] = useState(false);
  const [payrollSettings, setPayrollSettings] = useState({
    enable_epf: true,
    epf_employee_rate: 8.0,
    epf_employer_rate: 12.0,
    enable_etf: true,
    etf_rate: 3.0,
    tax_enabled: false,
    tax_rate: 0.0
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleLogoUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert('Logo file size should be less than 5MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setSettingsForm({...settingsForm, hotel_logo: e.target.result});
      };
      reader.readAsDataURL(file);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchUsers(),
        fetchSettings(),
        fetchEmailSettings(),
        fetchSmsSettings(),
        fetchTemplates(),
        fetchBookingChannels(),
        fetchPayrollSettings(),
        fetchActivityLogs(),
        fetchTaxConfigs(),
        fetchChannelApiSettings(),
        fetchAvailablePages()
      ]);
    } catch (error) {
      console.error('Error fetching settings data:', error);
    }
    setLoading(false);
  };

  const fetchSmsSettings = async () => {
    try {
      const response = await axios.get(`${API}/sms-settings`);
      setSmsSettings(response.data);
    } catch (error) {
      console.error('Error fetching SMS settings:', error);
    }
  };

  const fetchPayrollSettings = async () => {
    try {
      const response = await axios.get(`${API}/payroll/settings`);
      setPayrollSettings(response.data);
    } catch (error) {
      console.error('Error fetching payroll settings:', error);
      // Keep default settings if fetch fails
    }
  };

  const fetchAvailablePages = async () => {
    try {
      const response = await axios.get(`${API}/users/available-pages`);
      setAvailablePages(response.data);
    } catch (error) {
      console.error('Error fetching available pages:', error);
    }
  };

  const fetchTemplates = async () => {
    try {
      const [emailRes, smsRes] = await Promise.all([
        axios.get(`${API}/email-templates`),
        axios.get(`${API}/sms-templates`)
      ]);
      setEmailTemplates(emailRes.data);
      setSmsTemplates(smsRes.data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const handleSaveSmsSettings = async () => {
    try {
      await axios.put(`${API}/sms-settings`, smsSettings);
      alert('SMS settings saved successfully!');
      await fetchSmsSettings();
    } catch (error) {
      alert('Error saving SMS settings');
    }
  };

  const handleAddTemplate = async () => {
    try {
      if (templateType === 'email') {
        await axios.post(`${API}/email-templates`, newTemplate);
      } else {
        await axios.post(`${API}/sms-templates`, {
          name: newTemplate.name,
          occasion: newTemplate.occasion,
          body: newTemplate.body,
          variables: newTemplate.variables
        });
      }
      setShowAddTemplateModal(false);
      setNewTemplate({ name: '', occasion: 'custom', subject: '', body_html: '', body_text: '', body: '', variables: [] });
      await fetchTemplates();
    } catch (error) {
      alert('Error adding template');
    }
  };

  const handleDeleteTemplate = async (templateId, type) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      if (type === 'email') {
        await axios.delete(`${API}/email-templates/${templateId}`);
      } else {
        await axios.delete(`${API}/sms-templates/${templateId}`);
      }
      await fetchTemplates();
    } catch (error) {
      alert('Error deleting template');
    }
  };

  // Send Custom SMS from Settings
  const handleSendCustomSMS = async () => {
    if (!customSmsData.phone_number || !customSmsData.message) {
      alert('Please enter phone number and message');
      return;
    }
    setSendingCustomMessage(true);
    try {
      await axios.post(`${API}/send-custom-sms`, customSmsData);
      alert('SMS sent successfully!');
      setShowCustomSMSModal(false);
      setCustomSmsData({ phone_number: '', message: '' });
    } catch (error) {
      alert('Error sending SMS: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSendingCustomMessage(false);
    }
  };

  // Send Custom Email from Settings
  const handleSendCustomEmail = async () => {
    if (!customEmailData.email || !customEmailData.subject || !customEmailData.body) {
      alert('Please fill in all fields');
      return;
    }
    setSendingCustomMessage(true);
    try {
      await axios.post(`${API}/send-custom-email`, customEmailData);
      alert('Email sent successfully!');
      setShowCustomEmailModal(false);
      setCustomEmailData({ email: '', subject: '', body: '' });
    } catch (error) {
      alert('Error sending email: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSendingCustomMessage(false);
    }
  };

  const handleInitDefaultTemplates = async () => {
    try {
      await Promise.all([
        axios.post(`${API}/email-templates/init-defaults`),
        axios.post(`${API}/sms-templates/init-defaults`)
      ]);
      await fetchTemplates();
      alert('Default templates initialized!');
    } catch (error) {
      alert('Error initializing templates');
    }
  };

  const fetchBookingChannels = async () => {
    try {
      const response = await axios.get(`${API}/booking-channels`);
      setBookingChannels(response.data);
    } catch (error) {
      console.error('Error fetching booking channels:', error);
    }
  };

  // Channel API Settings Functions
  const fetchChannelApiSettings = async () => {
    try {
      const response = await axios.get(`${API}/channel-api-settings`);
      setChannelApiSettings(response.data);
    } catch (error) {
      console.error('Error fetching channel API settings:', error);
      // Keep default empty state if not found
    }
  };

  const handleSaveChannelApiSettings = async () => {
    setSavingChannelApi(true);
    try {
      await axios.put(`${API}/channel-api-settings`, channelApiSettings);
      alert('Channel API settings saved successfully!');
    } catch (error) {
      alert('Error saving channel API settings: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSavingChannelApi(false);
    }
  };

  // Tax Configuration Functions
  const fetchTaxConfigs = async () => {
    try {
      const response = await axios.get(`${API}/taxes`);
      setTaxConfigs(response.data);
    } catch (error) {
      console.error('Error fetching tax configs:', error);
    }
  };

  const handleAddTax = async () => {
    try {
      const params = new URLSearchParams({
        name: newTax.name,
        rate: newTax.rate.toString(),
        type: newTax.type,
        apply_to_bookings: newTax.apply_to_bookings.toString(),
        apply_to_restaurant: newTax.apply_to_restaurant.toString(),
        description: newTax.description || ''
      });
      await axios.post(`${API}/taxes?${params.toString()}`);
      setShowAddTaxModal(false);
      setNewTax({ name: '', rate: 0, type: 'percentage', apply_to_bookings: true, apply_to_restaurant: false, description: '' });
      await fetchTaxConfigs();
      alert('Tax/Levy added successfully!');
    } catch (error) {
      alert('Error adding tax: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleUpdateTax = async (taxId, updates) => {
    try {
      await axios.put(`${API}/taxes/${taxId}`, updates);
      await fetchTaxConfigs();
    } catch (error) {
      alert('Error updating tax: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteTax = async (taxId) => {
    if (!window.confirm('Are you sure you want to delete this tax/levy?')) return;
    try {
      await axios.delete(`${API}/taxes/${taxId}`);
      await fetchTaxConfigs();
      alert('Tax/Levy deleted successfully!');
    } catch (error) {
      alert('Error deleting tax: ' + (error.response?.data?.detail || error.message));
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API}/settings`);
      setHotelSettings(response.data);
      setSettingsForm(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const fetchEmailSettings = async () => {
    try {
      const response = await axios.get(`${API}/email-settings`);
      setEmailSettings(response.data);
    } catch (error) {
      console.error('Error fetching email settings:', error);
      // Create default settings if none exist
      setEmailSettings({
        provider: 'smtp',
        smtp_host: '',
        smtp_port: 587,
        smtp_username: '',
        smtp_password: '',
        sendgrid_api_key: '',
        aws_access_key: '',
        aws_secret_key: '',
        aws_region: 'us-east-1',
        from_email: '',
        from_name: '',
        is_configured: false
      });
    }
  };

  const fetchActivityLogs = async (page = 1) => {
    try {
      const response = await axios.get(`${API}/activity-logs?page=${page}&limit=20`);
      setActivityLogs(response.data.logs);
      setCurrentPage(response.data.page);
      setTotalPages(response.data.total_pages);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/users`, newUser);
      setNewUser({ username: '', password: '', full_name: '', role: 'Staff', email: '', page_permissions: [] });
      setShowCreateUserModal(false);
      fetchUsers();
      alert('User created successfully!');
    } catch (error) {
      alert('Error creating user: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleTogglePagePermission = (pageId) => {
    const currentPermissions = newUser.page_permissions || [];
    if (currentPermissions.includes(pageId)) {
      setNewUser({
        ...newUser,
        page_permissions: currentPermissions.filter(p => p !== pageId)
      });
    } else {
      setNewUser({
        ...newUser,
        page_permissions: [...currentPermissions, pageId]
      });
    }
  };

  const handleSelectAllPages = () => {
    setNewUser({
      ...newUser,
      page_permissions: availablePages.map(p => p.id)
    });
  };

  const handleClearAllPages = () => {
    setNewUser({
      ...newUser,
      page_permissions: []
    });
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await axios.delete(`${API}/users/${userId}`);
        fetchUsers();
        alert('User deleted successfully!');
      } catch (error) {
        alert('Error deleting user: ' + (error.response?.data?.detail || error.message));
      }
    }
  };

  const handleToggleUserStatus = async (userId) => {
    try {
      await axios.put(`${API}/users/${userId}/toggle-status`);
      fetchUsers();
    } catch (error) {
      alert('Error updating user status: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/settings`, settingsForm);
      setHotelSettings(settingsForm);
      alert('Settings updated successfully!');
    } catch (error) {
      alert('Error updating settings: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleSaveEmailSettings = async () => {
    try {
      await axios.put(`${API}/email-settings`, emailSettings);
      await fetchEmailSettings(); // Refresh settings
      alert('Email settings updated successfully!');
    } catch (error) {
      alert('Error updating email settings: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      await axios.post(`${API}/email-settings/test`);
      alert('Test email sent successfully! Check your inbox.');
    } catch (error) {
      alert('Failed to send test email: ' + (error.response?.data?.detail || error.message));
    }
    setTestingEmail(false);
  };

  const handleSavePayrollSettings = async () => {
    try {
      await axios.put(`${API}/payroll/settings`, payrollSettings);
      setShowPayrollSettingsModal(false);
      alert('Payroll settings saved successfully!');
    } catch (error) {
      alert('Error saving payroll settings: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/booking-channels`, newChannel);
      setShowCreateChannelModal(false);
      setNewChannel({
        channel_name: '',
        channel_type: 'OTA',
        commission_rate: 0,
        contact_email: '',
        contact_phone: ''
      });
      await fetchBookingChannels();
      alert('Booking channel created successfully!');
    } catch (error) {
      alert('Error creating booking channel: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleToggleChannelStatus = async (channelId) => {
    try {
      await axios.put(`${API}/booking-channels/${channelId}/toggle-status`);
      await fetchBookingChannels();
      alert('Channel status updated successfully!');
    } catch (error) {
      alert('Error updating channel status: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteChannel = async (channelId, channelName) => {
    if (window.confirm(`Are you sure you want to delete the "${channelName}" booking channel?`)) {
      try {
        await axios.delete(`${API}/booking-channels/${channelId}`);
        await fetchBookingChannels();
        alert('Booking channel deleted successfully!');
      } catch (error) {
        alert('Error deleting booking channel: ' + (error.response?.data?.detail || error.message));
      }
    }
  };

  const handleCompleteReset = async () => {
    // Multiple confirmation dialogs for safety
    const firstConfirm = window.confirm(
      '⚠️ DANGER: COMPLETE SYSTEM RESET\n\n' +
      'This will DELETE ALL DATA including:\n' +
      '• All rooms and bookings\n' +
      '• All guest records\n' +
      '• All financial data\n' +
      '• All users (except admin)\n' +
      '• All activity logs\n\n' +
      'Are you sure you want to continue?'
    );
    
    if (!firstConfirm) return;
    
    const secondConfirm = window.confirm(
      '🔥 FINAL WARNING: This action is IRREVERSIBLE!\n\n' +
      'All your hotel data will be permanently deleted.\n' +
      'Only hotel name and admin account will be preserved.\n\n' +
      'Type YES in the next dialog to confirm.'
    );
    
    if (!secondConfirm) return;
    
    const typeConfirm = window.prompt(
      'Please type "DELETE ALL DATA" to confirm complete reset:'
    );
    
    if (typeConfirm !== 'DELETE ALL DATA') {
      alert('Reset cancelled - confirmation text did not match.');
      return;
    }
    
    setResetting(true);
    try {
      const response = await axios.post(`${API}/admin/complete-reset`);
      
      // Check if setup is required
      if (response.data.requires_setup) {
        alert(
          '✅ COMPLETE RESET SUCCESSFUL!\n\n' +
          'All data has been cleared:\n' +
          `• Rooms cleared: ${response.data.reset_summary.rooms || 0}\n` +
          `• Bookings cleared: ${response.data.reset_summary.bookings || 0}\n` +
          `• Customers cleared: ${response.data.reset_summary.customers || 0}\n` +
          `• Expenses cleared: ${response.data.reset_summary.expenses || 0}\n` +
          `• Incomes cleared: ${response.data.reset_summary.incomes || 0}\n` +
          `• Users cleared: ${response.data.reset_summary.users_except_admin || 0}\n\n` +
          'Hotel settings and admin account preserved.\n' +
          'You will now be redirected to setup wizard to reconfigure hotel and set initial cash/bank balances.'
        );
        
        // Force logout and redirect to setup wizard
        localStorage.removeItem('token');
        window.location.reload();
      } else {
        alert(
          '✅ COMPLETE RESET SUCCESSFUL!\n\n' +
          'All data has been cleared:\n' +
          `• Rooms cleared: ${response.data.reset_summary.rooms || 0}\n` +
          `• Bookings cleared: ${response.data.reset_summary.bookings || 0}\n` +
          `• Customers cleared: ${response.data.reset_summary.customers || 0}\n` +
          `• Expenses cleared: ${response.data.reset_summary.expenses || 0}\n` +
          `• Users cleared: ${response.data.reset_summary.users_except_admin || 0}\n\n` +
          'Hotel name and admin account preserved.\n' +
          'Refreshing page...'
        );
        
        // Refresh the page to show clean state
        window.location.reload();
      }
      
    } catch (error) {
      alert('Reset failed: ' + (error.response?.data?.detail || error.message));
    }
    setResetting(false);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-300 rounded mb-4"></div>
          <div className="h-64 bg-gray-300 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header - Gradient Style */}
      <div className="bg-gradient-to-r from-gray-800 to-zinc-700 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
            <p className="text-gray-300">Manage users, configure hotel settings, and view activity logs</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'users'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'settings'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Hotel Settings
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'email'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Email Settings
          </button>
          <button
            onClick={() => setActiveTab('sms')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'sms'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            SMS Settings
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'templates'
                ? 'border-yellow-500 text-yellow-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Templates
          </button>
          <button
            onClick={() => setActiveTab('taxes')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'taxes'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Taxes & Levies
          </button>
          <button
            onClick={() => setActiveTab('channels')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'channels'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            📈 Booking Channels
          </button>
          <button
            onClick={() => setActiveTab('channel-api')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'channel-api'
                ? 'border-cyan-500 text-cyan-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            🔗 Channel API
          </button>
          {/* System Management Tab - Only visible to Admin */}
          {user?.role === 'Admin' && (
            <button
              onClick={() => setActiveTab('system')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'system'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🔧 System Management
            </button>
          )}
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'logs'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Activity Logs
          </button>
        </nav>
      </div>

      {/* User Management Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-white">User Management</h2>
              <button
                onClick={() => setShowCreateUserModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                + Add New User
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead>
                  <tr className="bg-gray-700">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Username</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Full Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-600">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">{user.username}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">{user.full_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.role === 'Admin' 
                            ? 'bg-red-100 text-red-800' 
                            : user.role === 'Manager'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">{user.email || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                        <button
                          onClick={() => handleToggleUserStatus(user.id)}
                          className={`px-3 py-1 rounded ${
                            user.is_active 
                              ? 'bg-yellow-500 text-white hover:bg-yellow-600' 
                              : 'bg-green-500 text-white hover:bg-green-600'
                          } transition-colors`}
                        >
                          {user.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        {user.username !== 'admin' && (
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {users.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No users found. Create your first user to get started.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hotel Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Hotel Settings</h2>
            
            <form onSubmit={handleUpdateSettings} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Hotel Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Hotel Name
                  </label>
                  <input
                    type="text"
                    value={settingsForm.hotel_name}
                    onChange={(e) => setSettingsForm({...settingsForm, hotel_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-white"
                    placeholder="Enter hotel name"
                  />
                </div>

                {/* Hotel Logo */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Hotel Logo
                  </label>
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                    />
                    {settingsForm.hotel_logo && (
                      <div className="flex items-center space-x-3 p-3 bg-gray-700 rounded-md">
                        <img
                          src={settingsForm.hotel_logo}
                          alt="Hotel Logo Preview"
                          className="w-16 h-16 object-contain bg-white rounded"
                        />
                        <div className="flex-1">
                          <p className="text-sm text-gray-300">Logo preview</p>
                          <button
                            type="button"
                            onClick={() => setSettingsForm({...settingsForm, hotel_logo: ''})}
                            className="text-red-400 hover:text-red-300 text-xs"
                          >
                            Remove logo
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Hotel Contact */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    value={settingsForm.hotel_contact}
                    onChange={(e) => setSettingsForm({...settingsForm, hotel_contact: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Enter contact number"
                  />
                </div>

                {/* Hotel Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Hotel Email
                  </label>
                  <input
                    type="email"
                    value={settingsForm.hotel_email}
                    onChange={(e) => setSettingsForm({...settingsForm, hotel_email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Enter hotel email"
                  />
                </div>

                {/* Currency */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Currency
                  </label>
                  <select
                    value={settingsForm.currency}
                    onChange={(e) => setSettingsForm({...settingsForm, currency: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="LKR">Sri Lankan Rupee (LKR)</option>
                    <option value="USD">US Dollar (USD)</option>
                    <option value="EUR">Euro (EUR)</option>
                    <option value="GBP">British Pound (GBP)</option>
                  </select>
                </div>

                {/* Timezone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Hotel Timezone
                  </label>
                  <select
                    value={settingsForm.timezone || 'UTC'}
                    onChange={(e) => setSettingsForm({...settingsForm, timezone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="Asia/Colombo">Asia/Colombo (Sri Lanka)</option>
                    <option value="Asia/Kolkata">Asia/Kolkata (India)</option>
                    <option value="Asia/Dubai">Asia/Dubai (UAE)</option>
                    <option value="Asia/Singapore">Asia/Singapore</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                    <option value="Europe/Paris">Europe/Paris (CET)</option>
                    <option value="Australia/Sydney">Australia/Sydney</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (Japan)</option>
                    <option value="UTC">UTC</option>
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    All timestamps in the application will use this timezone
                  </p>
                </div>

                {/* Check-in Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Check-in Time
                  </label>
                  <input
                    type="time"
                    value={settingsForm.check_in_time}
                    onChange={(e) => setSettingsForm({...settingsForm, check_in_time: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                {/* Check-out Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Check-out Time
                  </label>
                  <input
                    type="time"
                    value={settingsForm.check_out_time}
                    onChange={(e) => setSettingsForm({...settingsForm, check_out_time: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                {/* Default Room Rate */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Default Room Rate ({settingsForm.currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={settingsForm.default_room_rate}
                    onChange={(e) => setSettingsForm({...settingsForm, default_room_rate: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Enter default room rate"
                  />
                </div>

                {/* Tax Rate */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={settingsForm.tax_rate}
                    onChange={(e) => setSettingsForm({...settingsForm, tax_rate: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Enter tax rate percentage"
                  />
                </div>
              </div>

              {/* Hotel Address - Full Width */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Hotel Address
                </label>
                <textarea
                  value={settingsForm.hotel_address}
                  onChange={(e) => setSettingsForm({...settingsForm, hotel_address: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  rows="3"
                  placeholder="Enter hotel address"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Update Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email Settings Tab */}
      {activeTab === 'email' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Email Configuration</h2>
              <div className="flex space-x-3">
                <button
                  onClick={handleTestEmail}
                  disabled={!emailSettings.is_configured || testingEmail}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {testingEmail ? 'Sending...' : 'Test Email'}
                </button>
                <button
                  onClick={handleSaveEmailSettings}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Save Settings
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Email Provider Selection */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Provider
                </label>
                <select
                  value={emailSettings.provider}
                  onChange={(e) => setEmailSettings({...emailSettings, provider: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="smtp">Custom SMTP</option>
                  <option value="brevo">Brevo (Sendinblue)</option>
                  <option value="sendgrid">SendGrid</option>
                  <option value="ses">AWS SES</option>
                  <option value="gmail">Gmail SMTP</option>
                </select>
              </div>

              {/* Brevo Settings */}
              {emailSettings.provider === 'brevo' && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-3">Brevo (Sendinblue) Configuration</h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Brevo API Key
                    </label>
                    <input
                      type="password"
                      value={emailSettings.brevo_api_key || ''}
                      onChange={(e) => setEmailSettings({...emailSettings, brevo_api_key: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="xkeysib-xxxxxxxx"
                    />
                    <p className="text-xs text-gray-500 mt-1">Get your API key from Brevo dashboard → SMTP & API</p>
                  </div>
                </div>
              )}

              {/* Common Fields */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  From Email
                </label>
                <input
                  type="email"
                  value={emailSettings.from_email}
                  onChange={(e) => setEmailSettings({...emailSettings, from_email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="noreply@yourhotel.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  From Name
                </label>
                <input
                  type="text"
                  value={emailSettings.from_name}
                  onChange={(e) => setEmailSettings({...emailSettings, from_name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Your Hotel Name"
                />
              </div>

              {/* SMTP/Gmail Settings */}
              {(emailSettings.provider === 'smtp' || emailSettings.provider === 'gmail') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      SMTP Host
                    </label>
                    <input
                      type="text"
                      value={emailSettings.smtp_host}
                      onChange={(e) => setEmailSettings({...emailSettings, smtp_host: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder={emailSettings.provider === 'gmail' ? 'smtp.gmail.com' : 'mail.yourprovider.com'}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      SMTP Port
                    </label>
                    <input
                      type="number"
                      value={emailSettings.smtp_port}
                      onChange={(e) => setEmailSettings({...emailSettings, smtp_port: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="587"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      SMTP Username
                    </label>
                    <input
                      type="text"
                      value={emailSettings.smtp_username}
                      onChange={(e) => setEmailSettings({...emailSettings, smtp_username: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="username@yourprovider.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      SMTP Password
                    </label>
                    <input
                      type="password"
                      value={emailSettings.smtp_password}
                      onChange={(e) => setEmailSettings({...emailSettings, smtp_password: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder={emailSettings.smtp_password ? '••••••••' : 'Enter password'}
                    />
                  </div>
                </>
              )}

              {/* SendGrid Settings */}
              {emailSettings.provider === 'sendgrid' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    SendGrid API Key
                  </label>
                  <input
                    type="password"
                    value={emailSettings.sendgrid_api_key}
                    onChange={(e) => setEmailSettings({...emailSettings, sendgrid_api_key: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder={emailSettings.sendgrid_api_key ? '••••••••' : 'SG.xxxxxxxxxxxxxxxx'}
                  />
                </div>
              )}

              {/* AWS SES Settings */}
              {emailSettings.provider === 'ses' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      AWS Access Key
                    </label>
                    <input
                      type="text"
                      value={emailSettings.aws_access_key}
                      onChange={(e) => setEmailSettings({...emailSettings, aws_access_key: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      AWS Secret Key
                    </label>
                    <input
                      type="password"
                      value={emailSettings.aws_secret_key}
                      onChange={(e) => setEmailSettings({...emailSettings, aws_secret_key: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder={emailSettings.aws_secret_key ? '••••••••' : 'Enter secret key'}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      AWS Region
                    </label>
                    <select
                      value={emailSettings.aws_region}
                      onChange={(e) => setEmailSettings({...emailSettings, aws_region: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="us-east-1">US East (Virginia)</option>
                      <option value="us-west-2">US West (Oregon)</option>
                      <option value="eu-west-1">EU (Ireland)</option>
                      <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Configuration Status */}
            <div className="mt-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
              <div className="flex items-center">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  emailSettings.is_configured 
                    ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' 
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100'
                }`}>
                  {emailSettings.is_configured ? '✓ Configured' : '⚠ Not Configured'}
                </span>
                <span className="ml-3 text-sm text-gray-600 dark:text-gray-300">
                  {emailSettings.is_configured 
                    ? 'Email service is ready to send notifications'
                    : 'Complete the configuration to enable email notifications'
                  }
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SMS Settings Tab */}
      {activeTab === 'sms' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">SMS Settings</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Configure SMS gateway for notifications to guests and staff
                </p>
              </div>
              <button
                onClick={handleSaveSmsSettings}
                className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700"
              >
                Save SMS Settings
              </button>
            </div>

            {/* Provider Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">SMS Provider</label>
              <select
                value={smsSettings.provider}
                onChange={(e) => setSmsSettings({...smsSettings, provider: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="twilio">Twilio (International)</option>
                <option value="notify_lk">Notify.lk (Sri Lanka)</option>
                <option value="custom">Custom HTTP API</option>
              </select>
            </div>

            {/* Twilio Settings */}
            {smsSettings.provider === 'twilio' && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-medium text-gray-900 dark:text-white">Twilio Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account SID</label>
                    <input
                      type="text"
                      value={smsSettings.twilio_account_sid}
                      onChange={(e) => setSmsSettings({...smsSettings, twilio_account_sid: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="ACxxxxxxxxxx"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Auth Token</label>
                    <input
                      type="password"
                      value={smsSettings.twilio_auth_token}
                      onChange={(e) => setSmsSettings({...smsSettings, twilio_auth_token: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="Your auth token"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
                    <input
                      type="text"
                      value={smsSettings.twilio_phone_number}
                      onChange={(e) => setSmsSettings({...smsSettings, twilio_phone_number: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="+1234567890"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Notify.lk Settings */}
            {smsSettings.provider === 'notify_lk' && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-medium text-gray-900 dark:text-white">Notify.lk Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User ID</label>
                    <input
                      type="text"
                      value={smsSettings.notify_lk_user_id}
                      onChange={(e) => setSmsSettings({...smsSettings, notify_lk_user_id: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="Your Notify.lk user ID"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
                    <input
                      type="password"
                      value={smsSettings.notify_lk_api_key}
                      onChange={(e) => setSmsSettings({...smsSettings, notify_lk_api_key: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="Your API key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sender ID</label>
                    <input
                      type="text"
                      value={smsSettings.notify_lk_sender_id}
                      onChange={(e) => setSmsSettings({...smsSettings, notify_lk_sender_id: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="Your Sender ID"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Custom API Settings */}
            {smsSettings.provider === 'custom' && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-medium text-gray-900 dark:text-white">Custom HTTP API Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API URL</label>
                    <input
                      type="text"
                      value={smsSettings.custom_api_url}
                      onChange={(e) => setSmsSettings({...smsSettings, custom_api_url: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="https://api.provider.com/send"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
                    <input
                      type="password"
                      value={smsSettings.custom_api_key}
                      onChange={(e) => setSmsSettings({...smsSettings, custom_api_key: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="Your API key"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Request Body Template (JSON)</label>
                    <textarea
                      value={smsSettings.custom_api_body_template}
                      onChange={(e) => setSmsSettings({...smsSettings, custom_api_body_template: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm"
                      rows="4"
                      placeholder='{"to": "{phone}", "message": "{message}", "api_key": "{api_key}"}'
                    />
                    <p className="text-xs text-gray-500 mt-1">Use placeholders: {'{phone}'}, {'{message}'}, {'{api_key}'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Status */}
            <div className="mt-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
              <div className="flex items-center">
                <span className={`w-3 h-3 rounded-full mr-2 ${smsSettings.is_configured ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {smsSettings.is_configured ? 'SMS gateway configured' : 'SMS gateway not configured'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* Send Custom Message Section */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow p-6 text-white">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Send Custom Message</h2>
                <p className="text-indigo-200 mt-1">
                  Send SMS or Email to any phone number or email address
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowCustomSMSModal(true)}
                  className="bg-white text-indigo-600 px-4 py-2 rounded-md hover:bg-indigo-50 flex items-center font-medium"
                  data-testid="send-custom-sms-btn"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  Send SMS
                </button>
                <button
                  onClick={() => setShowCustomEmailModal(true)}
                  className="bg-white text-purple-600 px-4 py-2 rounded-md hover:bg-purple-50 flex items-center font-medium"
                  data-testid="send-custom-email-btn"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Send Email
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Email & SMS Templates</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Manage notification templates for different occasions
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleInitDefaultTemplates}
                  className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
                >
                  Initialize Defaults
                </button>
                <button
                  onClick={() => { setTemplateType('email'); setShowAddTemplateModal(true); }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  + Email Template
                </button>
                <button
                  onClick={() => { setTemplateType('sms'); setShowAddTemplateModal(true); }}
                  className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700"
                >
                  + SMS Template
                </button>
              </div>
            </div>

            {/* Email Templates */}
            <div className="mb-8">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email Templates ({emailTemplates.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {emailTemplates.map((template) => (
                  <div key={template.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">{template.name}</h4>
                        <span className={`inline-block mt-1 px-2 py-1 text-xs rounded ${
                          template.occasion === 'reservation' ? 'bg-blue-100 text-blue-800' :
                          template.occasion === 'checkin' ? 'bg-green-100 text-green-800' :
                          template.occasion === 'checkout' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {template.occasion}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteTemplate(template.id, 'email')}
                        className="text-red-500 hover:text-red-700"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 truncate">{template.subject}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* SMS Templates */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                SMS Templates ({smsTemplates.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {smsTemplates.map((template) => (
                  <div key={template.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">{template.name}</h4>
                        <span className={`inline-block mt-1 px-2 py-1 text-xs rounded ${
                          template.occasion === 'reservation' ? 'bg-blue-100 text-blue-800' :
                          template.occasion === 'checkin' ? 'bg-green-100 text-green-800' :
                          template.occasion === 'checkout' ? 'bg-orange-100 text-orange-800' :
                          template.occasion === 'cleaning_assigned' ? 'bg-rose-100 text-rose-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {template.occasion}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteTemplate(template.id, 'sms')}
                        className="text-red-500 hover:text-red-700"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">{template.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Template Modal */}
      {showAddTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Add {templateType === 'email' ? 'Email' : 'SMS'} Template</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="e.g., Room Upgrade Offer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Occasion</label>
                <select
                  value={newTemplate.occasion}
                  onChange={(e) => setNewTemplate({...newTemplate, occasion: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="reservation">Reservation</option>
                  <option value="checkin">Check-in</option>
                  <option value="checkout">Check-out</option>
                  {templateType === 'sms' && <option value="cleaning_assigned">Cleaning Assigned</option>}
                  <option value="custom">Custom</option>
                </select>
              </div>
              {templateType === 'email' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                    <input
                      type="text"
                      value={newTemplate.subject}
                      onChange={(e) => setNewTemplate({...newTemplate, subject: e.target.value})}
                      className="w-full px-3 py-2 border rounded-md"
                      placeholder="Email subject with {variables}"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">HTML Body *</label>
                    <textarea
                      value={newTemplate.body_html}
                      onChange={(e) => setNewTemplate({...newTemplate, body_html: e.target.value})}
                      className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                      rows="6"
                      placeholder="<html><body>Hello {guest_name}...</body></html>"
                    />
                  </div>
                </>
              )}
              {templateType === 'sms' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message Body *</label>
                  <textarea
                    value={newTemplate.body}
                    onChange={(e) => setNewTemplate({...newTemplate, body: e.target.value})}
                    className="w-full px-3 py-2 border rounded-md"
                    rows="4"
                    placeholder="Hi {guest_name}, your booking is confirmed..."
                  />
                  <p className="text-xs text-gray-500 mt-1">Max 160 characters recommended for single SMS</p>
                </div>
              )}
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm font-medium text-gray-700 mb-1">Available Variables:</p>
                <p className="text-xs text-gray-600">
                  {'{guest_name}'}, {'{hotel_name}'}, {'{room_number}'}, {'{check_in_date}'}, {'{check_out_date}'}, {'{booking_amount}'}, {'{total_amount}'}, {'{hotel_phone}'}, {'{wifi_password}'}
                </p>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => { setShowAddTemplateModal(false); setNewTemplate({ name: '', occasion: 'custom', subject: '', body_html: '', body_text: '', body: '', variables: [] }); }}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTemplate}
                className={`px-4 py-2 text-white rounded-md ${templateType === 'email' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}`}
              >
                Add Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom SMS Modal */}
      {showCustomSMSModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Send Custom SMS</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                <input
                  type="text"
                  value={customSmsData.phone_number}
                  onChange={(e) => setCustomSmsData({...customSmsData, phone_number: e.target.value})}
                  placeholder="e.g., 94771234567"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                  data-testid="custom-sms-phone"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
                <textarea
                  value={customSmsData.message}
                  onChange={(e) => setCustomSmsData({...customSmsData, message: e.target.value})}
                  rows={4}
                  placeholder="Enter your message..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                  data-testid="custom-sms-message"
                />
                <p className="text-xs text-gray-500 mt-1">{customSmsData.message.length} characters</p>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => { setShowCustomSMSModal(false); setCustomSmsData({ phone_number: '', message: '' }); }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={sendingCustomMessage}
              >
                Cancel
              </button>
              <button
                onClick={handleSendCustomSMS}
                disabled={sendingCustomMessage}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                data-testid="send-custom-sms-submit"
              >
                {sendingCustomMessage ? 'Sending...' : 'Send SMS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Email Modal */}
      {showCustomEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Send Custom Email</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  value={customEmailData.email}
                  onChange={(e) => setCustomEmailData({...customEmailData, email: e.target.value})}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                  data-testid="custom-email-address"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                <input
                  type="text"
                  value={customEmailData.subject}
                  onChange={(e) => setCustomEmailData({...customEmailData, subject: e.target.value})}
                  placeholder="Enter subject..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                  data-testid="custom-email-subject"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
                <textarea
                  value={customEmailData.body}
                  onChange={(e) => setCustomEmailData({...customEmailData, body: e.target.value})}
                  rows={6}
                  placeholder="Enter your message..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                  data-testid="custom-email-body"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => { setShowCustomEmailModal(false); setCustomEmailData({ email: '', subject: '', body: '' }); }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={sendingCustomMessage}
              >
                Cancel
              </button>
              <button
                onClick={handleSendCustomEmail}
                disabled={sendingCustomMessage}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center"
                data-testid="send-custom-email-submit"
              >
                {sendingCustomMessage ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Taxes & Levies Tab */}
      {activeTab === 'taxes' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Taxes & Levies Configuration</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Configure taxes and levies to be applied to bookings and/or restaurant bills
                </p>
              </div>
              <button
                onClick={() => setShowAddTaxModal(true)}
                className="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 transition-colors"
              >
                + Add Tax/Levy
              </button>
            </div>

            {/* Tax List */}
            {taxConfigs.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p className="mb-2">No taxes or levies configured yet.</p>
                <p className="text-sm">Click "Add Tax/Levy" to create your first tax configuration.</p>
                <p className="text-sm mt-2 text-gray-400">Note: If your hotel doesn't collect taxes separately, you can leave this empty.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Rate</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Type</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Apply to Bookings</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Apply to Restaurant</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Active</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {taxConfigs.map((tax) => (
                      <tr key={tax.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{tax.name}</div>
                          {tax.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{tax.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {tax.type === 'percentage' ? `${tax.rate}%` : `LKR ${tax.rate}`}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 capitalize">
                          {tax.type}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleUpdateTax(tax.id, { apply_to_bookings: !tax.apply_to_bookings })}
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              tax.apply_to_bookings
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {tax.apply_to_bookings ? 'Yes' : 'No'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleUpdateTax(tax.id, { apply_to_restaurant: !tax.apply_to_restaurant })}
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              tax.apply_to_restaurant
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {tax.apply_to_restaurant ? 'Yes' : 'No'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleUpdateTax(tax.id, { is_active: !tax.is_active })}
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              tax.is_active
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                            }`}
                          >
                            {tax.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteTax(tax.id)}
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Info Box */}
            <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700">
              <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-2">How Taxes Work</h4>
              <ul className="text-xs text-yellow-700 dark:text-yellow-400 space-y-1">
                <li>• <strong>Apply to Bookings:</strong> Tax will be added to room charges during checkout</li>
                <li>• <strong>Apply to Restaurant:</strong> Tax will be added to restaurant order totals</li>
                <li>• <strong>None (Both off):</strong> Tax is stored but not applied anywhere - useful for hotels that don't collect taxes separately</li>
                <li>• Taxes are calculated on the subtotal before discounts</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Add Tax Modal */}
      {showAddTaxModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add New Tax/Levy</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                <input
                  type="text"
                  value={newTax.name}
                  onChange={(e) => setNewTax({...newTax, name: e.target.value})}
                  placeholder="e.g., Service Tax, VAT, Tourism Levy"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rate *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newTax.rate}
                    onChange={(e) => setNewTax({...newTax, rate: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                  <select
                    value={newTax.type}
                    onChange={(e) => setNewTax({...newTax, type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (LKR)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Apply To</label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={newTax.apply_to_bookings}
                      onChange={(e) => setNewTax({...newTax, apply_to_bookings: e.target.checked})}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Room Bookings (Checkout)</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={newTax.apply_to_restaurant}
                      onChange={(e) => setNewTax({...newTax, apply_to_restaurant: e.target.checked})}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Restaurant Bills</span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave both unchecked if you don't want to apply this tax automatically</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (Optional)</label>
                <input
                  type="text"
                  value={newTax.description}
                  onChange={(e) => setNewTax({...newTax, description: e.target.value})}
                  placeholder="Brief description of this tax"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowAddTaxModal(false);
                  setNewTax({ name: '', rate: 0, type: 'percentage', apply_to_bookings: true, apply_to_restaurant: false, description: '' });
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTax}
                disabled={!newTax.name || newTax.rate <= 0}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Tax
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Channels Tab */}
      {activeTab === 'channels' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">📈 Booking Channels Management</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Manage all booking sources including OTAs, direct bookings, and corporate channels
                </p>
              </div>
              <button
                onClick={() => setShowCreateChannelModal(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
              >
                + Add Channel
              </button>
            </div>

            {/* Channels List */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Channel Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Commission Rate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Auto Rate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                  {bookingChannels.map((channel) => (
                    <tr key={channel.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {channel.channel_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          channel.channel_type === 'Direct' 
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
                            : channel.channel_type === 'OTA'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                        }`}>
                          {channel.channel_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {channel.commission_rate}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          channel.auto_rate !== false
                            ? 'bg-green-800 text-green-100'
                            : 'bg-gray-700 text-gray-300'
                        }`}>
                          {channel.auto_rate !== false ? 'Auto' : 'Manual'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        <div>
                          {channel.contact_email && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              📧 {channel.contact_email}
                            </div>
                          )}
                          {channel.contact_phone && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              📞 {channel.contact_phone}
                            </div>
                          )}
                          {!channel.contact_email && !channel.contact_phone && (
                            <span className="text-xs text-gray-400">No contact info</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          channel.is_active 
                            ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                            : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                        }`}>
                          {channel.is_active ? '✅ Active' : '❌ Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleToggleChannelStatus(channel.id)}
                          className={`px-3 py-1 rounded text-xs ${
                            channel.is_active
                              ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                        >
                          {channel.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        {channel.channel_name !== 'Direct' && (
                          <button
                            onClick={() => handleDeleteChannel(channel.id, channel.channel_name)}
                            className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {bookingChannels.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No booking channels found. Create your first channel to get started.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Channel Modal */}
      {showCreateChannelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add New Booking Channel</h3>
            
            <form onSubmit={handleCreateChannel} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Channel Name *
                </label>
                <input
                  type="text"
                  value={newChannel.channel_name}
                  onChange={(e) => setNewChannel({...newChannel, channel_name: e.target.value})}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="e.g., Booking.com, Expedia"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Channel Type
                </label>
                <select
                  value={newChannel.channel_type}
                  onChange={(e) => setNewChannel({...newChannel, channel_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  <option value="OTA">OTA (Online Travel Agency)</option>
                  <option value="Direct">Direct</option>
                  <option value="Corporate">Corporate</option>
                  <option value="Walk-in">Walk-in</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Commission Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={newChannel.commission_rate}
                  onChange={(e) => setNewChannel({...newChannel, commission_rate: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="e.g., 15.5"
                />
              </div>

              <div>
                <label className="flex items-center space-x-3 cursor-pointer" data-testid="auto-rate-toggle">
                  <div className={`relative w-11 h-6 rounded-full transition-colors ${newChannel.auto_rate ? 'bg-green-500' : 'bg-gray-500'}`}
                    onClick={() => setNewChannel({...newChannel, auto_rate: !newChannel.auto_rate})}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${newChannel.auto_rate ? 'translate-x-5' : ''}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Auto Calculate Commission
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-14">
                  {newChannel.auto_rate 
                    ? 'Commission will be auto-calculated from booking amount during new bookings'
                    : 'User will manually enter commission amount'
                  }
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={newChannel.contact_email}
                  onChange={(e) => setNewChannel({...newChannel, contact_email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="contact@channel.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={newChannel.contact_phone}
                  onChange={(e) => setNewChannel({...newChannel, contact_phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="+1-234-567-8900"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700"
                >
                  Create Channel
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateChannelModal(false)}
                  className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Channel API Settings Tab */}
      {activeTab === 'channel-api' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                🔗 Channel Manager API Integration
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Configure API credentials for automatic booking synchronization with OTAs.
                When you obtain API keys from these platforms, enter them here for automatic updates.
              </p>
            </div>

            <div className="space-y-8">
              {/* Booking.com Integration */}
              <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-6 bg-blue-50 dark:bg-blue-900/20">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-sm">B</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-blue-800 dark:text-blue-200">Booking.com</h3>
                      <p className="text-xs text-blue-600 dark:text-blue-400">Connectivity Partner API</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channelApiSettings.booking_com_enabled}
                      onChange={(e) => setChannelApiSettings({...channelApiSettings, booking_com_enabled: e.target.checked})}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-blue-700 dark:text-blue-300">Enable</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">API Key</label>
                    <input
                      type="password"
                      value={channelApiSettings.booking_com_api_key}
                      onChange={(e) => setChannelApiSettings({...channelApiSettings, booking_com_api_key: e.target.value})}
                      className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="Enter Booking.com API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">Property ID</label>
                    <input
                      type="text"
                      value={channelApiSettings.booking_com_property_id}
                      onChange={(e) => setChannelApiSettings({...channelApiSettings, booking_com_property_id: e.target.value})}
                      className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="Enter Property ID"
                    />
                  </div>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  Get your API credentials from the Booking.com Partner Portal
                </p>
              </div>

              {/* Expedia Integration */}
              <div className="border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 bg-yellow-50 dark:bg-yellow-900/20">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-sm">E</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-yellow-800 dark:text-yellow-200">Expedia</h3>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">Partner Central API</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channelApiSettings.expedia_enabled}
                      onChange={(e) => setChannelApiSettings({...channelApiSettings, expedia_enabled: e.target.checked})}
                      className="w-5 h-5 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                    />
                    <span className="text-sm text-yellow-700 dark:text-yellow-300">Enable</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-1">API Key</label>
                    <input
                      type="password"
                      value={channelApiSettings.expedia_api_key}
                      onChange={(e) => setChannelApiSettings({...channelApiSettings, expedia_api_key: e.target.value})}
                      className="w-full px-3 py-2 border border-yellow-300 dark:border-yellow-600 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 dark:bg-gray-700 dark:text-white"
                      placeholder="Enter Expedia API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-1">Property ID</label>
                    <input
                      type="text"
                      value={channelApiSettings.expedia_property_id}
                      onChange={(e) => setChannelApiSettings({...channelApiSettings, expedia_property_id: e.target.value})}
                      className="w-full px-3 py-2 border border-yellow-300 dark:border-yellow-600 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 dark:bg-gray-700 dark:text-white"
                      placeholder="Enter Property ID"
                    />
                  </div>
                </div>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                  Get your API credentials from Expedia Partner Central
                </p>
              </div>

              {/* Agoda Integration */}
              <div className="border border-red-200 dark:border-red-800 rounded-lg p-6 bg-red-50 dark:bg-red-900/20">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-sm">A</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-red-800 dark:text-red-200">Agoda</h3>
                      <p className="text-xs text-red-600 dark:text-red-400">YCS API Integration</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channelApiSettings.agoda_enabled}
                      onChange={(e) => setChannelApiSettings({...channelApiSettings, agoda_enabled: e.target.checked})}
                      className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm text-red-700 dark:text-red-300">Enable</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-red-700 dark:text-red-300 mb-1">API Key</label>
                    <input
                      type="password"
                      value={channelApiSettings.agoda_api_key}
                      onChange={(e) => setChannelApiSettings({...channelApiSettings, agoda_api_key: e.target.value})}
                      className="w-full px-3 py-2 border border-red-300 dark:border-red-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white"
                      placeholder="Enter Agoda API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-red-700 dark:text-red-300 mb-1">Property ID</label>
                    <input
                      type="text"
                      value={channelApiSettings.agoda_property_id}
                      onChange={(e) => setChannelApiSettings({...channelApiSettings, agoda_property_id: e.target.value})}
                      className="w-full px-3 py-2 border border-red-300 dark:border-red-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white"
                      placeholder="Enter Property ID"
                    />
                  </div>
                </div>
                <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                  Get your API credentials from Agoda YCS (Yield Control System)
                </p>
              </div>
            </div>

            {/* Save Button */}
            <div className="mt-8 flex justify-end">
              <button
                onClick={handleSaveChannelApiSettings}
                disabled={savingChannelApi}
                className="bg-cyan-600 text-white px-6 py-3 rounded-lg hover:bg-cyan-700 disabled:bg-gray-400 font-medium transition-colors flex items-center gap-2"
                data-testid="save-channel-api-settings"
              >
                {savingChannelApi ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    💾 Save API Settings
                  </>
                )}
              </button>
            </div>

            {/* Info Notice */}
            <div className="mt-6 bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-blue-500 text-xl">ℹ️</span>
                <div>
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">How it works</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Once you enter valid API credentials and enable the integration, the system will automatically sync 
                    booking data from these platforms. New bookings from Booking.com, Expedia, or Agoda will appear in 
                    your calendar and bookings list with their respective source tags.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Management Tab - Admin Only */}
      {activeTab === 'system' && user?.role === 'Admin' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">🔧 System Management</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Dangerous operations - Admin only
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Payroll Settings Section */}
              <div className="border border-emerald-200 dark:border-emerald-800 rounded-lg p-6 bg-emerald-50 dark:bg-emerald-900/20">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-800 rounded-full flex items-center justify-center">
                      <span className="text-emerald-600 dark:text-emerald-400 text-lg">💰</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-emerald-800 dark:text-emerald-200 mb-2">
                      Payroll Settings
                    </h3>
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                      Configure EPF, ETF, and tax settings for payroll calculations. These settings will be used 
                      when processing employee salaries and generating payslips.
                    </p>
                    
                    <button
                      onClick={() => setShowPayrollSettingsModal(true)}
                      className="bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 font-medium transition-colors"
                    >
                      ⚙️ Configure Payroll Settings
                    </button>
                  </div>
                </div>
              </div>

              {/* Complete Database Reset Section */}
              <div className="border border-red-200 dark:border-red-800 rounded-lg p-6 bg-red-50 dark:bg-red-900/20">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-red-100 dark:bg-red-800 rounded-full flex items-center justify-center">
                      <span className="text-red-600 dark:text-red-400 text-lg">⚠️</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-red-800 dark:text-red-200 mb-2">
                      Complete Database Reset
                    </h3>
                    <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                      This will permanently delete ALL data from the system including rooms, bookings, 
                      guests, financial records, and all users except the admin account. 
                      Only hotel name and admin account will be preserved.
                    </p>
                    
                    <div className="bg-red-100 dark:bg-red-800/50 rounded-lg p-4 mb-4">
                      <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">
                        ⚡ What will be deleted:
                      </h4>
                      <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                        <li>• All rooms and room configurations</li>
                        <li>• All bookings and reservations</li>
                        <li>• All guest information and history</li>
                        <li>• All financial data (expenses, income, daily sales)</li>
                        <li>• All user accounts except admin</li>
                        <li>• All activity logs and system history</li>
                        <li>• All email configurations</li>
                      </ul>
                    </div>

                    <div className="bg-green-100 dark:bg-green-800/50 rounded-lg p-4 mb-4">
                      <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">
                        ✅ What will be preserved:
                      </h4>
                      <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
                        <li>• Hotel name and basic settings</li>
                        <li>• Admin user account (you)</li>
                        <li>• System setup status</li>
                      </ul>
                    </div>
                    
                    <button
                      onClick={handleCompleteReset}
                      disabled={resetting}
                      className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                    >
                      {resetting ? (
                        <span className="flex items-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Resetting System...
                        </span>
                      ) : (
                        '🔥 COMPLETE RESET - DELETE ALL DATA'
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* System Information Section */}
              <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-6 bg-blue-50 dark:bg-blue-900/20">
                <h3 className="text-lg font-medium text-blue-800 dark:text-blue-200 mb-4">
                  💡 System Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-blue-700 dark:text-blue-300">Current User:</span>
                    <span className="ml-2 text-blue-600 dark:text-blue-400">{user?.full_name} ({user?.username})</span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-700 dark:text-blue-300">Role:</span>
                    <span className="ml-2 text-blue-600 dark:text-blue-400">{user?.role}</span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-700 dark:text-blue-300">System Version:</span>
                    <span className="ml-2 text-blue-600 dark:text-blue-400">Hotel Management v2.0</span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-700 dark:text-blue-300">Last Login:</span>
                    <span className="ml-2 text-blue-600 dark:text-blue-400">
                      {user?.last_login ? new Date(user.last_login).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activity Logs Tab */}
      {activeTab === 'logs' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Activity Logs</h2>
              <button
                onClick={() => setShowActivityLogs(!showActivityLogs)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                {showActivityLogs ? 'Hide Logs' : 'Show Logs'}
              </button>
            </div>
            
            {showActivityLogs && (
              <div className="space-y-4">
                {activityLogs.length > 0 ? (
                  <>
                    <div className="space-y-3">
                      {activityLogs.map((log, index) => (
                        <div key={index} className="border dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  log.action.includes('created') || log.action.includes('added')
                                    ? 'bg-green-100 text-green-800'
                                    : log.action.includes('deleted') || log.action.includes('cancelled')
                                    ? 'bg-red-100 text-red-800'
                                    : log.action.includes('updated') || log.action.includes('checked')
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {log.action.replace('_', ' ').toUpperCase()}
                                </span>
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                  {log.user_name}
                                </span>
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                  {new Date(log.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 dark:text-gray-300">{log.description}</p>
                              {log.entity_type && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Entity: {log.entity_type}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex justify-center space-x-2 mt-6">
                        <button
                          onClick={() => fetchActivityLogs(currentPage - 1)}
                          disabled={currentPage <= 1}
                          className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                          Previous
                        </button>
                        
                        <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                          Page {currentPage} of {totalPages}
                        </span>
                        
                        <button
                          onClick={() => fetchActivityLogs(currentPage + 1)}
                          disabled={currentPage >= totalPages}
                          className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No activity logs found.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Create New User</h3>
            
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Enter username"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Enter password"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Enter full name"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  <option value="Staff">Staff</option>
                  <option value="Manager">Manager</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Enter email (required for password recovery)"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Required for password recovery</p>
              </div>
              
              {/* Page Permissions - Only for non-Admin roles */}
              {newUser.role !== 'Admin' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Page Access Permissions
                    </label>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={handleSelectAllPages}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Select All
                      </button>
                      <span className="text-gray-400">|</span>
                      <button
                        type="button"
                        onClick={handleClearAllPages}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  <div className="border border-gray-300 dark:border-gray-600 rounded-md p-3 max-h-48 overflow-y-auto bg-gray-50 dark:bg-gray-700">
                    <div className="grid grid-cols-2 gap-2">
                      {availablePages.map(page => (
                        <label key={page.id} className="flex items-center space-x-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(newUser.page_permissions || []).includes(page.id)}
                            onChange={() => handleTogglePagePermission(page.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{page.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Select which pages this user can access. Admin users have access to all pages automatically.
                  </p>
                </div>
              )}
              
              {newUser.role === 'Admin' && (
                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    ℹ️ Admin users automatically have access to all pages and features.
                  </p>
                </div>
              )}
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateUserModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payroll Settings Modal */}
      {showPayrollSettingsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Payroll Settings</h3>
            <p className="text-sm text-gray-600 mb-6">Configure EPF, ETF, and tax settings for payroll calculations</p>
            
            <div className="space-y-6">
              {/* EPF Settings */}
              <div className="border-b pb-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-800">EPF (Employees' Provident Fund)</h4>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={payrollSettings.enable_epf}
                      onChange={(e) => setPayrollSettings({...payrollSettings, enable_epf: e.target.checked})}
                      className="mr-2"
                    />
                    <span className="text-sm">Enable</span>
                  </label>
                </div>
                {payrollSettings.enable_epf && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Employee Contribution (%)</label>
                      <input
                        type="number"
                        value={payrollSettings.epf_employee_rate}
                        onChange={(e) => setPayrollSettings({...payrollSettings, epf_employee_rate: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-2 border rounded-md"
                        step="0.1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Employer Contribution (%)</label>
                      <input
                        type="number"
                        value={payrollSettings.epf_employer_rate}
                        onChange={(e) => setPayrollSettings({...payrollSettings, epf_employer_rate: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-2 border rounded-md"
                        step="0.1"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ETF Settings */}
              <div className="border-b pb-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-800">ETF (Employees' Trust Fund)</h4>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={payrollSettings.enable_etf}
                      onChange={(e) => setPayrollSettings({...payrollSettings, enable_etf: e.target.checked})}
                      className="mr-2"
                    />
                    <span className="text-sm">Enable</span>
                  </label>
                </div>
                {payrollSettings.enable_etf && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">ETF Rate (%)</label>
                    <input
                      type="number"
                      value={payrollSettings.etf_rate}
                      onChange={(e) => setPayrollSettings({...payrollSettings, etf_rate: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 border rounded-md"
                      step="0.1"
                    />
                  </div>
                )}
              </div>

              {/* Tax Settings */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-800">Payroll Tax</h4>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={payrollSettings.tax_enabled}
                      onChange={(e) => setPayrollSettings({...payrollSettings, tax_enabled: e.target.checked})}
                      className="mr-2"
                    />
                    <span className="text-sm">Enable</span>
                  </label>
                </div>
                {payrollSettings.tax_enabled && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Tax Rate (%)</label>
                    <input
                      type="number"
                      value={payrollSettings.tax_rate}
                      onChange={(e) => setPayrollSettings({...payrollSettings, tax_rate: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 border rounded-md"
                      step="0.1"
                    />
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowPayrollSettingsModal(false)} className="px-4 py-2 border rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={handleSavePayrollSettings} className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700">Save Settings</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Main App Component (Protected Content)
function AppContent() {
  const [hotelSettings, setHotelSettings] = useState({
    hotel_name: 'Hotel Management System',
    hotel_logo: '',
  });

  // Set dark mode on app load
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Fetch hotel settings for header
  useEffect(() => {
    fetchHotelSettings();
  }, []);

  const fetchHotelSettings = async () => {
    try {
      const response = await axios.get(`${API}/settings`);
      setHotelSettings({
        hotel_name: response.data.hotel_name || 'Hotel Management System',
        hotel_logo: response.data.hotel_logo || '',
      });
    } catch (error) {
      console.error('Error fetching hotel settings:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
        {/* Header */}
        <header className="bg-gray-800 shadow-sm border-b border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                {hotelSettings.hotel_logo ? (
                  <img 
                    src={hotelSettings.hotel_logo} 
                    alt="Hotel Logo"
                    className="h-6 w-6 sm:h-8 sm:w-8 object-contain bg-white rounded flex-shrink-0"
                  />
                ) : (
                  <div className="text-lg sm:text-2xl flex-shrink-0">🏨</div>
                )}
                <h1 className="text-lg sm:text-2xl font-bold text-white truncate">{hotelSettings.hotel_name}</h1>
              </div>
              <div className="flex-shrink-0">
                <RealTimeClock />
              </div>
            </div>
          </div>
        </header>

        {/* Navigation */}
        <Navigation />

        {/* Main Content */}
        <main className="bg-gray-900">
          <Routes>
            <Route path="/dashboard" element={<PageGuard pageId="dashboard"><Dashboard /></PageGuard>} />
            <Route path="/calendar" element={<PageGuard pageId="calendar"><CalendarView /></PageGuard>} />
            <Route path="/restaurant" element={<PageGuard pageId="restaurant"><Restaurant /></PageGuard>} />
            <Route path="/rooms" element={<PageGuard pageId="rooms"><Rooms /></PageGuard>} />
            <Route path="/guests" element={<PageGuard pageId="guests"><Guests /></PageGuard>} />
            <Route path="/bookings" element={<PageGuard pageId="bookings"><Bookings /></PageGuard>} />
            <Route path="/income-expense" element={<PageGuard pageId="income_expense"><Expenses /></PageGuard>} />
            <Route path="/expenses" element={<PageGuard pageId="expenses"><ExpenseTracking /></PageGuard>} />
            <Route path="/stocks" element={<PageGuard pageId="stocks"><StocksManagement /></PageGuard>} />
            <Route path="/restaurant-expenses" element={<PageGuard pageId="expenses"><RestaurantExpenses /></PageGuard>} />
            <Route path="/commissions" element={<PageGuard pageId="commissions"><Commissions /></PageGuard>} />
            <Route path="/payroll" element={<PageGuard pageId="payroll"><Payroll /></PageGuard>} />
            <Route path="/maintenance" element={<PageGuard pageId="expenses"><Maintenance /></PageGuard>} />
            <Route path="/settings" element={<PageGuard pageId="settings"><Settings /></PageGuard>} />
          </Routes>
        </main>
    </div>
  );
}

// Main App Component with Authentication
function App() {
  const hostname = window.location.hostname;
  const isCRM = hostname.startsWith("app.");

  return (
    <BrowserRouter>
      <Routes>
        {/* Domain-aware root routing */}
        <Route path="/" element={
          isCRM ? (
            <FinancialProvider><AuthProvider><ProtectedRoute><AppContent /></ProtectedRoute></AuthProvider></FinancialProvider>
          ) : (
            <Website />
          )
        } />
        {/* /website redirects to clean / for public URLs */}
        <Route path="/website" element={<Navigate to="/" replace />} />
        {/* Policy pages - public */}
        <Route path="/refund-policy" element={<Website page="refund" />} />
        <Route path="/privacy-policy" element={<Website page="privacy" />} />
        <Route path="/terms" element={<Website page="terms" />} />
        {/* CRM routes - auth required */}
        <Route path="/*" element={
          <FinancialProvider>
            <AuthProvider>
              <ProtectedRoute>
                <AppContent />
              </ProtectedRoute>
            </AuthProvider>
          </FinancialProvider>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;