import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Mail, Lock, Eye, EyeOff, X, ArrowRight, CheckCircle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ParticleBackground } from "@/components/particle-background";
import { useUser } from "@/lib/userContext";
import { useAuth } from "@/lib/authContext";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { API_ENDPOINTS } from "@/lib/apiConfig";

// ── Validation helpers ─────────────────────────────────────────────────
// Stricter than a naive check: proper local part + domain labels with a TLD,
// and no consecutive dots anywhere (rejects e.g. "user@example..com").
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const isValidEmail = (email: string) => {
  const e = email.trim();
  return EMAIL_RE.test(e) && !e.includes("..");
};

const getPasswordChecks = (pw: string) => ({
  length: pw.length >= 8,
  upper: /[A-Z]/.test(pw),
  lower: /[a-z]/.test(pw),
  digit: /\d/.test(pw),
  special: /[^A-Za-z0-9]/.test(pw),
});
const isStrongPassword = (pw: string) => Object.values(getPasswordChecks(pw)).every(Boolean);

// Border + focus-ring classes that reflect a field's validity (neutral when empty).
const fieldStateClass = (value: string, ok: boolean) =>
  value.length === 0
    ? "border-border focus:border-primary focus:ring-primary/25"
    : ok
    ? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/30"
    : "border-red-500 focus:border-red-500 focus:ring-red-500/30";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { login } = useUser();
  const { login: authLogin } = useAuth();
  
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [isSignupLoading, setIsSignupLoading] = useState(false);
  const [isLoginLoading, setIsLoginLoading] = useState(false);

  // Google OAuth password setup flow
  const [showGooglePasswordSetup, setShowGooglePasswordSetup] = useState(false);
  const [googleUserData, setGoogleUserData] = useState<{name: string, email: string, role: string, token: string, id: string} | null>(null);
  const [googlePassword, setGooglePassword] = useState("");
  const [googleConfirmPassword, setGoogleConfirmPassword] = useState("");
  const [showGooglePassword, setShowGooglePassword] = useState(false);
  const [showGoogleConfirmPassword, setShowGoogleConfirmPassword] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [resetEmail, setResetEmail] = useState("");

  // Live signup password requirement checks.
  const signupPwChecks = getPasswordChecks(signupPassword);

  /**
   * Handle user login with JWT
   * Sends credentials to backend API and stores JWT token
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoginLoading(true);

    try {
      const response = await fetch(API_ENDPOINTS.LOGIN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      const data = await response.json();

      if (data.success && data.data.token) {
        // Store JWT token and user info (with rememberMe preference)
        authLogin(data.data.token, {
          id: data.data.user.id,
          email: data.data.user.email,
          username: data.data.user.username,
          role: data.data.user.role,
        }, rememberMe);

        // Also update legacy context (for compatibility)
        login(data.data.user.username, data.data.user.email, data.data.user.role === "admin" ? "Admin" : "Tester");

        // Redirect based on role
        if (data.data.user.role === "admin") {
          setLocation("/admin");
        } else {
          setLocation("/dashboard");
        }
      } else {
        setLoginError(data.message || "Invalid email or password. Please try again.");
      }
    } catch (error) {
      console.error("Login error:", error);
      setLoginError("Failed to connect to server. Please try again.");
    } finally {
      setIsLoginLoading(false);
    }
  };

  /**
   * Handle user signup
   * Sends signup data to backend API instead of localStorage
   * Backend will save user to MongoDB with role automatically set to "tester"
   */
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset errors
    setSignupError("");
    
    // Validate email format
    if (!isValidEmail(signupEmail)) {
      setSignupError("Please enter a valid email address");
      return;
    }

    // Validate password strength
    if (!isStrongPassword(signupPassword)) {
      setSignupError("Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.");
      return;
    }

    // Validate password match
    if (signupPassword !== signupConfirmPassword) {
      setSignupError("Passwords do not match");
      return;
    }

    // Validate terms acceptance
    if (!acceptTerms) {
      setSignupError("Please accept the terms and conditions");
      return;
    }
    
    // Set loading state
    setIsSignupLoading(true);
    
    try {
      // ==================================================
      // CALL BACKEND API
      // ==================================================
      const response = await fetch(API_ENDPOINTS.SIGNUP, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: signupName,
          email: signupEmail,
          password: signupPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle error response
        setSignupError(data.message || "Signup failed. Please try again.");
        setIsSignupLoading(false);
        return;
      }

      // ==================================================
      // SUCCESS - USER CREATED IN DATABASE
      // Show success message and let user login manually
      // ==================================================
      console.log("User created successfully:", data);

      if (data.success) {
        // Show success message (user will click to go to login)
        setSignupSuccess(true);
      } else {
        setSignupError("Signup failed. Please try again.");
      }
      
      // Clear form fields
      setSignupName("");
      setSignupEmail("");
      setSignupPassword("");
      setSignupConfirmPassword("");
      setAcceptTerms(false);
      
    } catch (error) {
      // Handle network or other errors
      console.error("Signup error:", error);
      setSignupError("Failed to connect to server. Please try again.");
    } finally {
      setIsSignupLoading(false);
    }
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setIsForgotPassword(false);
  };

  // Unified Google OAuth handler - works for both new and existing users
  const handleGoogleAuth = async (credentialResponse: CredentialResponse) => {
    try {
      setIsSignupLoading(true);
      setIsLoginLoading(true);
      setSignupError("");
      setLoginError("");

      // Send credential to unified backend endpoint
      const response = await fetch(API_ENDPOINTS.GOOGLE_AUTH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          credential: credentialResponse.credential,
        }),
      });

      const data = await response.json();

      if (data.success && data.data.token) {
        // Store JWT token and user info (Google OAuth - always remember)
        authLogin(data.data.token, {
          id: data.data.user.id,
          email: data.data.user.email,
          username: data.data.user.username,
          role: data.data.user.role,
        }, true);  // Always remember for Google OAuth

        // Also update legacy context (for compatibility)
        login(
          data.data.user.username,
          data.data.user.email,
          data.data.user.role === "admin" ? "Admin" : "Tester"
        );

        // Redirect based on role
        if (data.data.user.role === "admin") {
          setLocation("/admin");
        } else {
          setLocation("/dashboard");
        }
      } else {
        const errorMsg = data.message || "Google authentication failed";
        setSignupError(errorMsg);
        setLoginError(errorMsg);
      }
    } catch (error) {
      console.error("Google auth error:", error);
      const errorMsg = "Failed to connect to server";
      setSignupError(errorMsg);
      setLoginError(errorMsg);
    } finally {
      setIsSignupLoading(false);
      setIsLoginLoading(false);
    }
  };

  const handleGoogleError = () => {
    if (isLogin) {
      setLoginError("Google login failed. Please try again.");
    } else {
      setSignupError("Google signup failed. Please try again.");
    }
  };

  // Handle Google password setup/verification submission
  const handleGooglePasswordSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (googlePassword !== googleConfirmPassword) {
      if (isLogin) {
        setLoginError("Passwords do not match");
      } else {
        setSignupError("Passwords do not match");
      }
      return;
    }

    if (googlePassword.length < 6) {
      if (isLogin) {
        setLoginError("Password must be at least 6 characters");
      } else {
        setSignupError("Password must be at least 6 characters");
      }
      return;
    }

    if (!googleUserData) return;

    try {
      setIsSignupLoading(true);
      setIsLoginLoading(true);
      setSignupError("");
      setLoginError("");

      if (isLogin) {
        // LOGIN MODE: Verify existing password
        const response = await fetch(API_ENDPOINTS.GOOGLE_VERIFY_PASSWORD, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: googleUserData.email,
            password: googlePassword,
          }),
        });

        const data = await response.json();

        if (data.success && data.data.token) {
          // Store JWT token and user info
          authLogin(data.data.token, {
            id: data.data.user.id,
            email: data.data.user.email,
            username: data.data.user.username,
            role: data.data.user.role,
          });

          // Also update legacy context (for compatibility)
          login(data.data.user.username, data.data.user.email, data.data.user.role === "admin" ? "Admin" : "Tester");
          
          // Redirect based on role
          if (data.data.user.role === "admin") {
            setLocation("/admin");
          } else {
            setLocation("/dashboard");
          }
        } else {
          setLoginError(data.message || "Invalid password. Please try again.");
        }
      } else {
        // SIGNUP MODE: Set new password
        const response = await fetch(API_ENDPOINTS.SET_PASSWORD, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: googleUserData.email,
            password: googlePassword,
          }),
        });

        const data = await response.json();

        if (data.success) {
          // Store JWT token and user info (token was already received during signup)
          authLogin(googleUserData.token, {
            id: googleUserData.id,
            email: googleUserData.email,
            username: googleUserData.name,
            role: googleUserData.role,
          });

          // Also update legacy context (for compatibility)
          login(googleUserData.name, googleUserData.email, googleUserData.role === "admin" ? "Admin" : "Tester");
          
          // Redirect based on role
          if (googleUserData.role === "Admin") {
            setLocation("/admin");
          } else {
            setLocation("/dashboard");
          }
        } else {
          setSignupError(data.message || "Failed to set password");
        }
      }
    } catch (error) {
      console.error("Password setup error:", error);
      if (isLogin) {
        setLoginError("Failed to connect to server");
      } else {
        setSignupError("Failed to connect to server");
      }
    } finally {
      setIsSignupLoading(false);
      setIsLoginLoading(false);
    }
  };

  // Google Password Setup/Verification Screen
  if (showGooglePasswordSetup && googleUserData) {
    return (
      <div className="lm-borders min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[hsl(258_100%_98%)] via-white to-[hsl(199_100%_98%)] dark:from-[hsl(252_30%_6%)] dark:via-[hsl(252_28%_8%)] dark:to-[hsl(252_30%_5%)] transition-colors">
        <ParticleBackground />
        
        <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-50">
          <ThemeToggle />
        </div>

        <div className="relative z-20 w-full max-w-lg px-4 sm:px-6 animate-in zoom-in-95 duration-300">
                  <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border border-border rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
            <div className="text-center mb-5 sm:mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/10 dark:bg-primary/20 mb-3 sm:mb-4">
                <Lock className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
                {isLogin ? "Enter Your Password" : "Set Your Password"}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm">
                {isLogin 
                  ? `Welcome back, ${googleUserData.name}! Please enter your password to continue.`
                  : `Welcome, ${googleUserData.name}! Set a password to access your account with email/password login.`
                }
              </p>
            </div>

            {signupError && !isLogin && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{signupError}</p>
              </div>
            )}

            {loginError && isLogin && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{loginError}</p>
              </div>
            )}

            <form onSubmit={handleGooglePasswordSetup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Email (from Google)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={googleUserData.email}
                    disabled
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-100/50 dark:bg-slate-800/50 backdrop-blur-sm border border-border rounded-xl text-slate-500 dark:text-slate-400 cursor-not-allowed opacity-70"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {isLogin ? "Password" : "Create Password"}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showGooglePassword ? "text" : "password"}
                    value={googlePassword}
                    onChange={(e) => setGooglePassword(e.target.value)}
                    placeholder={isLogin ? "Enter your password" : "Enter password (min 6 characters)"}
                    className="w-full pl-10 pr-12 py-2.5 bg-slate-50 dark:bg-slate-900/50 backdrop-blur-sm border border-border rounded-xl focus:outline-none focus:border-primary dark:focus:border-primary focus:ring-2 focus:ring-primary/25 text-slate-900 dark:text-white transition-all duration-300"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGooglePassword(!showGooglePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showGooglePassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showGoogleConfirmPassword ? "text" : "password"}
                    value={googleConfirmPassword}
                    onChange={(e) => setGoogleConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-10 pr-12 py-2.5 bg-slate-50 dark:bg-slate-900/50 backdrop-blur-sm border border-border rounded-xl focus:outline-none focus:border-primary dark:focus:border-primary focus:ring-2 focus:ring-primary/25 text-slate-900 dark:text-white transition-all duration-300"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowGoogleConfirmPassword(!showGoogleConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showGoogleConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSignupLoading || isLoginLoading}
                className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-primary-foreground font-semibold rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--primary)/0.45)] flex items-center justify-center gap-2 mt-6"
              >
                {(isSignupLoading || isLoginLoading) ? (
                  <>
                    <span className="animate-spin"></span> 
                    {isLogin ? "VERIFYING..." : "SETTING PASSWORD..."}
                  </>
                ) : (
                  <>
                    {isLogin ? "LOGIN" : "CONTINUE TO DASHBOARD"} <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (signupSuccess) {
    return (
      <div className="lm-borders min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[hsl(258_100%_98%)] via-white to-[hsl(199_100%_98%)] dark:from-[hsl(252_30%_6%)] dark:via-[hsl(252_28%_8%)] dark:to-[hsl(252_30%_5%)] transition-colors">
        <ParticleBackground />
        
        <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-50">
          <ThemeToggle />
        </div>

        <div className="relative z-20 w-full max-w-lg px-4 sm:px-6 animate-in zoom-in-95 duration-300">
          <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border border-border rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-6 sm:p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-accent/10 pointer-events-none" />
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-green-100 dark:bg-green-500/20 mb-5 sm:mb-6">
              <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">Account Created Successfully!</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base mb-5 sm:mb-6">
              Your account has been created successfully!<br />
              Please click below to go to the login page and enter your credentials to sign in.
            </p>
            <Button 
              onClick={() => {
                setSignupSuccess(false);
                setIsLogin(true);
              }}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Go to Login Page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lm-borders min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[hsl(258_100%_98%)] via-white to-[hsl(199_100%_98%)] dark:from-[hsl(252_30%_6%)] dark:via-[hsl(252_28%_8%)] dark:to-[hsl(252_30%_5%)] transition-colors">
      <ParticleBackground />
      
      <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-50">
        <ThemeToggle />
      </div>

      <Link href="/">
        <Button variant="ghost" size="icon" className="absolute top-4 sm:top-6 left-4 sm:left-6 z-50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-full">
          <X className="w-5 h-5 sm:w-6 sm:h-6" />
        </Button>
      </Link>

      <div className="relative z-20 w-full max-w-lg px-4 sm:px-6 animate-in zoom-in-95 duration-300">
        <div className="text-center mb-6 sm:mb-8">
          <img
            src="/logo.png"
            alt="TESTHUB"
            className="w-20 h-20 object-contain mx-auto mb-4 sm:mb-6 drop-shadow-[0_0_18px_hsl(var(--primary)/0.55)]"
          />
          <h1 className="font-display text-3xl sm:text-4xl font-bold mb-1 tracking-tight">
            <span className="text-gradient">TESTHUB</span>
          </h1>
          <p className="font-mono text-[10px] sm:text-xs uppercase tracking-[0.25em] text-muted-foreground">Automated Testing Platform</p>
        </div>

                <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border border-border rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
          
          {isForgotPassword ? (
            <>
              <div className="flex gap-2 mb-8">
                <button 
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-transparent dark:border-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-300"
                  onClick={() => setIsForgotPassword(false)}
                >
                  Login
                </button>
                <button 
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-transparent dark:border-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-300"
                >
                  Sign Up
                </button>
              </div>

              <div className="space-y-5 sm:space-y-6">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">Reset Password</h2>
                  <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm">Enter your email address and we'll send you a reset link</p>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" />
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="user@thex.com"
                        className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl focus:outline-none focus:border-primary dark:focus:border-primary focus:ring-2 focus:ring-primary/25 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-slate-50 dark:bg-slate-900/50 backdrop-blur-sm transition-all duration-300"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--primary)/0.45)] flex items-center justify-center gap-2"
                  >
                    SEND RESET LINK <ArrowRight className="w-4 h-4" />
                  </button>
                </form>

                <button
                  onClick={() => setIsForgotPassword(false)}
                  className="w-full text-center text-primary hover:text-primary/80 text-sm font-medium"
                >
                  Back to Login
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2 sm:gap-3 mb-6 sm:mb-8">
                <button 
                  onClick={() => setIsLogin(true)}
                  className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300 ${
                    isLogin 
                      ? 'bg-primary text-primary-foreground shadow-[0_0_15px_hsl(var(--primary)/0.45)]' 
                      : 'bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent dark:border-slate-700/50'
                  }`}
                >
                  Login
                </button>
                <button 
                  onClick={() => setIsLogin(false)}
                  className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300 ${
                    !isLogin 
                      ? 'bg-primary text-primary-foreground shadow-[0_0_15px_hsl(var(--primary)/0.45)]' 
                      : 'bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent dark:border-slate-700/50'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              {isLogin ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  {loginError && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 shadow-sm duration-300 animate-in fade-in slide-in-from-top-1">
                      <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <p className="text-sm font-medium">{loginError}</p>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" />
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="user@thex.com"
                        className={`w-full pl-10 pr-10 py-2.5 border rounded-xl focus:outline-none focus:ring-2 ${fieldStateClass(loginEmail, isValidEmail(loginEmail))} text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-slate-50 dark:bg-slate-900/50 backdrop-blur-sm transition-all duration-300`}
                        required
                      />
                      {loginEmail && (isValidEmail(loginEmail)
                        ? <CheckCircle2 className="absolute right-3 top-3.5 w-5 h-5 text-emerald-500" />
                        : <XCircle className="absolute right-3 top-3.5 w-5 h-5 text-red-500" />)}
                    </div>
                    {loginEmail && !isValidEmail(loginEmail) && (
                      <p className="text-xs text-red-500 mt-1">Please enter a valid email address</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full pl-10 pr-10 py-2.5 border border-border rounded-xl focus:outline-none focus:border-primary dark:focus:border-primary focus:ring-2 focus:ring-primary/25 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-slate-50 dark:bg-slate-900/50 backdrop-blur-sm transition-all duration-300"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 border border-border rounded cursor-pointer dark:bg-slate-800"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">Remember Me</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsForgotPassword(true)}
                      className="text-sm text-primary hover:text-primary/80 font-medium"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoginLoading}
                    className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-primary-foreground font-semibold rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--primary)/0.45)] flex items-center justify-center gap-2 mt-6"
                  >
                    {isLoginLoading ? (
                      <>
                        <span className="animate-spin"></span> LOGGING IN...
                      </>
                    ) : (
                      <>
                        LOGIN <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSignup} className="space-y-4">
                  {signupError && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 shadow-sm duration-300 animate-in fade-in slide-in-from-top-1">
                      <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <p className="text-sm font-medium">{signupError}</p>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Full Name</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-4 py-2.5 border border-border rounded-xl focus:outline-none focus:border-primary dark:focus:border-primary focus:ring-2 focus:ring-primary/25 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-slate-50 dark:bg-slate-900/50 backdrop-blur-sm transition-all duration-300"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" />
                      <input
                        type="email"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        placeholder="john@company.com"
                        className={`w-full pl-10 pr-10 py-2.5 border rounded-xl focus:outline-none focus:ring-2 ${fieldStateClass(signupEmail, isValidEmail(signupEmail))} text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-slate-50 dark:bg-slate-900/50 backdrop-blur-sm transition-all duration-300`}
                        required
                      />
                      {signupEmail && (isValidEmail(signupEmail)
                        ? <CheckCircle2 className="absolute right-3 top-3.5 w-5 h-5 text-emerald-500" />
                        : <XCircle className="absolute right-3 top-3.5 w-5 h-5 text-red-500" />)}
                    </div>
                    {signupEmail && !isValidEmail(signupEmail) && (
                      <p className="text-xs text-red-500 mt-1">Please enter a valid email address</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        placeholder="Create a password"
                        className={`w-full pl-10 pr-10 py-2.5 border rounded-xl focus:outline-none focus:ring-2 ${fieldStateClass(signupPassword, isStrongPassword(signupPassword))} text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-slate-50 dark:bg-slate-900/50 backdrop-blur-sm transition-all duration-300`}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {signupPassword && (
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                        {[
                          { ok: signupPwChecks.length, label: "At least 8 characters" },
                          { ok: signupPwChecks.upper, label: "One uppercase letter" },
                          { ok: signupPwChecks.lower, label: "One lowercase letter" },
                          { ok: signupPwChecks.digit, label: "One number" },
                          { ok: signupPwChecks.special, label: "One special character" },
                        ].map((r) => (
                          <span
                            key={r.label}
                            className={`flex items-center gap-1.5 text-xs transition-colors ${
                              r.ok ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />}
                            {r.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={signupConfirmPassword}
                        onChange={(e) => setSignupConfirmPassword(e.target.value)}
                        placeholder="Confirm your password"
                        className="w-full pl-10 pr-10 py-2.5 border border-border rounded-xl focus:outline-none focus:border-primary dark:focus:border-primary focus:ring-2 focus:ring-primary/25 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-slate-50 dark:bg-slate-900/50 backdrop-blur-sm transition-all duration-300"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-3.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {signupPassword && signupConfirmPassword && signupPassword !== signupConfirmPassword && (
                      <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                    )}
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer pt-2">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      className="w-4 h-4 border border-border rounded cursor-pointer mt-1 dark:bg-slate-800"
                      required
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      I accept the <a href="#" className="text-primary hover:text-primary/80 font-medium">Terms & Conditions</a> and <a href="#" className="text-primary hover:text-primary/80 font-medium">Privacy Policy</a>
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={signupPassword !== signupConfirmPassword || !isStrongPassword(signupPassword) || !isValidEmail(signupEmail) || isSignupLoading}
                    className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-primary-foreground font-semibold rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--primary)/0.45)] flex items-center justify-center gap-2 mt-6"
                  >
                    {isSignupLoading ? (
                      <>
                        <span className="animate-spin"></span> CREATING ACCOUNT...
                      </>
                    ) : (
                      <>
                        SIGN UP <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  
                  <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-2">
                    Account will be created with role: Tester
                  </p>
                </form>
              )}

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white dark:bg-slate-900 px-2 text-xs text-slate-500 dark:text-slate-400 font-medium uppercase">
                    OR CONTINUE WITH
                  </span>
                </div>
              </div>

              <div className="w-full">
                <GoogleLogin
                  onSuccess={handleGoogleAuth}
                  onError={handleGoogleError}
                  useOneTap={false}
                  theme="outline"
                  size="large"
                  width="100%"
                  text="continue_with"
                />
              </div>
            </>
          )}
        </div>

        <p className="text-center mt-6 text-slate-600 dark:text-slate-400 text-xs">
          v1.0.0 | Secured Infrastructure
        </p>
      </div>
    </div>
  );
}
