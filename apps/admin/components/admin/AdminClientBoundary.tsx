"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface AdminClientBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface AdminClientBoundaryState {
  hasError: boolean;
}

export class AdminClientBoundary extends Component<
  AdminClientBoundaryProps,
  AdminClientBoundaryState
> {
  state: AdminClientBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AdminClientBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.name ?? "Admin client component"} crashed`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }

    return this.props.children;
  }
}
