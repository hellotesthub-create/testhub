import { Switch, Route } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProvider } from "@/lib/userContext";
import { AuthProvider } from "@/lib/authContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PublicRoute } from "@/components/PublicRoute";
import NotFound from "@/pages/not-found";

import LandingPage from "@/pages/landing";
import AuthPage from "@/pages/auth";
import ResetPasswordPage from "@/pages/reset-password";
import TesterDashboard from "@/pages/tester-dashboard";
import TestLab from "@/pages/test-lab";
import ExecutionMonitor from "@/pages/execution-monitor";
import Reports from "@/pages/reports";
import Profile from "@/pages/profile";
import TesterTestResults from "@/pages/tester-test-results";
import TesterDiagnosis from "@/pages/tester-diagnosis";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/auth">
        <PublicRoute>
          <AuthPage />
        </PublicRoute>
      </Route>
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/dashboard">
        <ProtectedRoute>
          <TesterDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/tester/test-results/:id">
        <ProtectedRoute>
          <TesterTestResults />
        </ProtectedRoute>
      </Route>
      <Route path="/tester/test-results/:runId/diagnosis/:resultId">
        <ProtectedRoute>
          <TesterDiagnosis />
        </ProtectedRoute>
      </Route>
      <Route path="/test-lab">
        <ProtectedRoute>
          <TestLab />
        </ProtectedRoute>
      </Route>
      <Route path="/monitor">
        <ProtectedRoute>
          <ExecutionMonitor />
        </ProtectedRoute>
      </Route>
      <Route path="/history">
        <ProtectedRoute>
          <Reports />
        </ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") || "light";
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UserProvider>
          <TooltipProvider>
            <Toaster />
            <SonnerToaster richColors closeButton position="top-center" />
            <Router />
          </TooltipProvider>
        </UserProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
