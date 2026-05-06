import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AdminAnalytics() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/admin/transactions"); }, []);
  return null;
}
