import { createConnectQueryKey, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import React, { createContext, useContext } from "react";

import { userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import type { UserInfoResponse } from "@/gen/api/v1/user_pb";

export interface AuthState {
  isAuthenticated: boolean;
  user: UserInfoResponse | null;
  setUserData: (user: UserInfoResponse) => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const userInfoKey = createConnectQueryKey({
  schema: userInfo,
  cardinality: "finite",
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // Restore auth state on app load
  const { data, status } = useQuery(userInfo, undefined, {
    retry: false,
    throwOnError: false,
  });

  const user = data ?? null;
  const isAuthenticated = status === "success";
  const isLoading = status === "pending";

  // Show loading state while checking auth
  //if (isLoading) {
  //  return (
  //    <div className="flex items-center justify-center min-h-screen">
  //      Loading...
  //    </div>
  //  );
  //}

  const setUserData = (user: UserInfoResponse) => {
    queryClient.setQueryData(userInfoKey, user);
    queryClient.invalidateQueries({
      queryKey: userInfoKey,
    });
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, setUserData }}>
      {isLoading ? null : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
